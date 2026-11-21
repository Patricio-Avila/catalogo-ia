-- Consultas SQL de referencia para el banco de evaluación (CLAUDE.md §9, T6).
-- Cada consulta invoca buscar_productos y contar_productos con el objeto de
-- filtros esperado sobre el catálogo en PostgreSQL.

-- F01: paracetamol en tabletas
select * from catalogo.buscar_productos(
  'farmacia', 'medicamentos',
  '[{"atributo":"sustancia_activa","operador":"=","valor":"paracetamol"},{"atributo":"forma_farmaceutica","operador":"=","valor":"tableta"}]'::jsonb,
  false, 20
);

-- F03: jarabe sin azucar (ejercita atributo con baja cobertura y conteo de faltantes)
select * from catalogo.contar_productos(
  'farmacia', null,
  '[{"atributo":"forma_farmaceutica","operador":"=","valor":"jarabe"},{"atributo":"sin_azucar","operador":"=","valor":true}]'::jsonb,
  false
);

-- L01: llanta 205/55 R16 para carretera
select * from catalogo.buscar_productos(
  'llantas', 'pasajeros',
  '[{"atributo":"ancho_mm","operador":"=","valor":205},{"atributo":"perfil_pct","operador":"=","valor":55},{"atributo":"rin_pulg","operador":"=","valor":16},{"atributo":"uso_previsto","operador":"=","valor":"carretera"}]'::jsonb,
  false, 20
);

-- L02: de invierno con run flat (ejercita faltantes en run_flat)
select * from catalogo.contar_productos(
  'llantas', null,
  '[{"atributo":"temporada","operador":"=","valor":"invierno"},{"atributo":"run_flat","operador":"=","valor":true}]'::jsonb,
  false
);

-- B01: crema sin perfume para piel sensible de menos de 300 pesos
select * from catalogo.buscar_productos(
  'belleza', 'cuidado_facial',
  '[{"atributo":"precio","operador":"<","valor":300},{"atributo":"fragancia","operador":"=","valor":"sin perfume"},{"atributo":"tipo_piel","operador":"=","valor":"sensible"}]'::jsonb,
  false, 20
);

-- B03: protector solar vegano (ejercita faltantes en vegano)
select * from catalogo.contar_productos(
  'belleza', 'cuidado_facial',
  '[{"atributo":"uso_previsto","operador":"=","valor":"proteger"},{"atributo":"vegano","operador":"=","valor":true}]'::jsonb,
  false
);
