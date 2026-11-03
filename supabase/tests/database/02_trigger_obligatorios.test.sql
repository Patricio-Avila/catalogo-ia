-- RF-11: cada categoría declara atributos de contexto obligatorios; un producto
-- sin ellos es rechazado al cargarse. También se rechaza un tipo distinto al declarado.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_trigger('catalogo', 'producto', 'producto_verificar', 'existe el trigger de verificación');

select throws_ok(
  $$ insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos)
     values ('belleza', 'cuidado_facial', 'p', 'Marca A', 100, 'd', '{"contenido_ml": 50}') $$,
  '23514', null, 'rechaza un producto sin atributos de contexto');

select throws_matching(
  $$ insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos)
     values ('belleza', 'cuidado_facial', 'p', 'Marca A', 100, 'd', '{"uso_previsto": "hidratar", "zona_aplicacion": "rostro", "apto_consumo": false}') $$,
  'obligatorios.*clase_riesgo', 'el mensaje nombra el atributo que falta');

select lives_ok(
  $$ insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos)
     values ('belleza', 'cuidado_facial', 'p', 'Marca A', 100, 'd',
             '{"uso_previsto": "hidratar", "zona_aplicacion": "rostro", "clase_riesgo": "ninguno", "apto_consumo": false}') $$,
  'acepta un producto con todo el contexto y sin técnicos');

select throws_matching(
  $$ insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos)
     values ('belleza', 'cuidado_facial', 'p', 'Marca A', 100, 'd',
             '{"uso_previsto": 7, "zona_aplicacion": "rostro", "clase_riesgo": "ninguno", "apto_consumo": false}') $$,
  'tipo distinto.*uso_previsto', 'rechaza un atributo con tipo distinto al declarado');

select throws_matching(
  $$ insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos)
     values ('belleza', 'cuidado_facial', 'p', 'Marca A', 100, 'd',
             '{"uso_previsto": "hidratar", "zona_aplicacion": "rostro", "clase_riesgo": "ninguno", "apto_consumo": false, "spf": "cincuenta"}') $$,
  'tipo distinto.*spf', 'también en los técnicos declarados');

select throws_ok(
  $$ update catalogo.producto set atributos = atributos - 'clase_riesgo' where id = (select min(id) from catalogo.producto) $$,
  '23514', null, 'tampoco se puede quitar el contexto con UPDATE');

select throws_ok(
  $$ insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos)
     values ('belleza', 'ropa', 'p', 'Marca A', 100, 'd', '{}') $$,
  '23503', null, 'una categoría inexistente viola la llave foránea');

-- Integridad del catálogo cargado: cobertura 100 % de obligatorios por integridad, no por azar
select is(
  (select count(*) from catalogo.producto p
   join catalogo.atributo_meta m on m.dominio = p.dominio and m.categoria = p.categoria and m.obligatorio
   where not (p.atributos ? m.atributo)),
  0::bigint, 'ningún producto cargado carece de un obligatorio');

select is(
  (select count(*) from catalogo.atributo_meta where define_riesgo and inferible),
  0::bigint, 'ningún atributo de riesgo es inferible');

select * from finish();
rollback;
