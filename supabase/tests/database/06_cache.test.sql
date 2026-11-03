-- Caché exacta: solo por funciones; cuenta aciertos; limpieza por versión.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.como_agente(p_sql text) returns void
language plpgsql as $$
begin
  execute 'set local role agente_lectura';
  execute p_sql;
  execute 'reset role';
exception when others then
  execute 'reset role';
  raise;
end $$;

select has_table('servicio', 'cache_consultas', 'existe la tabla de caché');

-- Clave: SHA-256 en hexadecimal, como la produce packages/core/src/cache/clave.ts
select throws_ok($$ select servicio.cache_guardar('no-es-hex', '{"filtros":[]}'::jsonb) $$, '23514', null, 'rechaza claves que no son SHA-256 hex');

-- Guardar y obtener como el agente (a través de las funciones)
select lives_ok(
  $$ select pg_temp.como_agente($q$ select servicio.cache_guardar(repeat('a', 64), '{"categoria":null,"filtros":[{"atributo":"vegano","operador":"=","valor":true,"confianza":0.9}],"version_diccionario":"v1"}'::jsonb) $q$) $$,
  'el agente guarda por función');
select is(servicio.cache_obtener(repeat('a', 64)) -> 'filtros' -> 0 ->> 'atributo', 'vegano', 'obtener devuelve la entrada');
select is(servicio.cache_obtener(repeat('b', 64)), null, 'clave desconocida devuelve null');
select is((select aciertos from servicio.cache_consultas where clave = repeat('a', 64)), 1, 'cada obtener cuenta un acierto');
select is((select version_diccionario from servicio.cache_consultas where clave = repeat('a', 64)), 'v1', 'la versión se toma de la entrada');

-- Guardar de nuevo reemplaza (upsert)
select lives_ok($$ select servicio.cache_guardar(repeat('a', 64), '{"categoria":"cuidado_facial","filtros":[],"version_diccionario":"v2"}'::jsonb) $$, 'upsert');
select is(servicio.cache_obtener(repeat('a', 64)) ->> 'categoria', 'cuidado_facial', 'la entrada quedó reemplazada');
select is((select count(*) from servicio.cache_consultas where clave = repeat('a', 64)), 1::bigint, 'sin duplicados');

-- Limpieza: las versiones que no coinciden con ninguna vertical se borran
select lives_ok($$ select servicio.cache_guardar(repeat('c', 64), jsonb_build_object('categoria', null, 'filtros', '[]'::jsonb, 'version_diccionario', (select version_diccionario from catalogo.vertical where dominio = 'belleza'))) $$, 'entrada con versión vigente');
select is(servicio.cache_limpiar_obsoletas(), 1::bigint, 'limpiar borra la obsoleta (v2) y conserva la vigente');
select is((select count(*) from servicio.cache_consultas where clave = repeat('c', 64)), 1::bigint, 'la vigente sigue');

-- El agente no ve la tabla
select throws_ok($$ select pg_temp.como_agente('select * from servicio.cache_consultas') $$, '42501', null, 'sin SELECT directo sobre la tabla');
select throws_ok($$ select pg_temp.como_agente('delete from servicio.cache_consultas') $$, '42501', null, 'sin DELETE directo');

select * from finish();
rollback;
