-- 0007: búsqueda, conteo y facetas sin armar arreglos sobre toda la categoría
-- (RNF-05, G4; revisión del 2026-11-20).
--
-- Problema medido en T8 (docs/mediciones/t8_resultados.md §3.2): con
-- incluir_sin_dato = true, evaluar_filtros arma cumple[] y sin_dato[] con un
-- GROUP BY sobre los ~16,700 productos de la categoría, y tarda de 1.3 a 2.4 s con
-- 3 a 5 filtros, por encima de la meta de 1 s y del statement_timeout de 2 s del
-- agente. contar_productos siempre recorría ese camino, así que cada /buscar lo
-- pagaba aunque el usuario no incluyera los productos sin dato.
--
-- Cambio: filtrar_productos decide, por producto, si algún filtro falla (NOT
-- EXISTS) y cuántos filtros no pudo evaluar, sin GROUP BY ni arreglos. Los
-- arreglos cumple y sin_dato se calculan solo para las filas que devuelve
-- buscar_productos (20 por omisión, 200 como máximo). Las firmas públicas no
-- cambian. evaluar_filtros se conserva como implementación de referencia: la
-- prueba 07_busqueda_equivalencia.test.sql compara ambas salidas.

-- Comparadores sin STRICT, de una sola expresión, para que el planificador los
-- pueda sustituir en línea dentro de la consulta. Nombres calificados porque una
-- función sustituida en línea se analiza con el search_path de quien la llama.
create function catalogo.cumple_numero(p_a numeric, p_operador text, p_valor jsonb) returns boolean
language sql immutable parallel safe
as $$
  select case
    when jsonb_typeof(p_valor) <> 'number' then false
    when p_operador = '='  then p_a =  (p_valor #>> '{}')::numeric
    when p_operador = '<>' then p_a <> (p_valor #>> '{}')::numeric
    when p_operador = '<'  then p_a <  (p_valor #>> '{}')::numeric
    when p_operador = '<=' then p_a <= (p_valor #>> '{}')::numeric
    when p_operador = '>'  then p_a >  (p_valor #>> '{}')::numeric
    when p_operador = '>=' then p_a >= (p_valor #>> '{}')::numeric
    else false end
$$;

create function catalogo.cumple_valor(p_a jsonb, p_operador text, p_valor jsonb) returns boolean
language sql immutable parallel safe
as $$
  select case p_operador when '=' then p_a = p_valor when '<>' then p_a <> p_valor else false end
$$;

-- Estado de un filtro para un producto: 'cumple', 'no' o 'sin_dato'. Misma
-- semántica que el CASE de evaluar_filtros; un NULL en la comparación cuenta como 'no'.
create function catalogo.estado_filtro(
  p_precio numeric, p_marca text, p_atributos jsonb, p_atributo text, p_operador text, p_valor jsonb)
returns text
language sql immutable parallel safe
as $$
  select case
    when p_atributo is null then 'cumple'
    when p_atributo = 'precio' then
      case when catalogo.cumple_numero(p_precio, p_operador, p_valor) then 'cumple' else 'no' end
    when p_atributo = 'marca' then
      case when catalogo.cumple_valor(to_jsonb(p_marca), p_operador, p_valor) then 'cumple' else 'no' end
    when not (p_atributos ? p_atributo) then 'sin_dato'
    when jsonb_typeof(p_atributos -> p_atributo) = 'number' then
      case when catalogo.cumple_numero((p_atributos ->> p_atributo)::numeric, p_operador, p_valor) then 'cumple' else 'no' end
    else
      case when catalogo.cumple_valor(p_atributos -> p_atributo, p_operador, p_valor) then 'cumple' else 'no' end
  end
$$;

-- Productos de la vertical o categoría en los que ningún filtro falla, con el
-- número de filtros que no se pudieron evaluar por falta de dato.
--   p_incluir_sin_dato = false: solo los que tienen todas las claves; las
--     igualdades van como contención (@>) para usar el índice GIN.
--   p_incluir_sin_dato = true: recorre la categoría completa (RF-06).
-- Las dos ramas van en UNION ALL con la bandera como condición constante: el
-- planificador deja una sola activa (One-Time Filter), igual que en 0005.
create function catalogo.filtrar_productos(p_dominio text, p_categoria text, p_filtros jsonb, p_incluir_sin_dato boolean)
returns table (
  id bigint, nombre text, marca text, precio numeric, descripcion text, atributos jsonb, n_sin_dato integer
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
  claves as (
    select coalesce(array_agg(atributo), '{}'::text[]) as todas
    from filtros
    where atributo not in ('precio', 'marca')
  ),
  candidatos as (
    select p.id, p.nombre, p.marca, p.precio, p.descripcion, p.atributos
    from producto p, contencion c, claves k
    where not p_incluir_sin_dato
      and p.dominio = p_dominio and (p_categoria is null or p.categoria = p_categoria)
      and p.atributos @> c.doc
      and p.atributos ?& k.todas
    union all
    select p.id, p.nombre, p.marca, p.precio, p.descripcion, p.atributos
    from producto p
    where p_incluir_sin_dato
      and p.dominio = p_dominio and (p_categoria is null or p.categoria = p_categoria)
  )
  select c.id, c.nombre, c.marca, c.precio, c.descripcion, c.atributos,
    (select count(*)::integer from filtros f
     where f.atributo not in ('precio', 'marca') and not (c.atributos ? f.atributo)) as n_sin_dato
  from candidatos c
  where not exists (
    select 1 from filtros f
    where catalogo.estado_filtro(c.precio, c.marca, c.atributos, f.atributo, f.operador, f.valor) = 'no'
  );
$$;

-- Búsqueda (RF-05): mismo orden y tope que en 0005. El motivo de coincidencia se
-- calcula solo para la página devuelta.
create or replace function catalogo.buscar_productos(
  p_dominio text, p_categoria text, p_filtros jsonb,
  p_incluir_sin_dato boolean default false, p_limite integer default 20)
returns table (id bigint, nombre text, marca text, precio numeric, descripcion text, cumple text[], sin_dato text[])
language sql stable
security definer
set search_path = catalogo, pg_temp
as $$
  with filtros as (
    select f ->> 'atributo' as atributo, f ->> 'operador' as operador, f -> 'valor' as valor
    from jsonb_array_elements(coalesce(p_filtros, '[]'::jsonb)) as f
  ),
  pagina as (
    select r.id, r.nombre, r.marca, r.precio, r.descripcion, r.atributos, r.n_sin_dato
    from filtrar_productos(p_dominio, p_categoria, p_filtros, p_incluir_sin_dato) r
    order by r.n_sin_dato, r.precio, r.id
    limit least(greatest(coalesce(p_limite, 20), 1), 200)
  )
  select g.id, g.nombre, g.marca, g.precio, g.descripcion,
    coalesce((select array_agg(f.atributo order by f.atributo) from filtros f
              where f.atributo is not null
                and estado_filtro(g.precio, g.marca, g.atributos, f.atributo, f.operador, f.valor) = 'cumple'), '{}'::text[]) as cumple,
    coalesce((select array_agg(f.atributo order by f.atributo) from filtros f
              where estado_filtro(g.precio, g.marca, g.atributos, f.atributo, f.operador, f.valor) = 'sin_dato'), '{}'::text[]) as sin_dato
  from pagina g
  order by g.n_sin_dato, g.precio, g.id;
$$;

-- Conteos (RF-06): total de resultados y cuántos quedaron fuera por no tener el
-- dato de algún filtro. Sigue recorriendo la categoría, pero sin arreglos.
create or replace function catalogo.contar_productos(
  p_dominio text, p_categoria text, p_filtros jsonb, p_incluir_sin_dato boolean default false)
returns table (total bigint, faltantes bigint)
language sql stable
security definer
set search_path = catalogo, pg_temp
as $$
  select
    count(*) filter (where p_incluir_sin_dato or r.n_sin_dato = 0) as total,
    count(*) filter (where r.n_sin_dato > 0) as faltantes
  from filtrar_productos(p_dominio, p_categoria, p_filtros, true) r;
$$;

-- Facetas (RF-07): mismas reglas que en 0005, sobre el conjunto de filtrar_productos.
create or replace function catalogo.calcular_facetas(
  p_dominio text, p_categoria text, p_filtros jsonb,
  p_incluir_sin_dato boolean default false, p_atributos text[] default null)
returns table (atributo text, valor text, productos bigint)
language sql stable
security definer
set search_path = catalogo, pg_temp
as $$
  with conjunto as (
    select r.atributos || jsonb_build_object('marca', r.marca) as atributos
    from filtrar_productos(p_dominio, p_categoria, p_filtros, p_incluir_sin_dato) r
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

comment on function catalogo.evaluar_filtros(text, text, jsonb, boolean) is
  'Implementación de referencia de 0005 (arma cumple[] y sin_dato[] por GROUP BY). Ya no la usan las funciones públicas; se conserva para la prueba de equivalencia.';

-- Dueño sin superusuario y permisos mínimos (§7.2.5). CREATE OR REPLACE conserva
-- dueño y permisos de las públicas; las nuevas son internas.
alter function catalogo.cumple_numero(numeric, text, jsonb) owner to catalogo_duenio;
alter function catalogo.cumple_valor(jsonb, text, jsonb) owner to catalogo_duenio;
alter function catalogo.estado_filtro(numeric, text, jsonb, text, text, jsonb) owner to catalogo_duenio;
alter function catalogo.filtrar_productos(text, text, jsonb, boolean) owner to catalogo_duenio;

revoke execute on function catalogo.cumple_numero(numeric, text, jsonb) from public;
revoke execute on function catalogo.cumple_valor(jsonb, text, jsonb) from public;
revoke execute on function catalogo.estado_filtro(numeric, text, jsonb, text, text, jsonb) from public;
revoke execute on function catalogo.filtrar_productos(text, text, jsonb, boolean) from public;
