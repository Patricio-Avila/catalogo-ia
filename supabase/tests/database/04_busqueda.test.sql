-- RF-05 (motivo calculado en SQL), RF-06 (conteo de faltantes contra consulta
-- independiente), RF-07 (facetas sobre el conjunto resultante), G2 (fragmentos SQL
-- en valores) y operadores numéricos.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Filtros de referencia: belleza / cuidado_facial, fragancia = sin perfume, tipo_piel = sensible, precio < 300
create temp table filtros_ref as
select '[{"atributo":"fragancia","operador":"=","valor":"sin perfume"},
         {"atributo":"tipo_piel","operador":"=","valor":"sensible"},
         {"atributo":"precio","operador":"<","valor":300}]'::jsonb as f;

-- Conjuntos de referencia calculados a mano, sin las funciones
create temp table ref_estricto as
select id from catalogo.producto
where dominio = 'belleza' and categoria = 'cuidado_facial'
  and atributos ->> 'fragancia' = 'sin perfume'
  and atributos ->> 'tipo_piel' = 'sensible'
  and precio < 300;

create temp table ref_faltantes as
select id from catalogo.producto
where dominio = 'belleza' and categoria = 'cuidado_facial'
  and (not (atributos ? 'fragancia') or atributos ->> 'fragancia' = 'sin perfume')
  and (not (atributos ? 'tipo_piel') or atributos ->> 'tipo_piel' = 'sensible')
  and precio < 300
  and (not (atributos ? 'fragancia') or not (atributos ? 'tipo_piel'));

-- RF-05: motivo de coincidencia
select cmp_ok((select count(*) from catalogo.buscar_productos('belleza', 'cuidado_facial', (select f from filtros_ref), false, 200)), '>', 0::bigint, 'hay resultados');
select is(
  (select bool_and(r.cumple = array['fragancia', 'precio', 'tipo_piel'] and r.sin_dato = '{}')
   from catalogo.buscar_productos('belleza', 'cuidado_facial', (select f from filtros_ref), false, 200) r),
  true, 'en modo estricto, cada resultado cumple los tres filtros y no tiene faltantes');
select is(
  (select bool_and(p.atributos ->> 'fragancia' = 'sin perfume' and p.atributos ->> 'tipo_piel' = 'sensible' and p.precio < 300)
   from catalogo.buscar_productos('belleza', 'cuidado_facial', (select f from filtros_ref), false, 200) r
   join catalogo.producto p on p.id = r.id),
  true, 'el motivo coincide con el documento atributos del producto');
select is(
  (select bool_and(
     (('fragancia' = any (r.sin_dato)) = not (p.atributos ? 'fragancia')) and
     (('tipo_piel' = any (r.sin_dato)) = not (p.atributos ? 'tipo_piel')))
   from catalogo.buscar_productos('belleza', 'cuidado_facial', (select f from filtros_ref), true, 200) r
   join catalogo.producto p on p.id = r.id),
  true, 'con incluir_sin_dato, sin_dato lista exactamente las claves ausentes');

-- Todos los resultados estrictos están en la referencia (son los más baratos de ella)
select is(
  (select count(*) from catalogo.buscar_productos('belleza', 'cuidado_facial', (select f from filtros_ref), false, 200) r
   where r.id not in (select id from ref_estricto)),
  0::bigint, 'ningún resultado fuera del conjunto de referencia');

-- RF-06: conteos contra referencia independiente
select is((select total from catalogo.contar_productos('belleza', 'cuidado_facial', (select f from filtros_ref), false)), (select count(*) from ref_estricto), 'total estricto = referencia');
select is((select faltantes from catalogo.contar_productos('belleza', 'cuidado_facial', (select f from filtros_ref), false)), (select count(*) from ref_faltantes), 'faltantes = referencia');
select is(
  (select total from catalogo.contar_productos('belleza', 'cuidado_facial', (select f from filtros_ref), true)),
  (select count(*) from ref_estricto) + (select count(*) from ref_faltantes),
  'total con incluir_sin_dato = estricto + faltantes');
select cmp_ok((select faltantes from catalogo.contar_productos('belleza', 'cuidado_facial', (select f from filtros_ref), false)), '>', 0::bigint, 'hay faltantes que reportar (tipo_piel tiene 60 % de cobertura)');

-- Orden: primero sin faltantes, luego por precio
select is(
  (select bool_and(en_orden) from (
     select precio >= coalesce(lag(precio) over (order by n), 0) as en_orden
     from catalogo.buscar_productos('belleza', 'cuidado_facial', (select f from filtros_ref), false, 50)
       with ordinality as r(id, nombre, marca, precio, descripcion, cumple, sin_dato, n)) s),
  true, 'resultados estrictos ordenados por precio');

-- Sin filtros: toda la categoría cuenta y cumple = {}
select is((select total from catalogo.contar_productos('belleza', 'cuidado_facial', '[]'::jsonb, false)), (select count(*) from catalogo.producto where dominio = 'belleza' and categoria = 'cuidado_facial'), 'sin filtros, total = categoría');
select is((select cumple from catalogo.buscar_productos('belleza', 'cuidado_facial', '[]'::jsonb, false, 1)), '{}'::text[], 'sin filtros, cumple vacío');
select is((select total from catalogo.contar_productos('belleza', null, '[]'::jsonb, false)), (select count(*) from catalogo.producto where dominio = 'belleza'), 'categoría null cubre la vertical');

-- Operadores numéricos y columnas fijas
select is(
  (select bool_and(p.precio between 100 and 150)
   from catalogo.buscar_productos('belleza', null, '[{"atributo":"precio","operador":">=","valor":100},{"atributo":"precio","operador":"<=","valor":150}]'::jsonb, false, 200) r
   join catalogo.producto p on p.id = r.id),
  true, 'rango de precio con >= y <=');
select is(
  (select bool_and((p.atributos ->> 'spf')::numeric > 30)
   from catalogo.buscar_productos('belleza', 'cuidado_facial', '[{"atributo":"spf","operador":">","valor":30}]'::jsonb, false, 200) r
   join catalogo.producto p on p.id = r.id),
  true, 'comparación numérica sobre JSON');
select is(
  (select bool_and(p.marca = 'Marca C')
   from catalogo.buscar_productos('llantas', null, '[{"atributo":"marca","operador":"=","valor":"Marca C"}]'::jsonb, false, 200) r
   join catalogo.producto p on p.id = r.id),
  true, 'marca como atributo más');
select is(
  (select bool_and(p.atributos ->> 'temporada' <> 'invierno')
   from catalogo.buscar_productos('llantas', 'pasajeros', '[{"atributo":"temporada","operador":"<>","valor":"invierno"}]'::jsonb, false, 200) r
   join catalogo.producto p on p.id = r.id),
  true, 'desigualdad de texto');
select is(
  (select bool_and((p.atributos -> 'run_flat') = 'true'::jsonb)
   from catalogo.buscar_productos('llantas', 'pasajeros', '[{"atributo":"run_flat","operador":"=","valor":true}]'::jsonb, false, 200) r
   join catalogo.producto p on p.id = r.id),
  true, 'igualdad booleana');

-- Medida de llanta completa por contención (C1)
select cmp_ok(
  (select total from catalogo.contar_productos('llantas', 'pasajeros',
    '[{"atributo":"ancho_mm","operador":"=","valor":205},{"atributo":"perfil_pct","operador":"=","valor":55},{"atributo":"rin_pulg","operador":"=","valor":16}]'::jsonb, false)),
  '>', 0::bigint, 'hay llantas 205/55 R16');

-- RF-07: facetas sobre el conjunto resultante
create temp table facetas_ref as
select * from catalogo.calcular_facetas('belleza', 'cuidado_facial', (select f from filtros_ref), false, null);

select cmp_ok((select count(distinct atributo) from facetas_ref), '>=', 2::bigint, 'hay facetas');
select is((select count(*) from facetas_ref where atributo in ('fragancia', 'tipo_piel')), 0::bigint, 'no sugiere los atributos ya fijados con =');
select is((select min(n) from (select count(*) n from facetas_ref group by atributo) s), 2::bigint, 'toda faceta tiene al menos dos valores');
select is(
  (select productos from facetas_ref where atributo = 'acabado' and valor = 'mate'),
  (select count(*) from catalogo.producto where id in (select id from ref_estricto) and atributos ->> 'acabado' = 'mate'),
  'el conteo de una faceta coincide con la consulta de referencia');
select is(
  (select productos from facetas_ref where atributo = 'acabado' and valor = '(sin dato)'),
  (select count(*) from catalogo.producto where id in (select id from ref_estricto) and not (atributos ? 'acabado')),
  'el grupo sin dato cuenta los productos sin la clave');
select ok(exists (select 1 from facetas_ref where atributo = 'marca'), 'marca entra como faceta');
select is((select count(distinct atributo) from catalogo.calcular_facetas('belleza', 'cuidado_facial', (select f from filtros_ref), false, array['vegano'])), 1::bigint, 'se puede pedir una faceta concreta');

-- G2: fragmentos SQL en valores y en nombres de atributo no alteran nada
select is((select count(*) from catalogo.buscar_productos('belleza', 'cuidado_facial', '[{"atributo":"fragancia","operador":"=","valor":"x'' or 1=1; drop table catalogo.producto; --"}]'::jsonb, false, 200)), 0::bigint, 'valor con SQL: cero resultados en modo estricto');
select is(
  (select bool_and('fragancia' = any (r.sin_dato))
   from catalogo.buscar_productos('belleza', 'cuidado_facial', '[{"atributo":"fragancia","operador":"=","valor":"x'' or 1=1; drop table catalogo.producto; --"}]'::jsonb, true, 200) r),
  true, 'valor con SQL: en modo inclusivo solo vuelven los que no tienen el dato; ninguno coincide con el valor');
select is((select count(*) from catalogo.buscar_productos('belleza', 'cuidado_facial', '[{"atributo":"fragancia; delete from catalogo.producto","operador":"=","valor":"floral"}]'::jsonb, false, 200)), 0::bigint, 'atributo con SQL: se trata como clave ausente');
select is((select count(*) from catalogo.buscar_productos('belleza'' or 1=1 --', null, '[]'::jsonb, false, 200)), 0::bigint, 'dominio con SQL: cero resultados');
select cmp_ok((select count(*) from catalogo.producto), '>=', 100000::bigint, 'la tabla sigue intacta');

-- Operador desconocido: nada cumple, nada se rompe
select is((select count(*) from catalogo.buscar_productos('belleza', null, '[{"atributo":"precio","operador":"~","valor":100}]'::jsonb, false, 200)), 0::bigint, 'operador desconocido: cero resultados');

select * from finish();
rollback;
