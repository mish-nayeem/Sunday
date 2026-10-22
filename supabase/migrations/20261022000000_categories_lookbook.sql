-- More product categories (bags, belts, caps, shoes, jackets, jeans,
-- accessories) so a whole look — shirt, trousers, bag, belt — can be sold
-- and tagged. Replaces the old fixed list on products.category.

do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'products' and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table products drop constraint %I', c.conname);
  end loop;
end $$;

alter table products add constraint products_category_check check (category in (
  'full_sleeve_shirts', 'half_sleeve_shirts', 'formal_shirts',
  'polo', 't_shirts', 'cargo', 'formal_pants',
  'jeans', 'jackets', 'bags', 'belts', 'caps', 'shoes', 'accessories'
));

-- EXPLORE now opens a drop's lookbook: rows saved pointing at the drop's
-- shop page move to its lookbook (same drop, already URL-encoded).
update nav_categories
   set link = '/lookbook/' || substring(link from length('/shop?drop=') + 1)
 where menu = 'drops' and link like '/shop?drop=%' and link not like '%&%';

-- The demo drop section's photos become its demo looks, so tapping one
-- opens the look with its products (as new sections do).
update home_features f
   set pics = (select jsonb_agg(jsonb_build_object('url', l.image_url, 'look_id', l.id) order by l.sort_order)
                 from lookbook_looks l where l.drop_name = 'DEMO DROP 01')
 where f.drop_name = 'DEMO DROP 01'
   and f.pics::text not like '%look_id%'
   and exists (select 1 from lookbook_looks l where l.drop_name = 'DEMO DROP 01');
