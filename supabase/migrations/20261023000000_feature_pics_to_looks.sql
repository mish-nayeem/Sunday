-- Homepage drop-section photos added before they became looks (a bare photo,
-- or one linked to a single product) become looks in the drop's lookbook,
-- so every photo opens the lookbook. A linked product is tagged in the look.

do $$
declare
  f record;
  pic jsonb;
  out jsonb;
  new_id bigint;
  pos int;
begin
  for f in select id, drop_name, pics from home_features where pics::text <> '[]' loop
    out := '[]'::jsonb;
    for pic in select * from jsonb_array_elements(f.pics) loop
      if pic ? 'look_id' and pic->>'look_id' is not null then
        out := out || jsonb_build_array(pic);
      else
        select coalesce(max(sort_order), 0) + 1 into pos from lookbook_looks where drop_name = f.drop_name;
        insert into lookbook_looks (drop_name, image_url, product_ids, sort_order)
        values (
          f.drop_name,
          pic->>'url',
          case when coalesce(pic->>'product_id', '') <> '' then array[pic->>'product_id'] else '{}'::text[] end,
          pos
        )
        returning id into new_id;
        out := out || jsonb_build_array(jsonb_build_object('url', pic->>'url', 'look_id', new_id));
      end if;
    end loop;
    update home_features set pics = out where id = f.id;
  end loop;
end $$;
