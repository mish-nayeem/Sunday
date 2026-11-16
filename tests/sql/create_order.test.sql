-- create_order: what the shop's checkout calls. Runs on the throwaway
-- database tests/sql/run.sh builds from supabase/migrations — never live.
-- Each check raises an exception when it fails, which fails the run.
\set ON_ERROR_STOP on

set request.headers = '{"x-forwarded-for": "203.0.113.7"}';

insert into public.products (id, name, slug, category, price, description, sizes, size_stock, hidden)
values
  ('11111111-1111-1111-1111-111111111111', 'Test Shirt', 'test-shirt', 'shirts', 1500, 'A test shirt.', '{M,L}', '{"M": 3, "L": 0}', false),
  ('22222222-2222-2222-2222-222222222222', 'Hidden Shirt', 'hidden-shirt', 'shirts', 1000, 'Hidden.', '{M}', '{"M": 5}', true);

do $$
declare
  r record;
  o record;
  ok boolean;
begin
  -- Dhaka: Tk 80 delivery, cash on delivery, priced from the table (the
  -- browser sends no price).
  select * into r from public.create_order('Test Shopper', 'a@example.com', '01711111111', 'House 1', 'Dhaka', 'Dhanmondi', null,
    '[{"product_id": "11111111-1111-1111-1111-111111111111", "size": "M", "quantity": 1, "price": 1}]', 'cod');
  if r.subtotal <> 1500 or r.delivery_charge <> 80 or r.total <> 1580 then
    raise exception 'Dhaka order: got % + % = %', r.subtotal, r.delivery_charge, r.total;
  end if;
  -- SND- and 10 random digits; the invoice carries the same digits.
  if r.order_id !~ '^SND-[0-9]{10}$' then raise exception 'order number %', r.order_id; end if;
  if r.invoice_number <> 'SND-' || to_char(now(), 'YYYY') || '-' || substr(r.order_id, 5) then
    raise exception 'invoice number % for %', r.invoice_number, r.order_id;
  end if;
  select * into o from public.orders where order_id = r.order_id;
  if o.payment_method <> 'cod' or o.advance_amount <> 0 or o.mobile <> '01711111111' then
    raise exception 'Dhaka order saved as % / % / %', o.payment_method, o.advance_amount, o.mobile;
  end if;
  -- The piece left the shelf.
  if (select (size_stock ->> 'M')::int from public.products where id = '11111111-1111-1111-1111-111111111111') <> 2 then
    raise exception 'stock not taken';
  end if;

  -- Outside Dhaka: Tk 150, and Tk 200 by bKash up front even if "cod" is asked.
  select * into r from public.create_order('Test Shopper', 'a@example.com', '01711111112', 'House 2', 'Sylhet', 'Zindabazar', null,
    '[{"product_id": "11111111-1111-1111-1111-111111111111", "size": "M", "quantity": 1}]', 'cod', 'TRX12345AB');
  select * into o from public.orders where order_id = r.order_id;
  if r.delivery_charge <> 150 or r.total <> 1650 or o.advance_amount <> 200 or o.payment_method <> 'bkash_advance' then
    raise exception 'outside Dhaka: % / % / advance % / %', r.delivery_charge, r.total, o.advance_amount, o.payment_method;
  end if;

  -- A sold-out size is refused.
  begin
    perform public.create_order('T', 'a@example.com', '01711111113', 'H', 'Dhaka', 'A', null,
      '[{"product_id": "11111111-1111-1111-1111-111111111111", "size": "L", "quantity": 1}]', 'cod');
    raise exception 'sold-out size was accepted';
  exception when others then
    if sqlerrm not like 'SOLD_OUT:%' then raise; end if;
  end;

  -- More than 20 of one line is refused.
  begin
    perform public.create_order('T', 'a@example.com', '01711111114', 'H', 'Dhaka', 'A', null,
      '[{"product_id": "11111111-1111-1111-1111-111111111111", "size": "M", "quantity": 21}]', 'cod');
    raise exception '21 pieces were accepted';
  exception when others then
    if sqlerrm not like 'Invalid quantity%' then raise; end if;
  end;

  -- A hidden product can't be ordered, even by its id.
  ok := false;
  begin
    perform public.create_order('T', 'a@example.com', '01711111115', 'H', 'Dhaka', 'A', null,
      '[{"product_id": "22222222-2222-2222-2222-222222222222", "size": "M", "quantity": 1}]', 'cod');
  exception when others then
    ok := true;
  end;
  if not ok then raise exception 'a hidden product was ordered'; end if;

  -- Not a Bangladeshi mobile number: refused.
  begin
    perform public.create_order('T', 'a@example.com', '12345', 'H', 'Dhaka', 'A', null,
      '[{"product_id": "11111111-1111-1111-1111-111111111111", "size": "M", "quantity": 1}]', 'cod');
    raise exception 'a bad phone was accepted';
  exception when others then
    if sqlerrm not like 'INVALID_PHONE%' then raise; end if;
  end;

  raise notice 'create_order: all checks passed';
end
$$;
