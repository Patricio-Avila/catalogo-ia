-- G3 (rol mínimo y esquema interno aislado) y G4 (límites): RNF-01, RNF-02, RNF-04.
-- Las pruebas que corren "como el agente" usan pg_temp.como_agente: cambia de rol
-- solo durante la sentencia, para que pgTAP siga corriendo como el usuario de la sesión.
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

-- Roles
select has_role('catalogo_duenio', 'existe el dueño de las funciones');
select has_role('agente_lectura', 'existe el rol del agente');
select has_role('agente_api', 'existe el usuario de conexión');
select is((select rolsuper from pg_roles where rolname = 'catalogo_duenio'), false, 'catalogo_duenio no es superusuario (§7.2.5)');
select is((select rolcanlogin from pg_roles where rolname = 'agente_lectura'), false, 'agente_lectura no inicia sesión');
select is_member_of('agente_lectura', 'agente_api', 'agente_api hereda agente_lectura');
select ok((select rolconfig from pg_roles where rolname = 'agente_api') @> array['statement_timeout=2s'], 'agente_api con statement_timeout de 2 s (G4)');
select ok((select rolconfig from pg_roles where rolname = 'agente_lectura') @> array['statement_timeout=2s'], 'agente_lectura con statement_timeout de 2 s (G4)');

-- RNF-01: ni lectura directa ni escritura sobre producto
select throws_ok($$ select pg_temp.como_agente('select * from catalogo.producto limit 1') $$, '42501', null, 'SELECT directo sobre producto denegado');
select throws_ok($$ select pg_temp.como_agente('insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion) values (''belleza'', ''cuidado_facial'', ''x'', ''x'', 1, ''x'')') $$, '42501', null, 'INSERT denegado');
select throws_ok($$ select pg_temp.como_agente('update catalogo.producto set precio = 1 where id = 1') $$, '42501', null, 'UPDATE denegado');
select throws_ok($$ select pg_temp.como_agente('delete from catalogo.producto where id = 1') $$, '42501', null, 'DELETE denegado');
select throws_ok($$ select pg_temp.como_agente('update catalogo.vertical set nombre = ''x''') $$, '42501', null, 'la configuración es de solo lectura');

-- RNF-02: esquema interno sin permisos
select throws_ok($$ select pg_temp.como_agente('select * from interno.producto_verdad limit 1') $$, '42501', null, 'interno.producto_verdad denegado');
select throws_ok($$ select pg_temp.como_agente('select * from interno.margen limit 1') $$, '42501', null, 'interno.margen denegado');
select throws_ok($$ select pg_temp.como_agente('select * from interno.par_trampa limit 1') $$, '42501', null, 'interno.par_trampa denegado');
select throws_ok($$ select pg_temp.como_agente('select * from servicio.cache_consultas limit 1') $$, '42501', null, 'tabla de caché sin acceso directo');

-- Funciones internas y administrativas no ejecutables por el agente
select throws_ok($$ select pg_temp.como_agente('select * from catalogo.evaluar_filtros(''belleza'', null, ''[]''::jsonb, true)') $$, '42501', null, 'evaluar_filtros no es pública');
select throws_ok($$ select pg_temp.como_agente('select * from catalogo.refrescar_diccionario()') $$, '42501', null, 'refrescar_diccionario es del administrador');
select throws_ok($$ select pg_temp.como_agente('select servicio.cache_limpiar_obsoletas()') $$, '42501', null, 'cache_limpiar_obsoletas es del administrador');

-- Lo que sí puede: funciones públicas y configuración
select lives_ok($$ select pg_temp.como_agente('select * from catalogo.buscar_productos(''belleza'', null, ''[]''::jsonb, false, 5)') $$, 'buscar_productos permitida');
select lives_ok($$ select pg_temp.como_agente('select * from catalogo.contar_productos(''belleza'', null, ''[]''::jsonb, false)') $$, 'contar_productos permitida');
select lives_ok($$ select pg_temp.como_agente('select * from catalogo.calcular_facetas(''belleza'', null, ''[]''::jsonb, false, null)') $$, 'calcular_facetas permitida');
select lives_ok($$ select pg_temp.como_agente('select * from catalogo.comparar_productos(''belleza'', ''cuidado_facial'', ''{}''::jsonb, 5, null)') $$, 'comparar_productos permitida');
select lives_ok($$ select pg_temp.como_agente('select catalogo.obtener_diccionario(''belleza'')') $$, 'obtener_diccionario permitida');
select lives_ok($$ select pg_temp.como_agente('select catalogo.obtener_verticales()') $$, 'obtener_verticales permitida');
select lives_ok($$ select pg_temp.como_agente('select * from catalogo.vertical') $$, 'vertical legible');
select lives_ok($$ select pg_temp.como_agente('select * from catalogo.categoria') $$, 'categoria legible');
select lives_ok($$ select pg_temp.como_agente('select * from catalogo.diccionario_atributos limit 1') $$, 'diccionario legible');

-- Las funciones SECURITY DEFINER pertenecen al dueño sin superusuario
select is(
  (select bool_and(pg_get_userbyid(p.proowner) = 'catalogo_duenio')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('catalogo', 'servicio') and p.prosecdef),
  true, 'toda función SECURITY DEFINER es de catalogo_duenio');

-- G4: tope de filas dentro de la función aunque el parámetro pida más (RNF-04)
select cmp_ok((select count(*) from catalogo.buscar_productos('belleza', null, '[]'::jsonb, true, 100000)), '<=', 200::bigint, 'buscar_productos nunca devuelve más de 200 filas');
select is((select count(*) from catalogo.buscar_productos('belleza', null, '[]'::jsonb, true, null)), 20::bigint, 'límite por omisión 20');

select * from finish();
rollback;
