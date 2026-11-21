-- Migración 0007 (búsqueda sin arreglos): las funciones públicas devuelven lo
-- mismo que la implementación de referencia de 0005 (evaluar_filtros), en el mismo
-- orden, con los mismos motivos y conteos, con y sin incluir_sin_dato. Además, el
-- caso más caro de T8 cabe en el statement_timeout de 2 s del agente (G4, RNF-05),
-- y las funciones internas nuevas no son ejecutables por el agente (G3).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create temp table casos (n int, dominio text, categoria text, filtros jsonb);
insert into casos values
  (1, 'belleza', 'cuidado_facial', '[{"atributo":"fragancia","operador":"=","valor":"sin perfume"},{"atributo":"tipo_piel","operador":"=","valor":"sensible"},{"atributo":"precio","operador":"<","valor":300}]'),
  (2, 'belleza', null, '[{"atributo":"vegano","operador":"=","valor":true},{"atributo":"spf","operador":">","valor":30},{"atributo":"precio","operador":">=","valor":100}]'),
  (3, 'llantas', 'pasajeros', '[{"atributo":"ancho_mm","operador":"=","valor":205},{"atributo":"perfil_pct","operador":"=","valor":55},{"atributo":"rin_pulg","operador":"=","valor":16},{"atributo":"temporada","operador":"<>","valor":"invierno"},{"atributo":"garantia_km","operador":">=","valor":40000}]'),
  (4, 'farmacia', 'medicamentos', '[{"atributo":"sustancia_activa","operador":"=","valor":"paracetamol"},{"atributo":"concentracion_mg","operador":"=","valor":500},{"atributo":"sin_azucar","operador":"=","valor":true},{"atributo":"via_administracion","operador":"=","valor":"oral"},{"atributo":"piezas","operador":">","valor":10}]'),
  (5, 'llantas', null, '[{"atributo":"garantia_km","operador":">","valor":20000},{"atributo":"garantia_km","operador":"<","valor":60000},{"atributo":"marca","operador":"=","valor":"Marca C"}]'),
  (6, 'belleza', null, '[]'),
  (7, 'belleza', 'cuidado_facial', '[{"atributo":"fragancia; delete from catalogo.producto","operador":"=","valor":"floral"},{"atributo":"precio","operador":"~","valor":100}]'),
  (8, 'farmacia', null, '[{"atributo":"requiere_receta","operador":"=","valor":false},{"atributo":"forma_farmaceutica","operador":"<>","valor":"jarabe"}]'),
  (9, 'belleza', 'cuidado_facial', '[{"atributo":"tipo_piel","operador":"=","valor":"sensible"},{"atributo":"fragancia","operador":"=","valor":"sin perfume"},{"atributo":"precio","operador":"<","valor":300},{"atributo":"vegano","operador":"=","valor":true},{"atributo":"sin_parabenos","operador":"=","valor":true}]');

create temp table modos (inc boolean);
insert into modos values (false), (true);

-- buscar_productos: filas, orden, cumple y sin_dato
select results_eq(
  format('select id, cumple, sin_dato from catalogo.buscar_productos(%L, %L, %L::jsonb, %L::boolean, 200)',
         c.dominio, c.categoria, c.filtros, m.inc),
  format($q$select e.id, e.cumple, e.sin_dato
            from catalogo.evaluar_filtros(%L, %L, %L::jsonb, not %L::boolean) e
            where e.valido and (%L::boolean or e.sin_dato = '{}'::text[])
            order by cardinality(e.sin_dato), e.precio, e.id
            limit 200$q$,
         c.dominio, c.categoria, c.filtros, m.inc, m.inc),
  format('buscar_productos igual a la referencia (caso %s, incluir_sin_dato %s)', c.n, m.inc))
from casos c cross join modos m
order by c.n, m.inc;

-- contar_productos: total y faltantes
select results_eq(
  format('select total, faltantes from catalogo.contar_productos(%L, %L, %L::jsonb, %L::boolean)',
         c.dominio, c.categoria, c.filtros, m.inc),
  format($q$select count(*) filter (where %L::boolean or e.sin_dato = '{}'::text[]),
                   count(*) filter (where e.sin_dato <> '{}'::text[])
            from catalogo.evaluar_filtros(%L, %L, %L::jsonb, false) e
            where e.valido$q$,
         m.inc, c.dominio, c.categoria, c.filtros),
  format('contar_productos igual a la referencia (caso %s, incluir_sin_dato %s)', c.n, m.inc))
from casos c cross join modos m
order by c.n, m.inc;

-- El conjunto sobre el que se calculan las facetas es el mismo
select set_eq(
  format('select id from catalogo.filtrar_productos(%L, %L, %L::jsonb, %L::boolean)',
         c.dominio, c.categoria, c.filtros, m.inc),
  format($q$select e.id from catalogo.evaluar_filtros(%L, %L, %L::jsonb, not %L::boolean) e
            where e.valido and (%L::boolean or e.sin_dato = '{}'::text[])$q$,
         c.dominio, c.categoria, c.filtros, m.inc, m.inc),
  format('conjunto de facetas igual a la referencia (caso %s, incluir_sin_dato %s)', c.n, m.inc))
from casos c cross join modos m
order by c.n, m.inc;

-- G4 y RNF-05: el caso más caro de T8 (5 filtros, incluir_sin_dato) cabe en 2 s,
-- con las tres llamadas que hace /buscar
set local statement_timeout = '2s';
select lives_ok(
  $$ select count(*) from catalogo.buscar_productos('belleza', 'cuidado_facial', (select filtros from casos where n = 9), true, 20) $$,
  'buscar_productos con 5 filtros e incluir_sin_dato dentro de 2 s');
select lives_ok(
  $$ select * from catalogo.contar_productos('belleza', 'cuidado_facial', (select filtros from casos where n = 9), true) $$,
  'contar_productos con 5 filtros dentro de 2 s');
select lives_ok(
  $$ select count(*) from catalogo.calcular_facetas('belleza', 'cuidado_facial', (select filtros from casos where n = 9), true, null) $$,
  'calcular_facetas con 5 filtros e incluir_sin_dato dentro de 2 s');
select lives_ok(
  $$ select * from catalogo.contar_productos('belleza', null, (select filtros from casos where n = 2), true) $$,
  'contar_productos sobre la vertical completa dentro de 2 s');
reset statement_timeout;

-- G3: las funciones internas nuevas no son del agente
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

select throws_ok($$ select pg_temp.como_agente('select * from catalogo.filtrar_productos(''belleza'', null, ''[]''::jsonb, true)') $$, '42501', null, 'filtrar_productos no es pública');
select throws_ok($$ select pg_temp.como_agente('select catalogo.estado_filtro(1, ''x'', ''{}''::jsonb, ''precio'', ''='', ''1''::jsonb)') $$, '42501', null, 'estado_filtro no es pública');
select lives_ok($$ select pg_temp.como_agente('select * from catalogo.buscar_productos(''belleza'', null, ''[{"atributo":"vegano","operador":"=","valor":true}]''::jsonb, true, 5)') $$, 'el agente sigue pudiendo buscar');

select * from finish();
rollback;
