-- RF-08: el diccionario se calcula desde los datos; tipo, dominio y cobertura
-- coinciden con los parámetros del generador. Forma de obtener_diccionario().
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_materialized_view('catalogo', 'diccionario_atributos', 'existe la vista materializada');
select has_index('catalogo', 'diccionario_atributos', 'diccionario_atributos_pk', 'índice único para el refresco concurrente');

-- Volumen del orden de 10^5 en seis categorías
select cmp_ok((select count(*) from catalogo.producto), '>=', 100000::bigint, 'al menos 100,000 productos');
select is((select count(distinct (dominio, categoria)) from catalogo.producto), 6::bigint, 'seis categorías');

-- Coberturas meta (§7.4) con tolerancia de 3 puntos
create function pg_temp.cobertura(p_dominio text, p_categoria text, p_atributo text) returns numeric
language sql as $$
  select cobertura_pct from catalogo.diccionario_atributos
  where dominio = p_dominio and categoria = p_categoria and atributo = p_atributo
$$;

select cmp_ok(abs(pg_temp.cobertura('farmacia', 'medicamentos', 'concentracion_mg') - 90), '<=', 3::numeric, 'farmacia concentracion_mg ≈ 90 %');
select cmp_ok(abs(pg_temp.cobertura('farmacia', 'medicamentos', 'via_administracion') - 70), '<=', 3::numeric, 'farmacia via_administracion ≈ 70 %');
select cmp_ok(abs(pg_temp.cobertura('farmacia', 'suplementos', 'sin_azucar') - 40), '<=', 3::numeric, 'farmacia sin_azucar ≈ 40 %');
select cmp_ok(abs(pg_temp.cobertura('llantas', 'pasajeros', 'run_flat') - 45), '<=', 3::numeric, 'llantas run_flat ≈ 45 %');
select cmp_ok(abs(pg_temp.cobertura('llantas', 'carga_ligera', 'garantia_km') - 60), '<=', 3::numeric, 'llantas garantia_km ≈ 60 %');
select cmp_ok(abs(pg_temp.cobertura('belleza', 'cuidado_facial', 'spf') - 40), '<=', 3::numeric, 'belleza spf ≈ 40 %');
select cmp_ok(abs(pg_temp.cobertura('belleza', 'cuidado_corporal', 'tipo_piel') - 60), '<=', 3::numeric, 'belleza tipo_piel ≈ 60 %');
select is(pg_temp.cobertura('llantas', 'pasajeros', 'ancho_mm'), 100.0, 'llantas ancho_mm 100 %');
select is(pg_temp.cobertura('farmacia', 'medicamentos', 'sustancia_activa'), 100.0, 'farmacia sustancia_activa 100 %');

-- Contexto: 100 % por integridad
select is(
  (select min(d.cobertura_pct) from catalogo.diccionario_atributos d
   join catalogo.atributo_meta m using (dominio, categoria, atributo) where m.obligatorio),
  100.0, 'todo atributo obligatorio tiene cobertura 100 %');

-- Atributos que solo aplican a una categoría aparecen como ausencia en la otra
select is((select count(*) from catalogo.diccionario_atributos where dominio = 'belleza' and categoria = 'cuidado_corporal' and atributo = 'spf'), 0::bigint, 'spf no existe en cuidado_corporal');
select is((select count(*) from catalogo.diccionario_atributos where dominio = 'belleza' and categoria = 'cuidado_facial' and atributo = 'spf'), 1::bigint, 'spf existe en cuidado_facial');

-- Tipos y dominios de valores
select is((select tipo from catalogo.diccionario_atributos where dominio = 'belleza' and categoria = 'cuidado_facial' and atributo = 'fragancia'), 'texto', 'fragancia es texto');
select is((select valores from catalogo.diccionario_atributos where dominio = 'belleza' and categoria = 'cuidado_facial' and atributo = 'fragancia'), array['cítrica', 'floral', 'neutra', 'sin perfume'], 'dominio de valores de fragancia');
select is((select tipo from catalogo.diccionario_atributos where dominio = 'llantas' and categoria = 'pasajeros' and atributo = 'run_flat'), 'booleano', 'run_flat es booleano');
select is((select tipo from catalogo.diccionario_atributos where dominio = 'llantas' and categoria = 'pasajeros' and atributo = 'rin_pulg'), 'numero', 'rin_pulg es número');
select is((select minimo::int from catalogo.diccionario_atributos where dominio = 'llantas' and categoria = 'pasajeros' and atributo = 'rin_pulg'), 13, 'rin mínimo 13');
select is((select maximo::int from catalogo.diccionario_atributos where dominio = 'llantas' and categoria = 'pasajeros' and atributo = 'rin_pulg'), 19, 'rin máximo 19');

-- Columnas fijas como entradas
select is((select count(*) from catalogo.diccionario_atributos where atributo in ('precio', 'marca')), 12::bigint, 'precio y marca en las seis categorías');
select is((select valores from catalogo.diccionario_atributos where dominio = 'farmacia' and categoria = 'medicamentos' and atributo = 'marca'), array['Marca A', 'Marca B', 'Marca C', 'Marca D', 'Marca E', 'Marca F', 'Marca G', 'Marca H'], 'marcas A a H');

-- Versión por vertical
select isnt((select version_diccionario from catalogo.vertical where dominio = 'belleza'), '0', 'la vertical tiene versión tras el refresco');
select is((select count(distinct version_diccionario) from catalogo.vertical), 3::bigint, 'cada vertical tiene su propia versión');

-- obtener_diccionario: la forma que espera packages/core/src/contrato/diccionario.ts
select is(catalogo.obtener_diccionario('belleza') ->> 'dominio', 'belleza', 'dominio');
select is(catalogo.obtener_diccionario('belleza') ->> 'version', (select version_diccionario from catalogo.vertical where dominio = 'belleza'), 'versión');
select is(catalogo.obtener_diccionario('belleza') -> 'categorias', '["cuidado_facial", "cuidado_corporal"]'::jsonb, 'categorías en orden');
select is(jsonb_typeof(catalogo.obtener_diccionario('belleza') -> 'entradas'), 'array', 'entradas es arreglo');
select is(
  (select bool_and(e ? 'categoria' and e ? 'atributo' and e ? 'tipo' and e ? 'cobertura_pct' and e ? 'obligatorio' and e ? 'define_uso' and e ? 'define_riesgo' and e ? 'inferible')
   from jsonb_array_elements(catalogo.obtener_diccionario('belleza') -> 'entradas') e),
  true, 'cada entrada trae los campos del contrato');
select is(
  (select bool_and((e ->> 'inferible')::boolean = false)
   from jsonb_array_elements(catalogo.obtener_diccionario('farmacia') -> 'entradas') e
   where (e ->> 'define_riesgo')::boolean),
  true, 'en el JSON, ningún atributo de riesgo es inferible');
select is(
  (select e -> 'valores' from jsonb_array_elements(catalogo.obtener_diccionario('llantas') -> 'entradas') e
   where e ->> 'categoria' = 'pasajeros' and e ->> 'atributo' = 'indice_velocidad'),
  '["H", "S", "T", "V", "W"]'::jsonb, 'valores de texto como arreglo');
select is(catalogo.obtener_diccionario('juguetes'), null, 'vertical inexistente devuelve null');

-- obtener_verticales
select is(jsonb_array_length(catalogo.obtener_verticales()), 3, 'tres verticales');
select is(catalogo.obtener_verticales() -> 0 ->> 'dominio', 'farmacia', 'farmacia primero');
select isnt(catalogo.obtener_verticales() -> 0 ->> 'aviso', null, 'farmacia lleva aviso');

-- Refresco idempotente: la misma carga da la misma versión
select is(
  (select version from catalogo.refrescar_diccionario() where dominio = 'belleza'),
  (select version_diccionario from catalogo.vertical where dominio = 'belleza'),
  'refrescar sin cambios conserva la versión');

select * from finish();
rollback;
