-- 0006: caché exacta de interpretaciones (CLAUDE.md §6; §7.2.7).
--
-- La tabla vive en servicio y el agente no la ve. El núcleo la usa a través de dos
-- funciones SECURITY DEFINER: obtener (cuenta el acierto) y guardar (upsert).
-- Solo se guardan objetos que pasaron G1; la clave incluye la versión del
-- diccionario, así que un refresco invalida las entradas sin borrarlas; las
-- obsoletas se limpian al refrescar.

create table servicio.cache_consultas (
  clave               text primary key check (clave ~ '^[0-9a-f]{64}$'),
  entrada             jsonb not null check (jsonb_typeof(entrada) = 'object'),
  version_diccionario text not null,
  creado_en           timestamptz not null default now(),
  usado_en            timestamptz not null default now(),
  aciertos            integer not null default 0
);
create index cache_consultas_version_idx on servicio.cache_consultas (version_diccionario);
comment on table servicio.cache_consultas is 'Caché exacta: clave = SHA-256(dominio, categoría, texto normalizado, filtros vigentes, versión del diccionario).';

grant select, insert, update, delete on servicio.cache_consultas to catalogo_duenio;

create function servicio.cache_obtener(p_clave text) returns jsonb
language sql volatile
security definer
set search_path = servicio, pg_temp
as $$
  update servicio.cache_consultas
  set aciertos = aciertos + 1, usado_en = now()
  where clave = p_clave
  returning entrada;
$$;

create function servicio.cache_guardar(p_clave text, p_entrada jsonb) returns void
language sql volatile
security definer
set search_path = servicio, pg_temp
as $$
  insert into servicio.cache_consultas (clave, entrada, version_diccionario)
  values (p_clave, p_entrada, coalesce(p_entrada ->> 'version_diccionario', '0'))
  on conflict (clave) do update
    set entrada = excluded.entrada,
        version_diccionario = excluded.version_diccionario,
        usado_en = now();
$$;

-- Limpieza de entradas cuya versión ya no es la vigente de ninguna vertical. Administrador.
create function servicio.cache_limpiar_obsoletas() returns bigint
language sql volatile
security definer
set search_path = servicio, catalogo, pg_temp
as $$
  with borradas as (
    delete from servicio.cache_consultas c
    where not exists (select 1 from catalogo.vertical v where v.version_diccionario = c.version_diccionario)
    returning 1
  )
  select count(*) from borradas;
$$;

alter function servicio.cache_obtener(text) owner to catalogo_duenio;
alter function servicio.cache_guardar(text, jsonb) owner to catalogo_duenio;
alter function servicio.cache_limpiar_obsoletas() owner to catalogo_duenio;

revoke execute on function servicio.cache_obtener(text) from public;
revoke execute on function servicio.cache_guardar(text, jsonb) from public;
revoke execute on function servicio.cache_limpiar_obsoletas() from public;

grant execute on function servicio.cache_obtener(text) to agente_lectura;
grant execute on function servicio.cache_guardar(text, jsonb) to agente_lectura;
