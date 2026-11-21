-- 0008: el comparador falla cerrado cuando la referencia no trae su contexto
-- (RF-09, RF-11, ADR-0005; revisión del 2026-11-20).
--
-- Problema: comparar_productos solo revisaba los atributos presentes en la
-- referencia. Una referencia escrita o tomada de una foto nunca trae atributos de
-- riesgo (inferible = false: el modelo no puede proponerlos), así que el riesgo no
-- se revisaba y un par trampa podía salir con nivel alto.
--
-- Regla nueva: si a la referencia le falta un atributo de contexto obligatorio de
-- la categoría (obligatorio y define_riesgo o define_uso en atributo_meta), se
-- trata como desconocido. Riesgo desconocido: nivel 0 y el atributo va en
-- riesgo_distinto. Uso desconocido: nivel máximo 0.5 y el atributo va en
-- uso_distinto. La diferencia aparece con estado 'sin_dato' y referencia nula.
-- Una referencia tomada del catálogo siempre los trae (trigger de obligatorios),
-- así que su resultado no cambia. Firma y columnas de salida iguales a 0005.

create or replace function catalogo.comparar_productos(
  p_dominio text, p_categoria text, p_atributos_ref jsonb, p_limite integer default 10,
  p_candidatos bigint[] default null)
returns table (
  id bigint, nombre text, marca text, precio numeric, descripcion text,
  nivel numeric, diferencias jsonb, uso_distinto text[], riesgo_distinto text[]
)
language sql stable
security definer
set search_path = catalogo, pg_temp
as $$
  with referencia as (
    select r.key as atributo, r.value as valor, m.peso, m.define_uso, m.define_riesgo
    from jsonb_each(coalesce(p_atributos_ref, '{}'::jsonb)) r
    join atributo_meta m on m.dominio = p_dominio and m.categoria = p_categoria and m.atributo = r.key
  ),
  contexto_faltante as (
    select m.atributo, m.define_uso, m.define_riesgo
    from atributo_meta m
    where m.dominio = p_dominio and m.categoria = p_categoria
      and m.obligatorio and (m.define_uso or m.define_riesgo)
      and not (coalesce(p_atributos_ref, '{}'::jsonb) ? m.atributo)
  ),
  pesos as (select sum(peso) as total from referencia),
  candidatos as (
    select p.id, p.nombre, p.marca, p.precio, p.descripcion, p.atributos
    from producto p
    where p.dominio = p_dominio and p.categoria = p_categoria
      and (p_candidatos is null or p.id = any (p_candidatos))
  ),
  diferencias as (
    select c.id, r.atributo, r.valor as valor_referencia, c.atributos -> r.atributo as valor_candidato,
      r.peso, r.define_uso, r.define_riesgo,
      case
        when not (c.atributos ? r.atributo) then 'sin_dato'
        when c.atributos -> r.atributo = r.valor then 'igual'
        else 'distinto'
      end as estado,
      false as falta_en_referencia
    from candidatos c
    cross join referencia r
    union all
    select c.id, f.atributo, null::jsonb, c.atributos -> f.atributo,
      0::numeric, f.define_uso, f.define_riesgo, 'sin_dato', true
    from candidatos c
    cross join contexto_faltante f
  ),
  resumen as (
    select d.id,
      coalesce(sum(d.peso) filter (where d.estado = 'igual'), 0) as pesos_iguales,
      jsonb_agg(jsonb_build_object(
        'atributo', d.atributo, 'referencia', d.valor_referencia, 'candidato', d.valor_candidato, 'estado', d.estado
      ) order by d.atributo) as diferencias,
      coalesce(array_agg(d.atributo order by d.atributo)
        filter (where d.define_uso and (d.estado = 'distinto' or d.falta_en_referencia)), '{}'::text[]) as uso_distinto,
      coalesce(array_agg(d.atributo order by d.atributo)
        filter (where d.define_riesgo and d.estado in ('distinto', 'sin_dato')), '{}'::text[]) as riesgo_distinto
    from diferencias d
    group by d.id
  )
  select c.id, c.nombre, c.marca, c.precio, c.descripcion,
    case
      when cardinality(r.riesgo_distinto) > 0 then 0
      when cardinality(r.uso_distinto) > 0 then least(0.5, coalesce(round(r.pesos_iguales / nullif(p.total, 0), 3), 0))
      else round(r.pesos_iguales / nullif(p.total, 0), 3)
    end as nivel,
    r.diferencias, r.uso_distinto, r.riesgo_distinto
  from candidatos c
  join resumen r on r.id = c.id
  cross join pesos p
  order by nivel desc nulls last, c.precio, c.id
  limit least(greatest(coalesce(p_limite, 10), 1), 200);
$$;
