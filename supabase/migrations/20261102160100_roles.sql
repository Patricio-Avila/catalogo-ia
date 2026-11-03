-- 0002: roles y usuario de conexión (G3, G4; RNF-01, RNF-02, RNF-04; §7.2 puntos 5 y 8).
--
--   catalogo_duenio  dueño de las funciones SECURITY DEFINER. Sin superusuario, sin LOGIN.
--                    Solo lee catalogo y escribe en servicio. Nunca toca interno.
--   agente_lectura   rol del agente: USAGE en catalogo y servicio, SELECT en la
--                    configuración pública (vertical, categoria) y EXECUTE en las
--                    funciones de búsqueda. Nada más. statement_timeout de 2 s.
--   agente_api       usuario LOGIN con el que se conecta la Edge Function; hereda
--                    agente_lectura. Su contraseña NO está aquí: en local la fija
--                    seed.sql (solo desarrollo) y en la nube se fija a mano al
--                    desplegar y se guarda en supabase secrets (T9).
--
-- Los roles son globales al clúster; se crean solo si no existen para que
-- `supabase db reset` sea repetible.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'catalogo_duenio') then
    create role catalogo_duenio nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'agente_lectura') then
    create role agente_lectura nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'agente_api') then
    create role agente_api login password null;
  end if;

  -- El rol que corre las migraciones (postgres en Supabase) no es superusuario.
  -- Para cambiar el dueño de funciones y vistas a catalogo_duenio, y para que las
  -- pruebas hagan SET ROLE agente_lectura, necesita membresía con SET en ambos.
  -- Con catalogo_duenio hereda además sus privilegios: así puede ejecutar
  -- refrescar_diccionario() y administrar la caché.
  execute format('grant catalogo_duenio to %I with set true, inherit true', current_user);
  execute format('grant agente_lectura to %I with set true, inherit false', current_user);
end
$$;

grant agente_lectura to agente_api;

-- G4: tiempo máximo por consulta. Se fija en ambos porque la configuración de rol
-- aplica a la sesión del usuario que inicia sesión (agente_api), no a SET ROLE.
alter role agente_lectura set statement_timeout = '2s';
alter role agente_api set statement_timeout = '2s';
alter role agente_api set search_path = catalogo, servicio;

-- Esquemas. catalogo_duenio necesita CREATE para poder ser dueño de las funciones
-- y la vista materializada que viven ahí; el agente solo USAGE.
grant usage, create on schema catalogo to catalogo_duenio;
grant usage, create on schema servicio to catalogo_duenio;
grant usage on schema catalogo to agente_lectura;
grant usage on schema servicio to agente_lectura;
-- interno: nadie más que el administrador (RNF-02). No se otorga nada.

-- catalogo_duenio: lectura del catálogo (las funciones corren con sus permisos)
grant select on all tables in schema catalogo to catalogo_duenio;
alter default privileges in schema catalogo grant select on tables to catalogo_duenio;
alter default privileges in schema catalogo grant select on sequences to catalogo_duenio;
alter default privileges in schema servicio grant select, insert, update, delete on tables to catalogo_duenio;

-- agente_lectura: solo la configuración pública; el catálogo únicamente por funciones (G3)
grant select on catalogo.vertical, catalogo.categoria to agente_lectura;

-- El esquema public conserva el USAGE que PostgreSQL concede a PUBLIC; el proyecto
-- no crea nada ahí, así que el agente no encuentra tablas aunque pueda verlo.
