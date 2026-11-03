-- seed.sql: catálogo sintético de tres verticales (CLAUDE.md §7.4; objetivo particular 2).
-- Corre con `supabase db reset` en local. En la nube se carga a mano en T9.
--
-- Reglas del generador:
--   - Semilla fija: la carga es reproducible entre máquinas.
--   - Primero se generan los atributos completos (la verdad) y se guardan en
--     interno.producto_verdad; después se borran de producto.atributos los técnicos
--     que caen fuera de la cobertura meta. Los de contexto nunca se borran.
--   - La descripción se redacta por plantilla desde los atributos completos:
--     menciona los técnicos presentes, con probabilidad 0.3 uno de los borrados y
--     con probabilidad 0.5 el contexto. El sistema debe funcionar aunque la calle.
--   - Pares trampa: tres por vertical, mismos técnicos, distinto uso o riesgo.
--   - Nombres sintéticos; marcas "Marca A" a "Marca H"; en farmacia solo
--     sustancias genéricas y usos amplios, nunca indicaciones clínicas.
-- Del orden de 10^5 productos: 16,667 por categoría, seis categorías.

select setseed(0.42);

-- Contraseña del usuario de conexión SOLO para el stack local. En la nube se fija
-- a mano al desplegar y vive en supabase secrets (CLAUDE.md §1.6, §7.2.8).
alter role agente_api with password 'agente_api_local';

-- ---------------------------------------------------------------------------
-- Utilidades del generador (viven en interno: el agente no las ve)
-- ---------------------------------------------------------------------------

create or replace function interno.elegir(p_opciones text[]) returns text
language sql volatile as $$
  select p_opciones[1 + floor(random() * array_length(p_opciones, 1))::int];
$$;

create or replace function interno.elegir_numero(p_opciones numeric[]) returns numeric
language sql volatile as $$
  select p_opciones[1 + floor(random() * array_length(p_opciones, 1))::int];
$$;

create or replace function interno.formatear_valor(p_clave text, p_valor text) returns text
language sql immutable as $$
  select case
    when p_valor = 'true' then 'sí'
    when p_valor = 'false' then 'no'
    when p_clave like '%\_mm' then p_valor || ' mm'
    when p_clave like '%\_ml' then p_valor || ' ml'
    when p_clave like '%\_mg' then p_valor || ' mg'
    when p_clave like '%\_km' then p_valor || ' km'
    when p_clave like '%\_pct' then p_valor || ' %'
    when p_clave like '%\_pulg' then p_valor || ' pulgadas'
    else p_valor end;
$$;

-- Descripción por plantilla. p_contexto: claves que no se listan como técnicos.
create or replace function interno.redactar_descripcion(
  p_nombre text, p_completos jsonb, p_presentes jsonb, p_contexto text[]) returns text
language plpgsql volatile as $$
declare
  v_partes   text[] := '{}';
  v_borrados text[];
  v_clave    text;
  v_valor    text;
  v_texto    text;
begin
  for v_clave, v_valor in
    select key, value #>> '{}' from jsonb_each(p_presentes)
    where not (key = any (p_contexto)) order by key
  loop
    v_partes := v_partes || (replace(v_clave, '_', ' ') || ': ' || interno.formatear_valor(v_clave, v_valor));
  end loop;

  select array_agg(key) into v_borrados
  from jsonb_each(p_completos)
  where not (key = any (p_contexto)) and not (p_presentes ? key);

  if v_borrados is not null and random() < 0.3 then
    v_clave := interno.elegir(v_borrados);
    v_partes := v_partes || (replace(v_clave, '_', ' ') || ': ' || interno.formatear_valor(v_clave, p_completos ->> v_clave));
  end if;

  v_texto := p_nombre || '.';
  if cardinality(v_partes) > 0 then
    v_texto := v_texto || ' ' || array_to_string(v_partes, '; ') || '.';
  end if;
  if random() < 0.5 then
    v_texto := v_texto || ' Uso previsto: ' || (p_completos ->> 'uso_previsto') || '. Riesgo: ' || (p_completos ->> 'clase_riesgo') || '.';
  end if;
  return v_texto;
end
$$;

-- ---------------------------------------------------------------------------
-- Generación en una tabla temporal: primero la verdad completa, luego la cobertura
-- ---------------------------------------------------------------------------

create temp table gen (
  id          bigint generated always as identity,
  dominio     text not null,
  categoria   text not null,
  nombre      text not null,
  marca       text not null,
  precio      numeric(10, 2) not null,
  completos   jsonb not null,
  presentes   jsonb,
  descripcion text
);

-- farmacia / medicamentos --------------------------------------------------
insert into gen (dominio, categoria, nombre, marca, precio, completos)
select 'farmacia', 'medicamentos',
  initcap(b.sustancia) || ' ' || b.conc || ' mg ' || b.forma
    || case when b.forma in ('jarabe', 'suspensión', 'gel') then '' else ', ' || b.piezas || ' piezas' end,
  'Marca ' || chr(65 + (b.g % 8)),
  round((30 + random() * 570)::numeric, 2),
  jsonb_build_object(
    'uso_previsto', 'alivio sintomático',
    'requiere_receta', b.receta,
    'clase_riesgo', case when b.receta then 'uso bajo supervisión' else 'ninguno' end,
    'apto_consumo', true,
    'sustancia_activa', b.sustancia,
    'concentracion_mg', b.conc,
    'forma_farmaceutica', b.forma,
    'via_administracion', case when b.forma = 'gel' then 'tópica' else 'oral' end,
    'piezas', b.piezas,
    'sin_azucar', b.sin_azucar)
from (
  select g,
    interno.elegir(array['paracetamol', 'ibuprofeno', 'naproxeno', 'loratadina', 'cetirizina', 'omeprazol', 'ambroxol', 'diclofenaco']) as sustancia,
    interno.elegir_numero(array[100, 200, 250, 400, 500, 600, 650, 800, 1000]) as conc,
    interno.elegir(array['tableta', 'tableta', 'cápsula', 'jarabe', 'suspensión', 'sobre', 'gel']) as forma,
    interno.elegir_numero(array[10, 12, 20, 24, 30, 60, 100]) as piezas,
    random() < 0.35 as sin_azucar,
    random() < 0.25 as receta
  from generate_series(1, 16667) as g
) b;

-- farmacia / suplementos ---------------------------------------------------
insert into gen (dominio, categoria, nombre, marca, precio, completos)
select 'farmacia', 'suplementos',
  initcap(b.sustancia) || ' ' || b.conc || ' mg ' || b.forma || ', ' || b.piezas || ' piezas',
  'Marca ' || chr(65 + (b.g % 8)),
  round((60 + random() * 540)::numeric, 2),
  jsonb_build_object(
    'uso_previsto', 'suplemento',
    'requiere_receta', false,
    'clase_riesgo', 'ninguno',
    'apto_consumo', true,
    'sustancia_activa', b.sustancia,
    'concentracion_mg', b.conc,
    'forma_farmaceutica', b.forma,
    'via_administracion', 'oral',
    'piezas', b.piezas,
    'sin_azucar', b.sin_azucar)
from (
  select g,
    interno.elegir(array['vitamina c', 'vitamina d', 'complejo b', 'omega 3', 'magnesio', 'zinc', 'colágeno', 'probióticos']) as sustancia,
    interno.elegir_numero(array[100, 250, 500, 1000]) as conc,
    interno.elegir(array['tableta', 'cápsula', 'cápsula', 'sobre']) as forma,
    interno.elegir_numero(array[30, 60, 90, 120]) as piezas,
    random() < 0.5 as sin_azucar
  from generate_series(1, 16667) as g
) b;

-- llantas / pasajeros ------------------------------------------------------
insert into gen (dominio, categoria, nombre, marca, precio, completos)
select 'llantas', 'pasajeros',
  'Llanta ' || b.ancho || '/' || b.perfil || ' R' || b.rin || ' ' || b.carga || b.velocidad || ' ' || b.uso,
  'Marca ' || chr(65 + (b.g % 8)),
  round((900 + random() * 3100)::numeric, 2),
  jsonb_build_object(
    'uso_previsto', b.uso,
    'indice_carga', b.carga,
    'indice_velocidad', b.velocidad,
    'clase_riesgo', 'ninguno',
    'ancho_mm', b.ancho,
    'perfil_pct', b.perfil,
    'rin_pulg', b.rin,
    'temporada', b.temporada,
    'run_flat', b.run_flat,
    'garantia_km', b.garantia,
    'anio_fabricacion', b.anio)
from (
  select g,
    interno.elegir_numero(array[165, 175, 185, 195, 205, 215, 225, 235]) as ancho,
    interno.elegir_numero(array[40, 45, 50, 55, 60, 65, 70]) as perfil,
    13 + floor(random() * 7)::int as rin,
    75 + floor(random() * 26)::int as carga,
    interno.elegir(array['S', 'T', 'H', 'V', 'W']) as velocidad,
    interno.elegir(array['urbano', 'urbano', 'carretera', 'carretera', 'todo terreno']) as uso,
    interno.elegir(array['verano', 'todo tiempo', 'todo tiempo', 'invierno']) as temporada,
    random() < 0.5 as run_flat,
    interno.elegir_numero(array[40000, 50000, 60000, 80000, 100000]) as garantia,
    2022 + floor(random() * 5)::int as anio
  from generate_series(1, 16667) as g
) b;

-- llantas / carga_ligera ---------------------------------------------------
insert into gen (dominio, categoria, nombre, marca, precio, completos)
select 'llantas', 'carga_ligera',
  'Llanta ' || b.ancho || '/' || b.perfil || ' R' || b.rin || ' ' || b.carga || b.velocidad || ' ' || b.uso,
  'Marca ' || chr(65 + (b.g % 8)),
  round((1400 + random() * 4600)::numeric, 2),
  jsonb_build_object(
    'uso_previsto', b.uso,
    'indice_carga', b.carga,
    'indice_velocidad', b.velocidad,
    'clase_riesgo', 'ninguno',
    'ancho_mm', b.ancho,
    'perfil_pct', b.perfil,
    'rin_pulg', b.rin,
    'temporada', b.temporada,
    'run_flat', b.run_flat,
    'garantia_km', b.garantia,
    'anio_fabricacion', b.anio)
from (
  select g,
    interno.elegir_numero(array[195, 205, 215, 225, 235, 245, 255, 265]) as ancho,
    interno.elegir_numero(array[55, 60, 65, 70, 75, 80]) as perfil,
    15 + floor(random() * 6)::int as rin,
    98 + floor(random() * 24)::int as carga,
    interno.elegir(array['S', 'T', 'H']) as velocidad,
    interno.elegir(array['carretera', 'carretera', 'todo terreno', 'remolque']) as uso,
    interno.elegir(array['verano', 'todo tiempo', 'todo tiempo', 'invierno']) as temporada,
    random() < 0.5 as run_flat,
    interno.elegir_numero(array[40000, 50000, 60000, 80000, 100000]) as garantia,
    2022 + floor(random() * 5)::int as anio
  from generate_series(1, 16667) as g
) b;

-- belleza / cuidado_facial -------------------------------------------------
insert into gen (dominio, categoria, nombre, marca, precio, completos)
select 'belleza', 'cuidado_facial',
  initcap(b.tipo) || case when b.tipo = 'protector solar' then ' FPS ' || b.spf else '' end
    || ' para piel ' || b.tipo_piel || ' ' || b.contenido || ' ml',
  'Marca ' || chr(65 + (b.g % 8)),
  round((80 + random() * 920)::numeric, 2),
  jsonb_build_object(
    'uso_previsto', case b.tipo when 'gel limpiador' then 'limpiar' when 'tónico' then 'limpiar' when 'protector solar' then 'proteger' else 'hidratar' end,
    'zona_aplicacion', case when b.r_zona < 0.15 then 'contorno de ojos' else 'rostro' end,
    'clase_riesgo', case when b.tipo = 'protector solar' or (b.tipo = 'gel limpiador' and b.r_riesgo < 0.5) then 'evitar contacto con ojos' else 'ninguno' end,
    'apto_consumo', false,
    'contenido_ml', b.contenido,
    'fragancia', b.fragancia,
    'tipo_piel', b.tipo_piel,
    'acabado', b.acabado,
    'spf', b.spf,
    'vegano', b.vegano,
    'sin_parabenos', b.sin_parabenos)
from (
  select g,
    interno.elegir(array['crema', 'crema', 'sérum', 'gel limpiador', 'tónico', 'protector solar']) as tipo,
    interno.elegir_numero(array[30, 50, 50, 100, 150, 200]) as contenido,
    interno.elegir(array['sin perfume', 'floral', 'cítrica', 'neutra']) as fragancia,
    interno.elegir(array['sensible', 'seca', 'grasa', 'mixta', 'normal']) as tipo_piel,
    interno.elegir(array['mate', 'luminoso', 'natural']) as acabado,
    interno.elegir_numero(array[15, 30, 50, 70]) as spf,
    random() < 0.5 as vegano,
    random() < 0.5 as sin_parabenos,
    random() as r_zona,
    random() as r_riesgo
  from generate_series(1, 16667) as g
) b;

-- belleza / cuidado_corporal -----------------------------------------------
insert into gen (dominio, categoria, nombre, marca, precio, completos)
select 'belleza', 'cuidado_corporal',
  initcap(b.tipo) || ' ' || b.fragancia || ' ' || b.contenido || ' ml',
  'Marca ' || chr(65 + (b.g % 8)),
  round((50 + random() * 650)::numeric, 2),
  jsonb_build_object(
    'uso_previsto', case b.tipo when 'exfoliante' then 'exfoliar' when 'jabón' then 'limpiar' else 'hidratar' end,
    'zona_aplicacion', 'cuerpo',
    'clase_riesgo', case
      when b.tipo = 'aceite' and b.r_riesgo < 0.10 then 'no aplicar puro'
      when b.tipo = 'exfoliante' and b.r_riesgo < 0.30 then 'evitar contacto con ojos'
      else 'ninguno' end,
    'apto_consumo', false,
    'contenido_ml', b.contenido,
    'fragancia', b.fragancia,
    'tipo_piel', b.tipo_piel,
    'acabado', b.acabado,
    'vegano', b.vegano,
    'sin_parabenos', b.sin_parabenos)
from (
  select g,
    interno.elegir(array['loción', 'aceite', 'exfoliante', 'crema corporal', 'crema corporal', 'jabón']) as tipo,
    interno.elegir_numero(array[100, 200, 250, 400, 500]) as contenido,
    interno.elegir(array['sin perfume', 'floral', 'cítrica', 'neutra']) as fragancia,
    interno.elegir(array['sensible', 'seca', 'grasa', 'mixta', 'normal']) as tipo_piel,
    interno.elegir(array['mate', 'luminoso', 'natural']) as acabado,
    random() < 0.5 as vegano,
    random() < 0.5 as sin_parabenos,
    random() as r_riesgo
  from generate_series(1, 16667) as g
) b;

-- ---------------------------------------------------------------------------
-- Cobertura: se borran técnicos según la meta por atributo (§7.4). Contexto intacto.
-- random() se evalúa por fila y por atributo.
-- ---------------------------------------------------------------------------

update gen set presentes = completos - array_remove(array[
    case when random() >= 0.90 then 'concentracion_mg' end,
    case when random() >= 0.95 then 'forma_farmaceutica' end,
    case when random() >= 0.70 then 'via_administracion' end,
    case when random() >= 0.85 then 'piezas' end,
    case when random() >= 0.40 then 'sin_azucar' end
  ], null)
where dominio = 'farmacia';

update gen set presentes = completos - array_remove(array[
    case when random() >= 0.70 then 'temporada' end,
    case when random() >= 0.45 then 'run_flat' end,
    case when random() >= 0.60 then 'garantia_km' end,
    case when random() >= 0.50 then 'anio_fabricacion' end
  ], null)
where dominio = 'llantas';

update gen set presentes = completos - array_remove(array[
    case when random() >= 0.95 then 'contenido_ml' end,
    case when random() >= 0.80 then 'fragancia' end,
    case when random() >= 0.60 then 'tipo_piel' end,
    case when random() >= 0.50 then 'acabado' end,
    case when random() >= 0.40 then 'spf' end,
    case when random() >= 0.40 then 'vegano' end,
    case when random() >= 0.50 then 'sin_parabenos' end
  ], null)
where dominio = 'belleza';

update gen set descripcion = interno.redactar_descripcion(
  nombre, completos, presentes,
  array['uso_previsto', 'clase_riesgo', 'apto_consumo', 'requiere_receta', 'zona_aplicacion', 'indice_carga', 'indice_velocidad']);

-- ---------------------------------------------------------------------------
-- Carga: producto (con cobertura) y verdad (completa)
-- ---------------------------------------------------------------------------

insert into catalogo.producto (id, dominio, categoria, nombre, marca, precio, descripcion, atributos)
select id, dominio, categoria, nombre, marca, precio, descripcion, presentes
from gen order by id;

insert into interno.producto_verdad (producto_id, atributos)
select id, completos from gen;

select setval(pg_get_serial_sequence('catalogo.producto', 'id'), (select max(id) from gen));

-- ---------------------------------------------------------------------------
-- Pares trampa (ADR-0005): mismos técnicos, distinto uso o riesgo. Tres por vertical.
-- ---------------------------------------------------------------------------

-- belleza 1: aceite corporal vs aceite concentrado (riesgo)
with a as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('belleza', 'cuidado_corporal', 'Aceite corporal neutro 200 ml', 'Marca A', 189.00,
   'Aceite corporal neutro 200 ml. contenido ml: 200 ml; fragancia: neutra; tipo piel: seca; vegano: sí.',
   '{"uso_previsto":"hidratar","zona_aplicacion":"cuerpo","clase_riesgo":"ninguno","apto_consumo":false,"contenido_ml":200,"fragancia":"neutra","tipo_piel":"seca","vegano":true}')
  returning id
), b as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('belleza', 'cuidado_corporal', 'Aceite concentrado neutro 200 ml', 'Marca B', 189.00,
   'Aceite concentrado neutro 200 ml. contenido ml: 200 ml; fragancia: neutra; tipo piel: seca; vegano: sí.',
   '{"uso_previsto":"hidratar","zona_aplicacion":"cuerpo","clase_riesgo":"no aplicar puro","apto_consumo":false,"contenido_ml":200,"fragancia":"neutra","tipo_piel":"seca","vegano":true}')
  returning id
)
insert into interno.par_trampa (dominio, producto_a, producto_b, motivo)
select 'belleza', a.id, b.id, 'aceite corporal vs aceite concentrado: mismos técnicos, clase_riesgo distinta' from a, b;

-- belleza 2: crema para rostro vs contorno de ojos (uso)
with a as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('belleza', 'cuidado_facial', 'Crema para piel sensible 50 ml', 'Marca C', 320.00,
   'Crema para piel sensible 50 ml. contenido ml: 50 ml; fragancia: sin perfume; tipo piel: sensible.',
   '{"uso_previsto":"hidratar","zona_aplicacion":"rostro","clase_riesgo":"ninguno","apto_consumo":false,"contenido_ml":50,"fragancia":"sin perfume","tipo_piel":"sensible"}')
  returning id
), b as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('belleza', 'cuidado_facial', 'Crema de contorno para piel sensible 50 ml', 'Marca D', 320.00,
   'Crema de contorno para piel sensible 50 ml. contenido ml: 50 ml; fragancia: sin perfume; tipo piel: sensible.',
   '{"uso_previsto":"hidratar","zona_aplicacion":"contorno de ojos","clase_riesgo":"ninguno","apto_consumo":false,"contenido_ml":50,"fragancia":"sin perfume","tipo_piel":"sensible"}')
  returning id
)
insert into interno.par_trampa (dominio, producto_a, producto_b, motivo)
select 'belleza', a.id, b.id, 'rostro vs contorno de ojos: mismos técnicos, zona_aplicacion distinta' from a, b;

-- belleza 3: exfoliante con y sin advertencia (riesgo)
with a as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('belleza', 'cuidado_corporal', 'Exfoliante cítrica 250 ml', 'Marca E', 210.00,
   'Exfoliante cítrica 250 ml. contenido ml: 250 ml; fragancia: cítrica; sin parabenos: sí.',
   '{"uso_previsto":"exfoliar","zona_aplicacion":"cuerpo","clase_riesgo":"ninguno","apto_consumo":false,"contenido_ml":250,"fragancia":"cítrica","sin_parabenos":true}')
  returning id
), b as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('belleza', 'cuidado_corporal', 'Exfoliante intensivo cítrica 250 ml', 'Marca F', 210.00,
   'Exfoliante intensivo cítrica 250 ml. contenido ml: 250 ml; fragancia: cítrica; sin parabenos: sí.',
   '{"uso_previsto":"exfoliar","zona_aplicacion":"cuerpo","clase_riesgo":"evitar contacto con ojos","apto_consumo":false,"contenido_ml":250,"fragancia":"cítrica","sin_parabenos":true}')
  returning id
)
insert into interno.par_trampa (dominio, producto_a, producto_b, motivo)
select 'belleza', a.id, b.id, 'exfoliante con y sin advertencia: mismos técnicos, clase_riesgo distinta' from a, b;

-- llantas 1: misma medida, carretera vs remolque (uso)
with a as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('llantas', 'carga_ligera', 'Llanta 215/65 R16 102T carretera', 'Marca A', 2450.00,
   'Llanta 215/65 R16 102T carretera. ancho mm: 215 mm; perfil pct: 65 %; rin pulg: 16 pulgadas; temporada: todo tiempo.',
   '{"uso_previsto":"carretera","indice_carga":102,"indice_velocidad":"T","clase_riesgo":"ninguno","ancho_mm":215,"perfil_pct":65,"rin_pulg":16,"temporada":"todo tiempo"}')
  returning id
), b as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('llantas', 'carga_ligera', 'Llanta 215/65 R16 102T remolque', 'Marca B', 2450.00,
   'Llanta 215/65 R16 102T remolque. ancho mm: 215 mm; perfil pct: 65 %; rin pulg: 16 pulgadas; temporada: todo tiempo.',
   '{"uso_previsto":"remolque","indice_carga":102,"indice_velocidad":"T","clase_riesgo":"ninguno","ancho_mm":215,"perfil_pct":65,"rin_pulg":16,"temporada":"todo tiempo"}')
  returning id
)
insert into interno.par_trampa (dominio, producto_a, producto_b, motivo)
select 'llantas', a.id, b.id, 'misma medida, carretera vs remolque: uso_previsto distinto' from a, b;

-- llantas 2: misma medida, índice de carga distinto (uso)
with a as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('llantas', 'pasajeros', 'Llanta 205/55 R16 91V carretera', 'Marca C', 1980.00,
   'Llanta 205/55 R16 91V carretera. ancho mm: 205 mm; perfil pct: 55 %; rin pulg: 16 pulgadas; run flat: no.',
   '{"uso_previsto":"carretera","indice_carga":91,"indice_velocidad":"V","clase_riesgo":"ninguno","ancho_mm":205,"perfil_pct":55,"rin_pulg":16,"run_flat":false}')
  returning id
), b as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('llantas', 'pasajeros', 'Llanta 205/55 R16 84V carretera', 'Marca D', 1980.00,
   'Llanta 205/55 R16 84V carretera. ancho mm: 205 mm; perfil pct: 55 %; rin pulg: 16 pulgadas; run flat: no.',
   '{"uso_previsto":"carretera","indice_carga":84,"indice_velocidad":"V","clase_riesgo":"ninguno","ancho_mm":205,"perfil_pct":55,"rin_pulg":16,"run_flat":false}')
  returning id
)
insert into interno.par_trampa (dominio, producto_a, producto_b, motivo)
select 'llantas', a.id, b.id, 'misma medida, indice_carga distinto' from a, b;

-- llantas 3: misma medida, índice de velocidad distinto (uso)
with a as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('llantas', 'pasajeros', 'Llanta 185/60 R15 84H urbano', 'Marca E', 1450.00,
   'Llanta 185/60 R15 84H urbano. ancho mm: 185 mm; perfil pct: 60 %; rin pulg: 15 pulgadas; temporada: verano.',
   '{"uso_previsto":"urbano","indice_carga":84,"indice_velocidad":"H","clase_riesgo":"ninguno","ancho_mm":185,"perfil_pct":60,"rin_pulg":15,"temporada":"verano"}')
  returning id
), b as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('llantas', 'pasajeros', 'Llanta 185/60 R15 84S urbano', 'Marca F', 1450.00,
   'Llanta 185/60 R15 84S urbano. ancho mm: 185 mm; perfil pct: 60 %; rin pulg: 15 pulgadas; temporada: verano.',
   '{"uso_previsto":"urbano","indice_carga":84,"indice_velocidad":"S","clase_riesgo":"ninguno","ancho_mm":185,"perfil_pct":60,"rin_pulg":15,"temporada":"verano"}')
  returning id
)
insert into interno.par_trampa (dominio, producto_a, producto_b, motivo)
select 'llantas', a.id, b.id, 'misma medida, indice_velocidad distinto' from a, b;

-- farmacia 1: misma sustancia, sin receta vs con receta (riesgo)
with a as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('farmacia', 'medicamentos', 'Ambroxol 30 mg jarabe', 'Marca A', 95.00,
   'Ambroxol 30 mg jarabe. concentracion mg: 30 mg; forma farmaceutica: jarabe; sin azucar: sí.',
   '{"uso_previsto":"alivio sintomático","requiere_receta":false,"clase_riesgo":"ninguno","apto_consumo":true,"sustancia_activa":"ambroxol","concentracion_mg":30,"forma_farmaceutica":"jarabe","via_administracion":"oral","sin_azucar":true}')
  returning id
), b as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('farmacia', 'medicamentos', 'Ambroxol compuesto 30 mg jarabe', 'Marca B', 95.00,
   'Ambroxol compuesto 30 mg jarabe. concentracion mg: 30 mg; forma farmaceutica: jarabe; sin azucar: sí.',
   '{"uso_previsto":"alivio sintomático","requiere_receta":true,"clase_riesgo":"uso bajo supervisión","apto_consumo":true,"sustancia_activa":"ambroxol","concentracion_mg":30,"forma_farmaceutica":"jarabe","via_administracion":"oral","sin_azucar":true}')
  returning id
)
insert into interno.par_trampa (dominio, producto_a, producto_b, motivo)
select 'farmacia', a.id, b.id, 'misma sustancia y forma, sin receta vs con receta: riesgo distinto' from a, b;

-- farmacia 2: misma sustancia y concentración, vía oral vs tópica (uso)
with a as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('farmacia', 'medicamentos', 'Diclofenaco 50 mg tableta, 20 piezas', 'Marca C', 140.00,
   'Diclofenaco 50 mg tableta, 20 piezas. concentracion mg: 50 mg; forma farmaceutica: tableta; piezas: 20.',
   '{"uso_previsto":"alivio sintomático","requiere_receta":false,"clase_riesgo":"ninguno","apto_consumo":true,"sustancia_activa":"diclofenaco","concentracion_mg":50,"forma_farmaceutica":"tableta","via_administracion":"oral","piezas":20}')
  returning id
), b as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('farmacia', 'medicamentos', 'Diclofenaco 50 mg gel', 'Marca D', 140.00,
   'Diclofenaco 50 mg gel. concentracion mg: 50 mg; forma farmaceutica: gel; piezas: 20.',
   '{"uso_previsto":"alivio sintomático","requiere_receta":false,"clase_riesgo":"ninguno","apto_consumo":true,"sustancia_activa":"diclofenaco","concentracion_mg":50,"forma_farmaceutica":"gel","via_administracion":"tópica","piezas":20}')
  returning id
)
insert into interno.par_trampa (dominio, producto_a, producto_b, motivo)
select 'farmacia', a.id, b.id, 'misma sustancia y concentración, vía oral vs tópica: uso distinto' from a, b;

-- farmacia 3: misma sustancia, medicamento vs suplemento (uso previsto, misma categoría de prueba: suplementos)
with a as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('farmacia', 'suplementos', 'Vitamina c 500 mg tableta, 30 piezas', 'Marca E', 120.00,
   'Vitamina c 500 mg tableta, 30 piezas. concentracion mg: 500 mg; forma farmaceutica: tableta; piezas: 30.',
   '{"uso_previsto":"suplemento","requiere_receta":false,"clase_riesgo":"ninguno","apto_consumo":true,"sustancia_activa":"vitamina c","concentracion_mg":500,"forma_farmaceutica":"tableta","via_administracion":"oral","piezas":30}')
  returning id
), b as (
  insert into catalogo.producto (dominio, categoria, nombre, marca, precio, descripcion, atributos) values
  ('farmacia', 'suplementos', 'Vitamina c 500 mg tableta efervescente, 30 piezas', 'Marca F', 120.00,
   'Vitamina c 500 mg tableta efervescente, 30 piezas. concentracion mg: 500 mg; forma farmaceutica: tableta; piezas: 30.',
   '{"uso_previsto":"alivio sintomático","requiere_receta":false,"clase_riesgo":"ninguno","apto_consumo":true,"sustancia_activa":"vitamina c","concentracion_mg":500,"forma_farmaceutica":"tableta","via_administracion":"oral","piezas":30}')
  returning id
)
insert into interno.par_trampa (dominio, producto_a, producto_b, motivo)
select 'farmacia', a.id, b.id, 'misma sustancia y presentación, uso_previsto distinto' from a, b;

-- Verdad de los pares trampa: sus atributos están completos.
insert into interno.producto_verdad (producto_id, atributos)
select p.id, p.atributos
from catalogo.producto p
where not exists (select 1 from interno.producto_verdad v where v.producto_id = p.id);

-- Márgenes de ejemplo: información interna que el agente nunca ve (RNF-02).
insert into interno.margen (producto_id, margen_pct)
select id, round((10 + random() * 40)::numeric, 2) from catalogo.producto;

drop table gen;

-- Diccionario: se calcula desde los datos y fija la versión de cada vertical (RF-08).
select * from catalogo.refrescar_diccionario();

analyze catalogo.producto;
