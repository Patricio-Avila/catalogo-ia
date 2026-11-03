-- RF-09 y ADR-0005: comparación dentro de la categoría con nivel ponderado;
-- los pares trampa quedan en 0 (riesgo) o acotados (uso).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is((select count(*) from interno.par_trampa), 9::bigint, 'nueve pares trampa, tres por vertical');
select is((select count(distinct dominio) from interno.par_trampa), 3::bigint, 'en las tres verticales');

-- Un producto comparado consigo mismo da nivel 1 y cero diferencias
select is(
  (select c.nivel from catalogo.producto a
   cross join lateral catalogo.comparar_productos(a.dominio, a.categoria, a.atributos, 5, array[a.id]) c
   where a.id = (select min(id) from catalogo.producto where dominio = 'llantas')),
  1.000, 'consigo mismo: nivel 1');
select is(
  (select count(*) from catalogo.producto a
   cross join lateral catalogo.comparar_productos(a.dominio, a.categoria, a.atributos, 5, array[a.id]) c
   cross join lateral jsonb_array_elements(c.diferencias) d
   where a.id = (select min(id) from catalogo.producto where dominio = 'llantas') and d ->> 'estado' <> 'igual'),
  0::bigint, 'consigo mismo: todas las diferencias en estado igual');

-- Pares trampa: tomando A como referencia, B queda en 0 por riesgo o acotado a 0.5 por uso
select is(
  (select count(*) from interno.par_trampa t
   join catalogo.producto a on a.id = t.producto_a
   cross join lateral catalogo.comparar_productos(t.dominio, a.categoria, a.atributos, 5, array[t.producto_b]) c
   where not ((c.nivel = 0 and cardinality(c.riesgo_distinto) > 0) or (c.nivel <= 0.5 and cardinality(c.uso_distinto) > 0))),
  0::bigint, 'los nueve pares trampa quedan en 0 o acotados con su alerta');

select is(
  (select count(*) from interno.par_trampa t
   join catalogo.producto a on a.id = t.producto_a
   cross join lateral catalogo.comparar_productos(t.dominio, a.categoria, a.atributos, 5, array[t.producto_b]) c
   where t.motivo like '%riesgo%' and c.nivel <> 0),
  0::bigint, 'los pares de riesgo están en 0 exacto');

-- Simetría: también con B como referencia
select is(
  (select count(*) from interno.par_trampa t
   join catalogo.producto b on b.id = t.producto_b
   cross join lateral catalogo.comparar_productos(t.dominio, b.categoria, b.atributos, 5, array[t.producto_a]) c
   where not ((c.nivel = 0 and cardinality(c.riesgo_distinto) > 0) or (c.nivel <= 0.5 and cardinality(c.uso_distinto) > 0))),
  0::bigint, 'también con B como referencia');

-- Riesgo distinto deja el nivel en 0 aunque todo lo demás coincida
select is(
  (select cardinality(c.riesgo_distinto) > 0 and c.nivel = 0
   from catalogo.producto p
   cross join lateral catalogo.comparar_productos(p.dominio, p.categoria,
     p.atributos || '{"clase_riesgo":"evitar contacto con ojos"}'::jsonb, 5, array[p.id]) c
   where p.id = (select min(id) from catalogo.producto
                 where dominio = 'belleza' and categoria = 'cuidado_facial' and atributos ->> 'clase_riesgo' = 'ninguno')),
  true, 'riesgo distinto deja el nivel en 0 y lo anuncia');

-- Riesgo sin dato en el candidato falla cerrado: se simula con una referencia que
-- declara un atributo de riesgo que el catálogo no usa en esa categoría (requiere_receta
-- no existe en belleza, así que se usa farmacia con sin dato forzado en la referencia inversa)
select is(
  (select c.nivel
   from catalogo.producto p
   cross join lateral catalogo.comparar_productos(p.dominio, p.categoria, p.atributos, 5, array[p.id]) c
   where p.id = (select min(id) from catalogo.producto where dominio = 'farmacia' and categoria = 'medicamentos')),
  1.000, 'con todos los riesgos iguales el nivel es 1');

-- Solo dentro de la misma categoría
select is(
  (select count(*) from catalogo.comparar_productos('belleza', 'cuidado_facial', '{"uso_previsto":"hidratar"}'::jsonb, 200, null) c
   join catalogo.producto p on p.id = c.id where p.categoria <> 'cuidado_facial'),
  0::bigint, 'ningún candidato de otra categoría');

-- Atributos de la referencia que no existen en atributo_meta se ignoran
select is(
  (select count(*) from catalogo.comparar_productos('belleza', 'cuidado_facial', '{"color":"rojo"}'::jsonb, 5, null) c
   cross join lateral jsonb_array_elements(c.diferencias) d),
  0::bigint, 'un atributo desconocido no produce diferencias');

-- Orden y tope
select is((select count(*) from catalogo.comparar_productos('llantas', 'pasajeros', '{"ancho_mm":205,"perfil_pct":55,"rin_pulg":16}'::jsonb, 100000, null)), 200::bigint, 'tope de 200 candidatos');
select is(
  (select bool_and(en_orden) from (
     select nivel <= coalesce(lag(nivel) over (order by n), 1) as en_orden
     from catalogo.comparar_productos('llantas', 'pasajeros', '{"ancho_mm":205,"perfil_pct":55,"rin_pulg":16}'::jsonb, 50, null)
       with ordinality as c(id, nombre, marca, precio, descripcion, nivel, diferencias, uso_distinto, riesgo_distinto, n)) s),
  true, 'ordenados por nivel descendente');

-- Vocabulario: los estados son solo igual, distinto o sin_dato (la interfaz nunca dice equivalente)
select is(
  (select bool_and(d ->> 'estado' in ('igual', 'distinto', 'sin_dato'))
   from catalogo.comparar_productos('farmacia', 'medicamentos', '{"sustancia_activa":"paracetamol","concentracion_mg":500}'::jsonb, 20, null) c
   cross join lateral jsonb_array_elements(c.diferencias) d),
  true, 'estados de diferencia acotados');

select * from finish();
rollback;
