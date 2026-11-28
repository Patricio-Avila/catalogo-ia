-- 0010: ficha del producto y aviso de farmacia (RF-05, G3, G5; 2026-11-28).
--
-- Ficha del producto. La interfaz muestra, para cada resultado de POST /buscar,
-- su categoría y sus atributos tal como están en la base (clave ausente = sin
-- dato). buscar_productos solo devolvía nombre, marca, precio, descripción y el
-- motivo (cumple, sin_dato), y el agente no puede leer producto directamente
-- (G3), así que la ficha no tenía de dónde salir.
--
-- Cambio: buscar_productos agrega categoria y atributos a su salida, entre
-- descripcion y cumple. atributos ya venía de filtrar_productos; categoria se toma
-- de producto por llave primaria, solo para la página devuelta (20 filas por
-- omisión, 200 como máximo). Así filtrar_productos no cambia, ni tampoco
-- contar_productos, calcular_facetas, la prueba de equivalencia (07) ni
-- pnpm medir, que dependen de ella. El resto del cuerpo es el de 0007: mismo
-- orden, mismo tope de filas, SECURITY DEFINER y search_path fijo.
--
-- CREATE OR REPLACE no permite cambiar las columnas de salida, así que la función
-- se borra y se vuelve a crear. DROP se lleva el dueño y los permisos: se reponen
-- igual que en 0005 (dueño catalogo_duenio, sin EXECUTE para PUBLIC, EXECUTE para
-- agente_lectura).
--
-- Aviso de farmacia. El texto que insertó 0003 decía "dosis", que es vocabulario
-- prohibido en cualquier texto que vea el usuario (CLAUDE.md §6;
-- packages/core/src/vocabulario.ts). Se reemplaza por uno con el mismo sentido y
-- sin palabras vedadas. Va en una migración, no en seed.sql, porque la
-- configuración de las verticales debe existir también en la nube, donde el seed
-- no corre. La prueba 03_diccionario.test.sql exige que ningún aviso case con el
-- patrón del vocabulario prohibido.

drop function catalogo.buscar_productos(text, text, jsonb, boolean, integer);

-- Búsqueda (RF-05): el motivo de coincidencia y la ficha se calculan solo para la
-- página devuelta.
create function catalogo.buscar_productos(
  p_dominio text, p_categoria text, p_filtros jsonb,
  p_incluir_sin_dato boolean default false, p_limite integer default 20)
returns table (
  id bigint, nombre text, marca text, precio numeric, descripcion text,
  categoria text, atributos jsonb, cumple text[], sin_dato text[]
)
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
  select g.id, g.nombre, g.marca, g.precio, g.descripcion, p.categoria, g.atributos,
    coalesce((select array_agg(f.atributo order by f.atributo) from filtros f
              where f.atributo is not null
                and estado_filtro(g.precio, g.marca, g.atributos, f.atributo, f.operador, f.valor) = 'cumple'), '{}'::text[]) as cumple,
    coalesce((select array_agg(f.atributo order by f.atributo) from filtros f
              where estado_filtro(g.precio, g.marca, g.atributos, f.atributo, f.operador, f.valor) = 'sin_dato'), '{}'::text[]) as sin_dato
  from pagina g
  join producto p on p.id = g.id
  order by g.n_sin_dato, g.precio, g.id;
$$;

-- Dueño sin superusuario y permisos mínimos (§7.2.5), como en 0005.
alter function catalogo.buscar_productos(text, text, jsonb, boolean, integer) owner to catalogo_duenio;
revoke execute on function catalogo.buscar_productos(text, text, jsonb, boolean, integer) from public;
grant execute on function catalogo.buscar_productos(text, text, jsonb, boolean, integer) to agente_lectura;

-- Aviso de farmacia sin vocabulario prohibido. El espejo del núcleo está en
-- packages/core/src/datos_prueba/verticales.ts.
update catalogo.vertical
set aviso = 'Este catálogo solo permite buscar productos. No recomienda productos, no sugiere cambios entre ellos ni da indicaciones de uso. Consulta a un profesional de la salud.',
    actualizado_en = now()
where dominio = 'farmacia';
