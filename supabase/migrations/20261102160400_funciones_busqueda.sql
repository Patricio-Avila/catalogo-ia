-- 0005: funciones de búsqueda, conteo, facetas y comparación (G2, G4, G5;
-- RF-05, RF-06, RF-07, RF-09; §7.2 puntos 1 a 5, 12 y 17).
--
-- Todas reciben el objeto de filtros como JSONB con el contrato de §6.1
-- ({atributo, operador, valor}) y corren como SECURITY DEFINER con dueño sin
-- superusuario (catalogo_duenio) y search_path fijo. El agente solo tiene EXECUTE
-- sobre las públicas; las internas no se le conceden.
--
-- Firmas, acordadas con packages/core/src/datos/acceso.ts:
--   buscar_productos(p_dominio, p_categoria, p_filtros, p_incluir_sin_dato, p_limite)
--   contar_productos(p_dominio, p_categoria, p_filtros, p_incluir_sin_dato) → (total, faltantes)
--   calcular_facetas(p_dominio, p_categoria, p_filtros, p_incluir_sin_dato, p_atributos)
--   comparar_productos(p_dominio, p_categoria, p_atributos_ref, p_limite, p_candidatos)
--     p_candidatos (opcional): restringe a esos ids, para comparar dos productos concretos

-- Comparadores. El valor del filtro llega como JSONB; nunca se concatena al SQL (G2).
create function catalogo.comparar_numero(p_a numeric, p_operador text, p_valor jsonb) returns boolean
language sql immutable strict
as $$
  select case
    when jsonb_typeof(p_valor) <> 'number' then false
    when p_operador = '='  then p_a =  (p_valor #>> '{}')::numeric
    when p_operador = '<>' then p_a <> (p_valor #>> '{}')::numeric
    when p_operador = '<'  then p_a <  (p_valor #>> '{}')::numeric
    when p_operador = '<=' then p_a <= (p_valor #>> '{}')::numeric
    when p_operador = '>'  then p_a >  (p_valor #>> '{}')::numeric
    when p_operador = '>=' then p_a >= (p_valor #>> '{}')::numeric
    else false end;
$$;

-- Texto y booleano: igualdad o desigualdad exacta de JSONB. G1 ya convirtió el
-- valor a la forma canónica del diccionario, así que no hace falta normalizar aquí.
create function catalogo.comparar_valor(p_a jsonb, p_operador text, p_valor jsonb) returns boolean
language sql immutable strict
as $$
  select case p_operador when '=' then p_a = p_valor when '<>' then p_a <> p_valor else false end;
$$;

-- Evaluación filtro por filtro de cada producto de la vertical o categoría.
-- Devuelve, por producto, los filtros que cumple, los que no pudo evaluar por
-- falta de dato y si ninguno falló. Es la base de las tres funciones públicas.
--
-- p_solo_con_dato = true: las igualdades sobre atributos JSON se convierten en una
-- contención (@>) que usa el índice GIN y descarta de entrada a quien no tiene el
-- dato (C1). false: se recorren todos los productos de la categoría, que es lo que
-- hace falta para incluir o contar a los que no tienen el dato (RF-06).
-- Las dos ramas van en UNION ALL con la bandera como condición constante: el
-- planificador deja una sola activa (One-Time Filter).
create function catalogo.evaluar_filtros(p_dominio text, p_categoria text, p_filtros jsonb, p_solo_con_dato boolean)
returns table (
  id bigint, nombre text, marca text, precio numeric, descripcion text, categoria text, atributos jsonb,
  cumple text[], sin_dato text[], valido boolean
)
language sql stable
set search_path = catalogo, pg_temp
as $$
  with filtros as (
    select f ->> 'atributo' as atributo, f ->> 'operador' as operador, f -> 'valor' as valor
    from jsonb_array_elements(coalesce(p_filtros, '[]'::jsonb)) as f
  ),
  contencion as (
    select coalesce(jsonb_object_agg(atributo, valor), '{}'::jsonb) as doc
    from filtros
    where operador = '=' and atributo not in ('precio', 'marca')
  ),
  candidatos as (
    select p.id, p.nombre, p.marca, p.precio, p.descripcion, p.categoria, p.atributos
    from producto p, contencion c
    where p_solo_con_dato
      and p.dominio = p_dominio and (p_categoria is null or p.categoria = p_categoria)
      and p.atributos @> c.doc
    union all
    select p.id, p.nombre, p.marca, p.precio, p.descripcion, p.categoria, p.atributos
    from producto p
    where not p_solo_con_dato
      and p.dominio = p_dominio and (p_categoria is null or p.categoria = p_categoria)
  ),
  evaluacion as (
    select c.id, f.atributo,
      case
        when f.atributo is null then 'cumple'                      -- sin filtros: todo cumple
        when f.atributo = 'precio' then case when comparar_numero(c.precio, f.operador, f.valor) then 'cumple' else 'no' end
        when f.atributo = 'marca'  then case when comparar_valor(to_jsonb(c.marca), f.operador, f.valor) then 'cumple' else 'no' end
        when not (c.atributos ? f.atributo) then 'sin_dato'
        when jsonb_typeof(c.atributos -> f.atributo) = 'number'
          then case when comparar_numero((c.atributos ->> f.atributo)::numeric, f.operador, f.valor) then 'cumple' else 'no' end
        else case when comparar_valor(c.atributos -> f.atributo, f.operador, f.valor) then 'cumple' else 'no' end
      end as estado
    from candidatos c
    left join filtros f on true
  )
  select c.id, c.nombre, c.marca, c.precio, c.descripcion, c.categoria, c.atributos,
    coalesce(array_agg(e.atributo order by e.atributo) filter (where e.estado = 'cumple' and e.atributo is not null), '{}'::text[]) as cumple,
    coalesce(array_agg(e.atributo order by e.atributo) filter (where e.estado = 'sin_dato'), '{}'::text[]) as sin_dato,
    bool_and(e.estado <> 'no') as valido
  from candidatos c
  join evaluacion e on e.id = c.id
  group by c.id, c.nombre, c.marca, c.precio, c.descripcion, c.categoria, c.atributos;
$$;

-- Búsqueda (RF-05): resultados con motivo de coincidencia calculado aquí, no por el modelo.
-- Orden: primero los que no tienen faltantes, luego por precio. Tope de filas dentro
-- de la función, no solo en el parámetro (RNF-04).
create function catalogo.buscar_productos(
  p_dominio text, p_categoria text, p_filtros jsonb,
  p_incluir_sin_dato boolean default false, p_limite integer default 20)
returns table (id bigint, nombre text, marca text, precio numeric, descripcion text, cumple text[], sin_dato text[])
language sql stable
security definer
set search_path = catalogo, pg_temp
as $$
  select e.id, e.nombre, e.marca, e.precio, e.descripcion, e.cumple, e.sin_dato
  from evaluar_filtros(p_dominio, p_categoria, p_filtros, not p_incluir_sin_dato) e
  where e.valido and (p_incluir_sin_dato or e.sin_dato = '{}'::text[])
  order by cardinality(e.sin_dato), e.precio, e.id
  limit least(greatest(coalesce(p_limite, 20), 1), 200);
$$;

-- Conteos (RF-06): total de resultados y cuántos quedaron fuera por no tener el
-- dato de algún filtro. Siempre recorre la categoría completa, porque los
-- faltantes son justo los que la contención excluye.
create function catalogo.contar_productos(
  p_dominio text, p_categoria text, p_filtros jsonb, p_incluir_sin_dato boolean default false)
returns table (total bigint, faltantes bigint)
language sql stable
security definer
set search_path = catalogo, pg_temp
as $$
  select
    count(*) filter (where p_incluir_sin_dato or e.sin_dato = '{}'::text[]) as total,
    count(*) filter (where e.sin_dato <> '{}'::text[]) as faltantes
  from evaluar_filtros(p_dominio, p_categoria, p_filtros, false) e
  where e.valido;
$$;

-- Facetas (RF-07): sobre el conjunto resultante, no sobre toda la categoría.
-- Solo atributos de texto y booleanos; marca cuenta como uno más; el grupo
-- "(sin dato)" es un valor más. Se omiten los atributos ya fijados con "=" y las
-- facetas con un solo valor. Hasta 20 valores por faceta.
create function catalogo.calcular_facetas(
  p_dominio text, p_categoria text, p_filtros jsonb,
  p_incluir_sin_dato boolean default false, p_atributos text[] default null)
returns table (atributo text, valor text, productos bigint)
language sql stable
security definer
set search_path = catalogo, pg_temp
as $$
  with conjunto as (
    select e.atributos || jsonb_build_object('marca', e.marca) as atributos
    from evaluar_filtros(p_dominio, p_categoria, p_filtros, not p_incluir_sin_dato) e
    where e.valido and (p_incluir_sin_dato or e.sin_dato = '{}'::text[])
  ),
  fijados as (
    select f ->> 'atributo' as atributo
    from jsonb_array_elements(coalesce(p_filtros, '[]'::jsonb)) f
    where f ->> 'operador' = '='
  ),
  candidatos as (
    select distinct d.atributo
    from diccionario_atributos d
    where d.dominio = p_dominio
      and (p_categoria is null or d.categoria = p_categoria)
      and d.tipo in ('texto', 'booleano')
      and (p_atributos is null or d.atributo = any (p_atributos))
      and d.atributo not in (select atributo from fijados)
  ),
  conteos as (
    select a.atributo, coalesce(c.atributos ->> a.atributo, '(sin dato)') as valor, count(*) as productos
    from conjunto c
    cross join candidatos a
    group by a.atributo, coalesce(c.atributos ->> a.atributo, '(sin dato)')
  ),
  ordenados as (
    select atributo, valor, productos,
      count(*) over (partition by atributo) as distintos,
      row_number() over (partition by atributo order by productos desc, valor) as posicion
    from conteos
  )
  select atributo, valor, productos
  from ordenados
  where distintos >= 2 and posicion <= 20
  order by atributo, productos desc, valor;
$$;

-- Comparación (RF-09, ADR-0005): candidatos de la misma categoría, diferencias
-- atributo por atributo y nivel de compatibilidad ponderado por atributo_meta.
--   nivel = suma de pesos de los atributos iguales / suma de pesos de los atributos
--           de la referencia que existen en atributo_meta.
--   Un atributo con define_riesgo distinto o sin dato → nivel 0 (riesgo: sin dato
--   es desconocido y falla cerrado). Uno con define_uso distinto → nivel ≤ 0.5.
-- Limitación conocida (auditoría, C5): el denominador solo incluye los atributos
-- presentes en la referencia, así que una referencia con pocos atributos obtiene
-- niveles altos con poca evidencia. La interfaz muestra siempre las diferencias y
-- nunca dice "igual" ni "equivalente".
create function catalogo.comparar_productos(
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
      end as estado
    from candidatos c
    cross join referencia r
  ),
  resumen as (
    select d.id,
      coalesce(sum(d.peso) filter (where d.estado = 'igual'), 0) as pesos_iguales,
      jsonb_agg(jsonb_build_object(
        'atributo', d.atributo, 'referencia', d.valor_referencia, 'candidato', d.valor_candidato, 'estado', d.estado
      ) order by d.atributo) as diferencias,
      coalesce(array_agg(d.atributo order by d.atributo) filter (where d.define_uso and d.estado = 'distinto'), '{}'::text[]) as uso_distinto,
      coalesce(array_agg(d.atributo order by d.atributo) filter (where d.define_riesgo and d.estado in ('distinto', 'sin_dato')), '{}'::text[]) as riesgo_distinto
    from diferencias d
    group by d.id
  )
  select c.id, c.nombre, c.marca, c.precio, c.descripcion,
    case
      when cardinality(r.riesgo_distinto) > 0 then 0
      when cardinality(r.uso_distinto) > 0 then least(0.5, round(r.pesos_iguales / nullif(p.total, 0), 3))
      else round(r.pesos_iguales / nullif(p.total, 0), 3)
    end as nivel,
    r.diferencias, r.uso_distinto, r.riesgo_distinto
  from candidatos c
  join resumen r on r.id = c.id
  cross join pesos p
  order by nivel desc nulls last, c.precio, c.id
  limit least(greatest(coalesce(p_limite, 10), 1), 200);
$$;

-- Dueño sin superusuario y permisos mínimos (§7.2.5).
alter function catalogo.comparar_numero(numeric, text, jsonb) owner to catalogo_duenio;
alter function catalogo.comparar_valor(jsonb, text, jsonb) owner to catalogo_duenio;
alter function catalogo.evaluar_filtros(text, text, jsonb, boolean) owner to catalogo_duenio;
alter function catalogo.buscar_productos(text, text, jsonb, boolean, integer) owner to catalogo_duenio;
alter function catalogo.contar_productos(text, text, jsonb, boolean) owner to catalogo_duenio;
alter function catalogo.calcular_facetas(text, text, jsonb, boolean, text[]) owner to catalogo_duenio;
alter function catalogo.comparar_productos(text, text, jsonb, integer, bigint[]) owner to catalogo_duenio;

revoke execute on function catalogo.comparar_numero(numeric, text, jsonb) from public;
revoke execute on function catalogo.comparar_valor(jsonb, text, jsonb) from public;
revoke execute on function catalogo.evaluar_filtros(text, text, jsonb, boolean) from public;
revoke execute on function catalogo.buscar_productos(text, text, jsonb, boolean, integer) from public;
revoke execute on function catalogo.contar_productos(text, text, jsonb, boolean) from public;
revoke execute on function catalogo.calcular_facetas(text, text, jsonb, boolean, text[]) from public;
revoke execute on function catalogo.comparar_productos(text, text, jsonb, integer, bigint[]) from public;

grant execute on function catalogo.buscar_productos(text, text, jsonb, boolean, integer) to agente_lectura;
grant execute on function catalogo.contar_productos(text, text, jsonb, boolean) to agente_lectura;
grant execute on function catalogo.calcular_facetas(text, text, jsonb, boolean, text[]) to agente_lectura;
grant execute on function catalogo.comparar_productos(text, text, jsonb, integer, bigint[]) to agente_lectura;
