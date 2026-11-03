-- 0003: capa de metadatos (atributo_meta), trigger de obligatorios (RF-11) y
-- configuración de las tres verticales (ADR-0004, ADR-0005; §7.2 puntos 15 y 16; §7.4).
--
-- El contexto se modela, no se lee. Cada categoría declara atributos de contexto
-- obligatorios (uso previsto, clase de riesgo) y la base los exige por trigger:
-- la cobertura de esos atributos es 100 % por integridad, no por azar. Un atributo
-- con define_riesgo nunca es inferible: el modelo no puede proponerlo (G1).

create table catalogo.atributo_meta (
  dominio       text not null,
  categoria     text not null,
  atributo      text not null check (atributo ~ '^[a-z][a-z0-9_]*$'),
  tipo          text not null check (tipo in ('texto', 'numero', 'booleano')),
  obligatorio   boolean not null default false,
  define_uso    boolean not null default false,
  define_riesgo boolean not null default false,
  peso          numeric(4, 2) not null default 1 check (peso >= 0),
  inferible     boolean not null default true,
  etiqueta      text,
  primary key (dominio, categoria, atributo),
  foreign key (dominio, categoria) references catalogo.categoria on delete cascade,
  check (not (define_riesgo and inferible))
);
comment on table catalogo.atributo_meta is 'Metadatos curados por atributo y categoría: tipo, obligatoriedad, define_uso, define_riesgo, peso e inferible. Es la capa que la descripción no garantiza (Dinu y Nadkarni, 2007).';
comment on column catalogo.atributo_meta.peso is 'Peso en el nivel de compatibilidad de comparar_productos(). Inicial; se calibra con el banco de evaluación.';
comment on column catalogo.atributo_meta.inferible is 'false: el modelo nunca lo propone (RF-11). Siempre false si define_riesgo.';

grant select on catalogo.atributo_meta to catalogo_duenio, agente_lectura;

-- Trigger: rechaza el producto si falta un atributo obligatorio de su categoría o
-- si un atributo declarado en atributo_meta trae un tipo distinto al declarado.
create function catalogo.verificar_producto() returns trigger
language plpgsql
set search_path = catalogo, pg_temp
as $$
declare
  v_faltan     text[];
  v_mal_tipo   text[];
begin
  select
    array_agg(m.atributo order by m.atributo) filter (where m.obligatorio and not (new.atributos ? m.atributo)),
    array_agg(m.atributo order by m.atributo) filter (
      where new.atributos ? m.atributo
        and jsonb_typeof(new.atributos -> m.atributo) <> case m.tipo when 'numero' then 'number' when 'booleano' then 'boolean' else 'string' end)
  into v_faltan, v_mal_tipo
  from atributo_meta m
  where m.dominio = new.dominio and m.categoria = new.categoria;

  if v_faltan is not null then
    raise exception 'producto sin atributos obligatorios para %/%: %', new.dominio, new.categoria, array_to_string(v_faltan, ', ')
      using errcode = 'check_violation';
  end if;
  if v_mal_tipo is not null then
    raise exception 'atributos con tipo distinto al declarado en %/%: %', new.dominio, new.categoria, array_to_string(v_mal_tipo, ', ')
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger producto_verificar
  before insert or update of dominio, categoria, atributos on catalogo.producto
  for each row execute function catalogo.verificar_producto();

-- Configuración de las tres verticales (§7.4). Es dato, no código: agregar una
-- vertical es insertar aquí y cargar productos.

insert into catalogo.vertical (dominio, nombre, texto_ayuda, aviso, atributos_destacados, orden) values
  ('farmacia', 'Farmacia',
   'Busca por sustancia, concentración, forma farmacéutica, presentación o precio.',
   'Este catálogo solo permite buscar productos. No recomienda, no sustituye ni indica usos ni dosis. Consulta a un profesional de la salud.',
   array['sustancia_activa', 'concentracion_mg', 'forma_farmaceutica', 'piezas'], 1),
  ('llantas', 'Llantas',
   'Busca por medida (por ejemplo 205/55 R16), índices de carga y velocidad, temporada o precio.',
   null,
   array['ancho_mm', 'perfil_pct', 'rin_pulg', 'indice_carga', 'indice_velocidad'], 2),
  ('belleza', 'Belleza y cuidado de la piel',
   'Busca por tipo de piel, fragancia, contenido, SPF o precio.',
   null,
   array['tipo_piel', 'fragancia', 'contenido_ml', 'spf'], 3);

insert into catalogo.categoria (dominio, categoria, nombre, orden) values
  ('farmacia', 'medicamentos',     'Medicamentos',      1),
  ('farmacia', 'suplementos',      'Suplementos',       2),
  ('llantas',  'pasajeros',        'Pasajeros',         1),
  ('llantas',  'carga_ligera',     'Carga ligera',      2),
  ('belleza',  'cuidado_facial',   'Cuidado facial',    1),
  ('belleza',  'cuidado_corporal', 'Cuidado corporal',  2);

-- Pesos iniciales: contexto (uso y riesgo) 2; atributos que identifican el producto 3; resto 1.
insert into catalogo.atributo_meta (dominio, categoria, atributo, tipo, obligatorio, define_uso, define_riesgo, peso, inferible, etiqueta)
select v.dominio, c.categoria, a.atributo, a.tipo, a.obligatorio, a.define_uso, a.define_riesgo, a.peso, a.inferible, a.etiqueta
from (values
  -- farmacia: contexto
  ('farmacia', null,            'uso_previsto',       'texto',    true,  true,  false, 2, true,  'uso previsto'),
  ('farmacia', null,            'requiere_receta',    'booleano', true,  false, true,  2, false, 'requiere receta'),
  ('farmacia', null,            'clase_riesgo',       'texto',    true,  false, true,  2, false, 'clase de riesgo'),
  ('farmacia', null,            'apto_consumo',       'booleano', true,  false, true,  2, false, 'apto para consumo'),
  -- farmacia: técnicos
  ('farmacia', null,            'sustancia_activa',   'texto',    false, false, false, 3, true,  'sustancia activa'),
  ('farmacia', null,            'concentracion_mg',   'numero',   false, false, false, 2, true,  'concentración (mg)'),
  ('farmacia', null,            'forma_farmaceutica', 'texto',    false, false, false, 1, true,  'forma farmacéutica'),
  ('farmacia', null,            'via_administracion', 'texto',    false, true,  false, 2, true,  'vía de administración'),
  ('farmacia', null,            'piezas',             'numero',   false, false, false, 1, true,  'piezas'),
  ('farmacia', null,            'sin_azucar',         'booleano', false, false, false, 1, true,  'sin azúcar'),
  -- llantas: contexto
  ('llantas',  null,            'uso_previsto',       'texto',    true,  true,  false, 2, true,  'uso previsto'),
  ('llantas',  null,            'indice_carga',       'numero',   true,  true,  false, 2, true,  'índice de carga'),
  ('llantas',  null,            'indice_velocidad',   'texto',    true,  true,  false, 2, true,  'índice de velocidad'),
  ('llantas',  null,            'clase_riesgo',       'texto',    true,  false, true,  2, false, 'clase de riesgo'),
  -- llantas: técnicos
  ('llantas',  null,            'ancho_mm',           'numero',   false, false, false, 3, true,  'ancho (mm)'),
  ('llantas',  null,            'perfil_pct',         'numero',   false, false, false, 3, true,  'perfil (%)'),
  ('llantas',  null,            'rin_pulg',           'numero',   false, false, false, 3, true,  'rin (pulgadas)'),
  ('llantas',  null,            'temporada',          'texto',    false, false, false, 1, true,  'temporada'),
  ('llantas',  null,            'run_flat',           'booleano', false, false, false, 1, true,  'run flat'),
  ('llantas',  null,            'garantia_km',        'numero',   false, false, false, 1, true,  'garantía (km)'),
  ('llantas',  null,            'anio_fabricacion',   'numero',   false, false, false, 1, true,  'año de fabricación'),
  -- belleza: contexto
  ('belleza',  null,            'uso_previsto',       'texto',    true,  true,  false, 2, true,  'uso previsto'),
  ('belleza',  null,            'zona_aplicacion',    'texto',    true,  true,  false, 2, true,  'zona de aplicación'),
  ('belleza',  null,            'clase_riesgo',       'texto',    true,  false, true,  2, false, 'clase de riesgo'),
  ('belleza',  null,            'apto_consumo',       'booleano', true,  false, true,  2, false, 'apto para consumo'),
  -- belleza: técnicos (spf solo en cuidado facial)
  ('belleza',  null,            'contenido_ml',       'numero',   false, false, false, 1, true,  'contenido (ml)'),
  ('belleza',  null,            'fragancia',          'texto',    false, false, false, 1, true,  'fragancia'),
  ('belleza',  null,            'tipo_piel',          'texto',    false, false, false, 2, true,  'tipo de piel'),
  ('belleza',  null,            'acabado',            'texto',    false, false, false, 1, true,  'acabado'),
  ('belleza',  'cuidado_facial','spf',                'numero',   false, false, false, 2, true,  'SPF'),
  ('belleza',  null,            'vegano',             'booleano', false, false, false, 1, true,  'vegano'),
  ('belleza',  null,            'sin_parabenos',      'booleano', false, false, false, 1, true,  'sin parabenos')
) as a(dominio, categoria, atributo, tipo, obligatorio, define_uso, define_riesgo, peso, inferible, etiqueta)
join catalogo.vertical v on v.dominio = a.dominio
join catalogo.categoria c on c.dominio = v.dominio and (a.categoria is null or c.categoria = a.categoria);
