-- ===========================================================================
-- Demo catalog: 13 products, 3 lookbook photos and a sale, so the shop
-- shows every part of its layout before the real catalog is in.
-- ===========================================================================
-- Everything here is marked so it can all go in one go:
--   products       sku 'DEMO-…' (and drop 'DEMO DROP 01')
--   lookbook_looks drop_name 'DEMO DROP 01'
--   sales          name 'Demo sale'
-- Photos are drawn illustrations in public/demo/ (served with the site).
--
-- To remove it all later, run (or add as a migration):
--   delete from lookbook_looks where drop_name = 'DEMO DROP 01';
--   delete from sales where name = 'Demo sale';
--   delete from products where sku like 'DEMO-%';
--
-- Safe to run twice: rows with these ids are left as they are.

begin;

insert into products (
  id, name, slug, category, price, cost_price, quantity, size_stock, sku,
  description, details, images, sizes, stock_status, is_new_arrival, is_best_seller,
  variant, drop_name, size_chart, colour_group, care_instructions
) values
  ('d0000000-0000-4000-8000-000000000001', 'Oxford button-down shirt', 'demo-oxford-white', 'full_sleeve_shirts', 2450, 1225, 25, '{"S": 4, "M": 5, "L": 6, "XL": 7, "XXL": 3}', 'DEMO-01', 'A soft cotton oxford with a button-down collar, cut straight with a little room.', '100% cotton oxford
Button-down collar
Chest pocket
Curved hem', array['/demo/oxford-white-1.jpg','/demo/oxford-white-2.jpg','/demo/oxford-white-3.jpg','/demo/oxford-white-4.jpg'], array['S','M','L','XL','XXL'], 'in_stock', true, false, 'White', 'DEMO DROP 01', '{"columns":["S","M","L","XL","XXL"],"rows":[{"label":"Chest","values":["38","40","42","44","46"]},{"label":"Length","values":["27","28","29","30","31"]},{"label":"Shoulder","values":["17","17.5","18","18.5","19"]}],"notes":["Measured flat, in inches."]}', 'demo-oxford', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000002', 'Oxford button-down shirt', 'demo-oxford-sky', 'full_sleeve_shirts', 2450, 1225, 19, '{"S": 5, "M": 0, "L": 7, "XL": 3, "XXL": 4}', 'DEMO-02', 'A soft cotton oxford with a button-down collar, cut straight with a little room.', '100% cotton oxford
Button-down collar
Chest pocket
Curved hem', array['/demo/oxford-sky-1.jpg','/demo/oxford-sky-2.jpg','/demo/oxford-sky-3.jpg','/demo/oxford-sky-4.jpg'], array['S','M','L','XL','XXL'], 'in_stock', true, true, 'Sky', 'DEMO DROP 01', '{"columns":["S","M","L","XL","XXL"],"rows":[{"label":"Chest","values":["38","40","42","44","46"]},{"label":"Length","values":["27","28","29","30","31"]},{"label":"Shoulder","values":["17","17.5","18","18.5","19"]}],"notes":["Measured flat, in inches."]}', 'demo-oxford', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000003', 'Linen camp collar shirt', 'demo-camp-rust', 'half_sleeve_shirts', 2250, 1125, 25, '{"S": 6, "M": 7, "L": 3, "XL": 4, "XXL": 5}', 'DEMO-03', 'Light linen with an open camp collar, made for hot days.', '100% linen
Camp collar
Straight hem, wear it out', array['/demo/camp-rust-1.jpg','/demo/camp-rust-2.jpg','/demo/camp-rust-3.jpg','/demo/camp-rust-4.jpg'], array['S','M','L','XL','XXL'], 'in_stock', true, false, 'Rust', 'DEMO DROP 01', '{"columns":["S","M","L","XL","XXL"],"rows":[{"label":"Chest","values":["38","40","42","44","46"]},{"label":"Length","values":["27","28","29","30","31"]},{"label":"Shoulder","values":["17","17.5","18","18.5","19"]}],"notes":["Measured flat, in inches."]}', 'demo-camp', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000004', 'Linen camp collar shirt', 'demo-camp-stone', 'half_sleeve_shirts', 2250, 1125, 25, '{"S": 7, "M": 3, "L": 4, "XL": 5, "XXL": 6}', 'DEMO-04', 'Light linen with an open camp collar, made for hot days.', '100% linen
Camp collar
Straight hem, wear it out', array['/demo/camp-stone-1.jpg','/demo/camp-stone-2.jpg','/demo/camp-stone-3.jpg','/demo/camp-stone-4.jpg'], array['S','M','L','XL','XXL'], 'in_stock', false, false, 'Stone', 'DEMO DROP 01', '{"columns":["S","M","L","XL","XXL"],"rows":[{"label":"Chest","values":["38","40","42","44","46"]},{"label":"Length","values":["27","28","29","30","31"]},{"label":"Shoulder","values":["17","17.5","18","18.5","19"]}],"notes":["Measured flat, in inches."]}', 'demo-camp', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000005', 'Poplin formal shirt', 'demo-poplin-white', 'formal_shirts', 2650, 1325, 25, '{"S": 3, "M": 4, "L": 5, "XL": 6, "XXL": 7}', 'DEMO-05', 'Crisp cotton poplin with a semi-spread collar for office days.', '100% cotton poplin
Semi-spread collar
Single-button cuffs', array['/demo/poplin-white-1.jpg','/demo/poplin-white-2.jpg','/demo/poplin-white-3.jpg','/demo/poplin-white-4.jpg'], array['S','M','L','XL','XXL'], 'in_stock', false, false, 'White', 'DEMO DROP 01', '{"columns":["S","M","L","XL","XXL"],"rows":[{"label":"Chest","values":["38","40","42","44","46"]},{"label":"Length","values":["27","28","29","30","31"]},{"label":"Shoulder","values":["17","17.5","18","18.5","19"]}],"notes":["Measured flat, in inches."]}', null, 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000006', 'Piqué polo', 'demo-polo-navy', 'polo', 1850, 925, 25, '{"S": 4, "M": 5, "L": 6, "XL": 7, "XXL": 3}', 'DEMO-06', 'A classic three-button polo in breathable cotton piqué.', '100% cotton piqué
Three-button placket
Ribbed collar and cuffs', array['/demo/polo-navy-1.jpg','/demo/polo-navy-2.jpg','/demo/polo-navy-3.jpg','/demo/polo-navy-4.jpg'], array['S','M','L','XL','XXL'], 'in_stock', false, true, 'Navy', 'DEMO DROP 01', '{"columns":["S","M","L","XL","XXL"],"rows":[{"label":"Chest","values":["38","40","42","44","46"]},{"label":"Length","values":["27","28","29","30","31"]},{"label":"Shoulder","values":["17","17.5","18","18.5","19"]}],"notes":["Measured flat, in inches."]}', 'demo-polo', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000007', 'Piqué polo', 'demo-polo-olive', 'polo', 1850, 925, 25, '{"S": 5, "M": 6, "L": 7, "XL": 3, "XXL": 4}', 'DEMO-07', 'A classic three-button polo in breathable cotton piqué.', '100% cotton piqué
Three-button placket
Ribbed collar and cuffs', array['/demo/polo-olive-1.jpg','/demo/polo-olive-2.jpg','/demo/polo-olive-3.jpg','/demo/polo-olive-4.jpg'], array['S','M','L','XL','XXL'], 'in_stock', true, false, 'Olive', 'DEMO DROP 01', '{"columns":["S","M","L","XL","XXL"],"rows":[{"label":"Chest","values":["38","40","42","44","46"]},{"label":"Length","values":["27","28","29","30","31"]},{"label":"Shoulder","values":["17","17.5","18","18.5","19"]}],"notes":["Measured flat, in inches."]}', 'demo-polo', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000008', 'Heavyweight tee', 'demo-tee-black', 't_shirts', 1290, 645, 18, '{"S": 6, "M": 0, "L": 3, "XL": 4, "XXL": 5}', 'DEMO-08', 'A thick 240 gsm cotton tee that keeps its shape wash after wash.', '240 gsm cotton jersey
Ribbed crew neck
Boxy fit', array['/demo/tee-black-1.jpg','/demo/tee-black-2.jpg','/demo/tee-black-3.jpg','/demo/tee-black-4.jpg'], array['S','M','L','XL','XXL'], 'in_stock', false, true, 'Black', 'DEMO DROP 01', '{"columns":["S","M","L","XL","XXL"],"rows":[{"label":"Chest","values":["38","40","42","44","46"]},{"label":"Length","values":["27","28","29","30","31"]},{"label":"Shoulder","values":["17","17.5","18","18.5","19"]}],"notes":["Measured flat, in inches."]}', 'demo-tee', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000009', 'Heavyweight tee', 'demo-tee-white', 't_shirts', 1290, 645, 25, '{"S": 7, "M": 3, "L": 4, "XL": 5, "XXL": 6}', 'DEMO-09', 'A thick 240 gsm cotton tee that keeps its shape wash after wash.', '240 gsm cotton jersey
Ribbed crew neck
Boxy fit', array['/demo/tee-white-1.jpg','/demo/tee-white-2.jpg','/demo/tee-white-3.jpg','/demo/tee-white-4.jpg'], array['S','M','L','XL','XXL'], 'in_stock', false, true, 'White', 'DEMO DROP 01', '{"columns":["S","M","L","XL","XXL"],"rows":[{"label":"Chest","values":["38","40","42","44","46"]},{"label":"Length","values":["27","28","29","30","31"]},{"label":"Shoulder","values":["17","17.5","18","18.5","19"]}],"notes":["Measured flat, in inches."]}', 'demo-tee', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000010', 'Heavyweight tee', 'demo-tee-stone', 't_shirts', 1290, 645, 25, '{"S": 3, "M": 4, "L": 5, "XL": 6, "XXL": 7}', 'DEMO-10', 'A thick 240 gsm cotton tee that keeps its shape wash after wash.', '240 gsm cotton jersey
Ribbed crew neck
Boxy fit', array['/demo/tee-stone-1.jpg','/demo/tee-stone-2.jpg','/demo/tee-stone-3.jpg','/demo/tee-stone-4.jpg'], array['S','M','L','XL','XXL'], 'in_stock', true, false, 'Stone', 'DEMO DROP 01', '{"columns":["S","M","L","XL","XXL"],"rows":[{"label":"Chest","values":["38","40","42","44","46"]},{"label":"Length","values":["27","28","29","30","31"]},{"label":"Shoulder","values":["17","17.5","18","18.5","19"]}],"notes":["Measured flat, in inches."]}', 'demo-tee', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000011', 'Pleated trousers', 'demo-pleat-stone', 'formal_pants', 2950, 1475, 17, '{"30": 4, "32": 0, "34": 6, "36": 7}', 'DEMO-11', 'Single-pleat trousers in a cotton twill, with a relaxed straight leg.', 'Cotton twill
Single pleat
Side and back pockets', array['/demo/pleat-stone-1.jpg','/demo/pleat-stone-2.jpg','/demo/pleat-stone-3.jpg','/demo/pleat-stone-4.jpg'], array['30','32','34','36'], 'in_stock', true, false, 'Stone', 'DEMO DROP 01', '{"columns":["30","32","34","36"],"rows":[{"label":"Waist","values":["30","32","34","36"]},{"label":"Inseam","values":["30","30","31","31"]},{"label":"Leg opening","values":["8","8.25","8.5","8.75"]}],"notes":["Measured flat, in inches."]}', 'demo-pleat', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000012', 'Pleated trousers', 'demo-pleat-navy', 'formal_pants', 2950, 1475, 21, '{"30": 5, "32": 6, "34": 7, "36": 3}', 'DEMO-12', 'Single-pleat trousers in a cotton twill, with a relaxed straight leg.', 'Cotton twill
Single pleat
Side and back pockets', array['/demo/pleat-navy-1.jpg','/demo/pleat-navy-2.jpg','/demo/pleat-navy-3.jpg','/demo/pleat-navy-4.jpg'], array['30','32','34','36'], 'in_stock', false, false, 'Navy', 'DEMO DROP 01', '{"columns":["30","32","34","36"],"rows":[{"label":"Waist","values":["30","32","34","36"]},{"label":"Inseam","values":["30","30","31","31"]},{"label":"Leg opening","values":["8","8.25","8.5","8.75"]}],"notes":["Measured flat, in inches."]}', 'demo-pleat', 'Machine wash cold, dry in shade.'),
  ('d0000000-0000-4000-8000-000000000013', 'Utility cargo trousers', 'demo-cargo-olive', 'cargo', 2750, 1375, 20, '{"30": 6, "32": 7, "34": 3, "36": 4}', 'DEMO-13', 'Sturdy cotton ripstop cargos with flap pockets on both legs.', 'Cotton ripstop
Two cargo pockets
Adjustable hem', array['/demo/cargo-olive-1.jpg','/demo/cargo-olive-2.jpg','/demo/cargo-olive-3.jpg','/demo/cargo-olive-4.jpg'], array['30','32','34','36'], 'in_stock', true, false, 'Olive', 'DEMO DROP 01', '{"columns":["30","32","34","36"],"rows":[{"label":"Waist","values":["30","32","34","36"]},{"label":"Inseam","values":["30","30","31","31"]},{"label":"Leg opening","values":["8","8.25","8.5","8.75"]}],"notes":["Measured flat, in inches."]}', null, 'Machine wash cold, dry in shade.')
on conflict (id) do nothing;

insert into lookbook_looks (drop_name, image_url, title, product_ids, sort_order)
select v.drop_name, v.image_url, v.title, v.product_ids, v.sort_order
from (values
  ('DEMO DROP 01', '/demo/look-1.jpg', 'Oxford and pleats', array['d0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000011'], 0),
  ('DEMO DROP 01', '/demo/look-2.jpg', 'Tee and cargos', array['d0000000-0000-4000-8000-000000000008','d0000000-0000-4000-8000-000000000013'], 1),
  ('DEMO DROP 01', '/demo/look-3.jpg', 'Linen for a hot day', array['d0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000012'], 2)
) as v(drop_name, image_url, title, product_ids, sort_order)
where not exists (select 1 from lookbook_looks l where l.image_url = v.image_url);

insert into sales (name, percent, product_ids, starts_at, ends_at)
select 'Demo sale', 15,
       array['d0000000-0000-4000-8000-000000000006','d0000000-0000-4000-8000-000000000007'],
       now(), now() + interval '30 days'
where not exists (select 1 from sales where name = 'Demo sale');

commit;
