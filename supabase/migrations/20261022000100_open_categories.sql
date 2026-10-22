-- Product categories are no longer a fixed list: Admin can add one from the
-- product form (+ New category) or Side menu → SHOP. Any non-empty key.

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

alter table products add constraint products_category_check check (btrim(category) <> '');
