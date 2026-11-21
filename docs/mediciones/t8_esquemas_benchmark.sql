-- T8: Comparación medida Híbrido (catalogo) vs. EAV (eav) vs. Tabla Ancha (ancha)
-- Referencia: CLAUDE.md §7.3, Objetivo particular 1, Corrección C1 (jsonb_ops vs jsonb_path_ops).
-- Ejecutado sobre el proyecto Supabase `oowpkqcmqbiqctcbkzuo` con 100,020 productos.

create schema if not exists eav;
create schema if not exists ancha;

revoke all on schema eav from public;
revoke all on schema ancha from public;

-- ============================================================================
-- 1. Esquema EAV (Entidad-Atributo-Valor) con estadísticas extendidas
-- ============================================================================

create table if not exists eav.producto (
  id          bigint primary key,
  dominio     text not null,
  categoria   text not null,
  nombre      text not null,
  marca       text not null,
  precio      numeric(10, 2) not null,
  descripcion text not null
);

create index if not exists producto_dominio_categoria_idx
  on eav.producto (dominio, categoria);

create table if not exists eav.producto_atributo (
  producto_id  bigint not null references eav.producto(id) on delete cascade,
  atributo     text not null,
  tipo         text not null check (tipo in ('texto', 'numero', 'booleano')),
  valor_texto  text,
  valor_numero numeric,
  valor_bool   boolean,
  primary key (producto_id, atributo)
);

create index if not exists producto_atributo_texto_idx
  on eav.producto_atributo (atributo, valor_texto) where valor_texto is not null;
create index if not exists producto_atributo_numero_idx
  on eav.producto_atributo (atributo, valor_numero) where valor_numero is not null;
create index if not exists producto_atributo_bool_idx
  on eav.producto_atributo (atributo, valor_bool) where valor_bool is not null;

create statistics if not exists eav.estadisticas_attr_valor (dependencies, ndistinct, mcv)
  on atributo, tipo, valor_texto, valor_numero, valor_bool
  from eav.producto_atributo;

create or replace function eav.evaluar_filtros(
  p_dominio text, p_categoria text, p_filtros jsonb, p_solo_con_dato boolean
)
returns table (
  id bigint, nombre text, marca text, precio numeric, descripcion text, categoria text,
  cumple text[], sin_dato text[], valido boolean
)
language sql stable
set search_path = eav, catalogo, pg_temp
as $$
  with filtros as (
    select
      f ->> 'atributo' as atributo,
      f ->> 'operador' as operador,
      f -> 'valor' as valor
    from jsonb_array_elements(coalesce(p_filtros, '[]'::jsonb)) as f
  ),
  candidatos as (
    select p.id, p.nombre, p.marca, p.precio, p.descripcion, p.categoria
    from eav.producto p
    where p.dominio = p_dominio
      and (p_categoria is null or p.categoria = p_categoria)
      and (
        not p_solo_con_dato
        or not exists (
          select 1
          from filtros f
          where f.operador = '='
            and f.atributo not in ('precio', 'marca')
            and not exists (
              select 1
              from eav.producto_atributo pa
              where pa.producto_id = p.id
                and pa.atributo = f.atributo
                and (
                  (pa.tipo = 'texto' and pa.valor_texto = (f.valor #>> '{}'))
                  or (pa.tipo = 'numero' and pa.valor_numero = (f.valor #>> '{}')::numeric)
                  or (pa.tipo = 'booleano' and pa.valor_bool = (f.valor #>> '{}')::boolean)
                )
            )
        )
      )
  ),
  evaluacion as (
    select c.id, f.atributo,
      case
        when f.atributo is null then 'cumple'
        when f.atributo = 'precio' then
          case when catalogo.comparar_numero(c.precio, f.operador, f.valor) then 'cumple' else 'no' end
        when f.atributo = 'marca' then
          case when catalogo.comparar_valor(to_jsonb(c.marca), f.operador, f.valor) then 'cumple' else 'no' end
        when pa.atributo is null then 'sin_dato'
        when pa.tipo = 'numero' then
          case when catalogo.comparar_numero(pa.valor_numero, f.operador, f.valor) then 'cumple' else 'no' end
        when pa.tipo = 'booleano' then
          case when catalogo.comparar_valor(to_jsonb(pa.valor_bool), f.operador, f.valor) then 'cumple' else 'no' end
        else
          case when catalogo.comparar_valor(to_jsonb(pa.valor_texto), f.operador, f.valor) then 'cumple' else 'no' end
      end as estado
    from candidatos c
    left join filtros f on true
    left join eav.producto_atributo pa
      on pa.producto_id = c.id and pa.atributo = f.atributo
  )
  select
    c.id, c.nombre, c.marca, c.precio, c.descripcion, c.categoria,
    coalesce(array_agg(e.atributo order by e.atributo) filter (where e.estado = 'cumple' and e.atributo is not null), '{}'::text[]) as cumple,
    coalesce(array_agg(e.atributo order by e.atributo) filter (where e.estado = 'sin_dato'), '{}'::text[]) as sin_dato,
    bool_and(e.estado <> 'no') as valido
  from candidatos c
  join evaluacion e on e.id = c.id
  group by c.id, c.nombre, c.marca, c.precio, c.descripcion, c.categoria;
$$;

create or replace function eav.buscar_productos(
  p_dominio text, p_categoria text, p_filtros jsonb,
  p_incluir_sin_dato boolean default false, p_limite integer default 20
)
returns table (id bigint, nombre text, marca text, precio numeric, descripcion text, cumple text[], sin_dato text[])
language sql stable
set search_path = eav, catalogo, pg_temp
as $$
  select e.id, e.nombre, e.marca, e.precio, e.descripcion, e.cumple, e.sin_dato
  from eav.evaluar_filtros(p_dominio, p_categoria, p_filtros, not p_incluir_sin_dato) e
  where e.valido and (p_incluir_sin_dato or e.sin_dato = '{}'::text[])
  order by cardinality(e.sin_dato), e.precio, e.id
  limit least(greatest(coalesce(p_limite, 20), 1), 200);
$$;

create or replace function eav.contar_productos(
  p_dominio text, p_categoria text, p_filtros jsonb, p_incluir_sin_dato boolean default false
)
returns table (total bigint, faltantes bigint)
language sql stable
set search_path = eav, catalogo, pg_temp
as $$
  select
    count(*) filter (where p_incluir_sin_dato or e.sin_dato = '{}'::text[]) as total,
    count(*) filter (where e.sin_dato <> '{}'::text[]) as faltantes
  from eav.evaluar_filtros(p_dominio, p_categoria, p_filtros, false) e
  where e.valido;
$$;

-- ============================================================================
-- 2. Esquema Tabla Ancha (`ancha`)
-- ============================================================================

create table if not exists ancha.producto (
  id                  bigint primary key,
  dominio             text not null,
  categoria           text not null,
  nombre              text not null,
  marca               text not null,
  precio              numeric(10, 2) not null,
  descripcion         text not null,
  uso_previsto        text not null,
  clase_riesgo        text not null,
  apto_consumo        boolean,
  requiere_receta     boolean,
  sustancia_activa    text,
  concentracion_mg    numeric,
  forma_farmaceutica  text,
  via_administracion  text,
  piezas              numeric,
  sin_azucar          boolean,
  indice_carga        numeric,
  indice_velocidad    text,
  ancho_mm            numeric,
  perfil_pct          numeric,
  rin_pulg            numeric,
  temporada           text,
  run_flat            boolean,
  garantia_km         numeric,
  anio_fabricacion    numeric,
  zona_aplicacion     text,
  contenido_ml        numeric,
  fragancia           text,
  tipo_piel           text,
  acabado             text,
  spf                 numeric,
  vegano              boolean,
  sin_parabenos       boolean
);

create index if not exists producto_dominio_categoria_idx on ancha.producto (dominio, categoria);
create index if not exists producto_farmacia_idx on ancha.producto (dominio, categoria, sustancia_activa, forma_farmaceutica) where dominio = 'farmacia';
create index if not exists producto_llantas_idx on ancha.producto (dominio, categoria, ancho_mm, perfil_pct, rin_pulg) where dominio = 'llantas';
create index if not exists producto_belleza_idx on ancha.producto (dominio, categoria, tipo_piel, fragancia) where dominio = 'belleza';

create or replace function ancha.evaluar_filtros(
  p_dominio text, p_categoria text, p_filtros jsonb, p_solo_con_dato boolean default false
)
returns table (
  id bigint, nombre text, marca text, precio numeric, descripcion text, categoria text,
  cumple text[], sin_dato text[], valido boolean
)
language sql stable
set search_path = ancha, catalogo, pg_temp
as $$
  with filtros as (
    select
      f ->> 'atributo' as atributo,
      f ->> 'operador' as operador,
      f -> 'valor' as valor
    from jsonb_array_elements(coalesce(p_filtros, '[]'::jsonb)) as f
  ),
  eq_map as (
    select coalesce(jsonb_object_agg(atributo, valor), '{}'::jsonb) as doc
    from filtros
    where operador = '='
  ),
  candidatos as (
    select p.*
    from ancha.producto p, eq_map m
    where p.dominio = p_dominio
      and (p_categoria is null or p.categoria = p_categoria)
      and (
        not p_solo_con_dato
        or (
          (not (m.doc ? 'tipo_piel') or p.tipo_piel = (m.doc ->> 'tipo_piel'))
          and (not (m.doc ? 'fragancia') or p.fragancia = (m.doc ->> 'fragancia'))
          and (not (m.doc ? 'vegano') or p.vegano = (m.doc ->> 'vegano')::boolean)
          and (not (m.doc ? 'sin_parabenos') or p.sin_parabenos = (m.doc ->> 'sin_parabenos')::boolean)
          and (not (m.doc ? 'sustancia_activa') or p.sustancia_activa = (m.doc ->> 'sustancia_activa'))
          and (not (m.doc ? 'forma_farmaceutica') or p.forma_farmaceutica = (m.doc ->> 'forma_farmaceutica'))
          and (not (m.doc ? 'ancho_mm') or p.ancho_mm = (m.doc ->> 'ancho_mm')::numeric)
          and (not (m.doc ? 'perfil_pct') or p.perfil_pct = (m.doc ->> 'perfil_pct')::numeric)
          and (not (m.doc ? 'rin_pulg') or p.rin_pulg = (m.doc ->> 'rin_pulg')::numeric)
        )
      )
  ),
  evaluacion as (
    select c.id, f.atributo,
      case
        when f.atributo is null then 'cumple'
        when f.atributo = 'precio' then
          case when catalogo.comparar_numero(c.precio, f.operador, f.valor) then 'cumple' else 'no' end
        when f.atributo = 'marca' then
          case when catalogo.comparar_valor(to_jsonb(c.marca), f.operador, f.valor) then 'cumple' else 'no' end
        when f.atributo in ('concentracion_mg', 'piezas', 'indice_carga', 'ancho_mm', 'perfil_pct', 'rin_pulg', 'garantia_km', 'anio_fabricacion', 'contenido_ml', 'spf') then
          case
            when (case f.atributo
              when 'concentracion_mg' then c.concentracion_mg
              when 'piezas' then c.piezas
              when 'indice_carga' then c.indice_carga
              when 'ancho_mm' then c.ancho_mm
              when 'perfil_pct' then c.perfil_pct
              when 'rin_pulg' then c.rin_pulg
              when 'garantia_km' then c.garantia_km
              when 'anio_fabricacion' then c.anio_fabricacion
              when 'contenido_ml' then c.contenido_ml
              when 'spf' then c.spf
            end) is null then 'sin_dato'
            when catalogo.comparar_numero(
              (case f.atributo
                when 'concentracion_mg' then c.concentracion_mg
                when 'piezas' then c.piezas
                when 'indice_carga' then c.indice_carga
                when 'ancho_mm' then c.ancho_mm
                when 'perfil_pct' then c.perfil_pct
                when 'rin_pulg' then c.rin_pulg
                when 'garantia_km' then c.garantia_km
                when 'anio_fabricacion' then c.anio_fabricacion
                when 'contenido_ml' then c.contenido_ml
                when 'spf' then c.spf
              end), f.operador, f.valor) then 'cumple'
            else 'no'
          end
        when f.atributo in ('apto_consumo', 'requiere_receta', 'sin_azucar', 'run_flat', 'vegano', 'sin_parabenos') then
          case
            when (case f.atributo
              when 'apto_consumo' then c.apto_consumo
              when 'requiere_receta' then c.requiere_receta
              when 'sin_azucar' then c.sin_azucar
              when 'run_flat' then c.run_flat
              when 'vegano' then c.vegano
              when 'sin_parabenos' then c.sin_parabenos
            end) is null then 'sin_dato'
            when catalogo.comparar_valor(
              to_jsonb(case f.atributo
                when 'apto_consumo' then c.apto_consumo
                when 'requiere_receta' then c.requiere_receta
                when 'sin_azucar' then c.sin_azucar
                when 'run_flat' then c.run_flat
                when 'vegano' then c.vegano
                when 'sin_parabenos' then c.sin_parabenos
              end), f.operador, f.valor) then 'cumple'
            else 'no'
          end
        else
          case
            when (case f.atributo
              when 'uso_previsto' then c.uso_previsto
              when 'clase_riesgo' then c.clase_riesgo
              when 'sustancia_activa' then c.sustancia_activa
              when 'forma_farmaceutica' then c.forma_farmaceutica
              when 'via_administracion' then c.via_administracion
              when 'indice_velocidad' then c.indice_velocidad
              when 'temporada' then c.temporada
              when 'zona_aplicacion' then c.zona_aplicacion
              when 'fragancia' then c.fragancia
              when 'tipo_piel' then c.tipo_piel
              when 'acabado' then c.acabado
            end) is null then 'sin_dato'
            when catalogo.comparar_valor(
              to_jsonb(case f.atributo
                when 'uso_previsto' then c.uso_previsto
                when 'clase_riesgo' then c.clase_riesgo
                when 'sustancia_activa' then c.sustancia_activa
                when 'forma_farmaceutica' then c.forma_farmaceutica
                when 'via_administracion' then c.via_administracion
                when 'indice_velocidad' then c.indice_velocidad
                when 'temporada' then c.temporada
                when 'zona_aplicacion' then c.zona_aplicacion
                when 'fragancia' then c.fragancia
                when 'tipo_piel' then c.tipo_piel
                when 'acabado' then c.acabado
              end), f.operador, f.valor) then 'cumple'
            else 'no'
          end
      end as estado
    from candidatos c
    left join filtros f on true
  )
  select
    c.id, c.nombre, c.marca, c.precio, c.descripcion, c.categoria,
    coalesce(array_agg(e.atributo order by e.atributo) filter (where e.estado = 'cumple' and e.atributo is not null), '{}'::text[]) as cumple,
    coalesce(array_agg(e.atributo order by e.atributo) filter (where e.estado = 'sin_dato'), '{}'::text[]) as sin_dato,
    bool_and(e.estado <> 'no') as valido
  from candidatos c
  join evaluacion e on e.id = c.id
  group by c.id, c.nombre, c.marca, c.precio, c.descripcion, c.categoria;
$$;

create or replace function ancha.buscar_productos(
  p_dominio text, p_categoria text, p_filtros jsonb,
  p_incluir_sin_dato boolean default false, p_limite integer default 20
)
returns table (id bigint, nombre text, marca text, precio numeric, descripcion text, cumple text[], sin_dato text[])
language sql stable
set search_path = ancha, catalogo, pg_temp
as $$
  select e.id, e.nombre, e.marca, e.precio, e.descripcion, e.cumple, e.sin_dato
  from ancha.evaluar_filtros(p_dominio, p_categoria, p_filtros, not p_incluir_sin_dato) e
  where e.valido and (p_incluir_sin_dato or e.sin_dato = '{}'::text[])
  order by cardinality(e.sin_dato), e.precio, e.id
  limit least(greatest(coalesce(p_limite, 20), 1), 200);
$$;

create or replace function ancha.contar_productos(
  p_dominio text, p_categoria text, p_filtros jsonb, p_incluir_sin_dato boolean default false
)
returns table (total bigint, faltantes bigint)
language sql stable
set search_path = ancha, catalogo, pg_temp
as $$
  select
    count(*) filter (where p_incluir_sin_dato or e.sin_dato = '{}'::text[]) as total,
    count(*) filter (where e.sin_dato <> '{}'::text[]) as faltantes
  from ancha.evaluar_filtros(p_dominio, p_categoria, p_filtros, false) e
  where e.valido;
$$;
