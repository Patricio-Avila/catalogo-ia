-- 0004: diccionario de atributos (RF-08; §7.2 puntos 9 y 13).
--
-- Vista materializada calculada desde los propios datos, por (dominio, categoría,
-- atributo): tipo, dominio de valores (texto), rango (número) y cobertura. Las
-- columnas fijas precio y marca entran como atributos más. Es lo único del
-- catálogo que ve el modelo, y solo la parte de la vertical elegida.
-- Se refresca al cargar el catálogo; cada refresco cambia la versión de la
-- vertical, que forma parte de la clave de la caché exacta.

create materialized view catalogo.diccionario_atributos as
with totales as (
  select dominio, categoria, count(*)::numeric as total
  from catalogo.producto
  group by dominio, categoria
),
json_atributos as (
  select p.dominio, p.categoria, a.key as atributo, a.value as valor
  from catalogo.producto p
  cross join lateral jsonb_each(p.atributos) as a
),
variables as (
  select j.dominio, j.categoria, j.atributo,
    case min(jsonb_typeof(j.valor)) when 'number' then 'numero' when 'boolean' then 'booleano' else 'texto' end as tipo,
    -- dominio de valores solo para texto; más de 200 distintos se considera alta cardinalidad y no se lista
    case when min(jsonb_typeof(j.valor)) = 'string' and count(distinct j.valor) <= 200
         then array_agg(distinct (j.valor #>> '{}') order by (j.valor #>> '{}')) end as valores,
    case when min(jsonb_typeof(j.valor)) = 'number' then min((j.valor #>> '{}')::numeric) end as minimo,
    case when min(jsonb_typeof(j.valor)) = 'number' then max((j.valor #>> '{}')::numeric) end as maximo,
    round(100.0 * count(*) / t.total, 1) as cobertura_pct
  from json_atributos j
  join totales t using (dominio, categoria)
  group by j.dominio, j.categoria, j.atributo, t.total
),
fijas as (
  select p.dominio, p.categoria, 'precio' as atributo, 'numero' as tipo, null::text[] as valores,
         min(p.precio) as minimo, max(p.precio) as maximo, 100.0 as cobertura_pct
  from catalogo.producto p group by p.dominio, p.categoria
  union all
  select p.dominio, p.categoria, 'marca', 'texto', array_agg(distinct p.marca order by p.marca), null, null, 100.0
  from catalogo.producto p group by p.dominio, p.categoria
)
select dominio, categoria, atributo, tipo, valores, minimo, maximo, cobertura_pct from variables
union all
select dominio, categoria, atributo, tipo, valores, minimo, maximo, cobertura_pct from fijas
with no data;

comment on materialized view catalogo.diccionario_atributos is 'Diccionario de atributos calculado desde los datos: tipo, dominio de valores, rango y cobertura por vertical y categoría (RF-08).';

-- Índice único: exigido por REFRESH ... CONCURRENTLY y útil para el cruce con atributo_meta.
create unique index diccionario_atributos_pk on catalogo.diccionario_atributos (dominio, categoria, atributo);

alter materialized view catalogo.diccionario_atributos owner to catalogo_duenio;
grant select on catalogo.diccionario_atributos to agente_lectura;

-- Refresco: lo ejecuta el administrador al cargar el catálogo. Cambia la versión
-- de cada vertical a partir del contenido, así una carga idéntica da la misma versión.
create function catalogo.refrescar_diccionario() returns table (dominio text, version text)
language plpgsql
security definer
set search_path = catalogo, pg_temp
as $$
begin
  if (select relispopulated from pg_class where oid = 'catalogo.diccionario_atributos'::regclass) then
    refresh materialized view concurrently catalogo.diccionario_atributos;
  else
    refresh materialized view catalogo.diccionario_atributos;
  end if;

  return query
  update catalogo.vertical v
  set version_diccionario = sub.version, actualizado_en = now()
  from (
    select d.dominio,
      md5(string_agg(d.categoria || '|' || d.atributo || '|' || d.tipo || '|' || coalesce(array_to_string(d.valores, ','), '')
                     || '|' || coalesce(d.minimo::text, '') || '|' || coalesce(d.maximo::text, '') || '|' || d.cobertura_pct::text,
                     ';' order by d.categoria, d.atributo)) as version
    from catalogo.diccionario_atributos d
    group by d.dominio
  ) sub
  where sub.dominio = v.dominio
  returning v.dominio, v.version_diccionario;
end
$$;
alter function catalogo.refrescar_diccionario() owner to catalogo_duenio;
revoke execute on function catalogo.refrescar_diccionario() from public;
-- catalogo_duenio necesita escribir en vertical para registrar la versión
grant update on catalogo.vertical to catalogo_duenio;

-- Lo que el núcleo recibe: la forma de packages/core/src/contrato/diccionario.ts.
create function catalogo.obtener_diccionario(p_dominio text) returns jsonb
language sql
stable
security definer
set search_path = catalogo, pg_temp
as $$
  select jsonb_build_object(
    'dominio', v.dominio,
    'version', v.version_diccionario,
    'categorias', (select coalesce(jsonb_agg(c.categoria order by c.orden, c.categoria), '[]'::jsonb)
                   from catalogo.categoria c where c.dominio = v.dominio),
    'entradas', (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'categoria',     d.categoria,
          'atributo',      d.atributo,
          'tipo',          d.tipo,
          'valores',       to_jsonb(d.valores),
          'minimo',        d.minimo,
          'maximo',        d.maximo,
          'cobertura_pct', d.cobertura_pct,
          'obligatorio',   coalesce(m.obligatorio, false),
          'define_uso',    coalesce(m.define_uso, false),
          'define_riesgo', coalesce(m.define_riesgo, false),
          'inferible',     coalesce(m.inferible, true),
          'peso',          m.peso
        )) order by d.categoria, d.atributo), '[]'::jsonb)
      from catalogo.diccionario_atributos d
      left join catalogo.atributo_meta m using (dominio, categoria, atributo)
      where d.dominio = v.dominio
    )
  )
  from catalogo.vertical v
  where v.dominio = p_dominio;
$$;
alter function catalogo.obtener_diccionario(text) owner to catalogo_duenio;
revoke execute on function catalogo.obtener_diccionario(text) from public;
grant execute on function catalogo.obtener_diccionario(text) to agente_lectura;

-- Configuración de verticales para el cliente (selector, textos, aviso, destacados).
create function catalogo.obtener_verticales() returns jsonb
language sql
stable
security definer
set search_path = catalogo, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'dominio', v.dominio,
      'nombre', v.nombre,
      'texto_ayuda', v.texto_ayuda,
      'aviso', v.aviso,
      'atributos_destacados', to_jsonb(v.atributos_destacados),
      'version_diccionario', v.version_diccionario,
      'categorias', (select coalesce(jsonb_agg(jsonb_build_object('categoria', c.categoria, 'nombre', c.nombre) order by c.orden, c.categoria), '[]'::jsonb)
                     from catalogo.categoria c where c.dominio = v.dominio)
    ) order by v.orden, v.dominio), '[]'::jsonb)
  from catalogo.vertical v;
$$;
alter function catalogo.obtener_verticales() owner to catalogo_duenio;
revoke execute on function catalogo.obtener_verticales() from public;
grant execute on function catalogo.obtener_verticales() to agente_lectura;
