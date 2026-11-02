# Modelo de datos — prototipo del cuarto avance

DDL transcrito de las capturas de `S8_CPAI_BDE` (2026-10-31), PostgreSQL 16. Es el punto de partida de las migraciones, no su versión final: los cambios obligatorios están en `CLAUDE.md` §7.2 y el catálogo definitivo de tres verticales en §7.4. Ejecutar y confirmar antes de convertirlo en migración; la captura de `producto` no muestra la columna `id`, que la función sí devuelve.

```sql
CREATE SCHEMA catalogo;

CREATE TABLE catalogo.producto (
  id        SERIAL PRIMARY KEY,                 -- verificar contra la captura
  nombre    TEXT NOT NULL,
  categoria TEXT NOT NULL,
  marca     TEXT NOT NULL,
  precio    NUMERIC(10,2) NOT NULL CHECK (precio > 0),
  atributos JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_producto_atributos ON catalogo.producto USING GIN (atributos jsonb_path_ops);
CREATE INDEX idx_producto_categoria ON catalogo.producto (categoria);

-- Generador: 20,000 productos por categoría; cobertura fijada por atributo
WITH cat(categoria, tipos) AS (VALUES
  ('belleza',          ARRAY['Crema facial','Sérum','Protector solar','Gel limpiador','Tónico']),
  ('farmacia',         ARRAY['Analgésico','Antiácido','Antigripal','Vitamina C','Electrolitos']),
  ('cuidado personal', ARRAY['Shampoo','Acondicionador','Desodorante','Jabón líquido','Crema corporal']),
  ('bebés',            ARRAY['Pañales','Toallitas','Crema antirozaduras','Shampoo infantil','Fórmula']),
  ('nutrición',        ARRAY['Proteína','Barra de cereal','Fibra','Omega 3','Bebida vegetal']))
INSERT INTO catalogo.producto (nombre, categoria, marca, precio, atributos)
SELECT tipos[1 + g % 5] || ' ' || g, categoria, 'Marca ' || chr(65 + g % 8),
  round((50 + random() * 950)::numeric, 2),
  jsonb_strip_nulls(jsonb_build_object(
    'contenido',       CASE WHEN random() < 0.95 THEN (ARRAY[30,50,100,200,400])[1 + floor(random() * 5)::int] END,
    'fragancia',       CASE WHEN random() < 0.80 THEN (ARRAY['sin perfume','floral','cítrica','neutra'])[1 + floor(random() * 4)::int] END,
    'tipo_piel',       CASE WHEN categoria IN ('belleza','cuidado personal','bebés') AND random() < 0.60
                            THEN (ARRAY['sensible','seca','grasa','mixta','normal'])[1 + floor(random() * 5)::int] END,
    'vegano',          CASE WHEN random() < 0.40 THEN random() < 0.5 END,
    'requiere_receta', CASE WHEN categoria = 'farmacia' THEN random() < 0.2 END))
FROM cat, generate_series(1, 20000) AS g;
-- Medido: carga 1.1 s; tabla con índices 21 MB.

CREATE MATERIALIZED VIEW catalogo.diccionario_atributos AS
SELECT p.categoria, a.key AS atributo, jsonb_typeof(a.value) AS tipo,
  round(100.0 * count(*) / t.total, 1) AS cobertura_pct,
  CASE WHEN jsonb_typeof(a.value) = 'number'
       THEN min(a.value::numeric) || ' a ' || max(a.value::numeric)
       ELSE string_agg(DISTINCT a.value #>> '{}', ', ') END AS dominio
FROM catalogo.producto p
CROSS JOIN LATERAL jsonb_each(p.atributos) AS a
JOIN (SELECT categoria, count(*) AS total FROM catalogo.producto GROUP BY categoria) t USING (categoria)
GROUP BY p.categoria, a.key, jsonb_typeof(a.value), t.total;

CREATE FUNCTION catalogo.buscar_productos(p_categoria TEXT, p_filtros JSONB,
  p_incluir_sin_dato BOOLEAN DEFAULT false, p_limite INT DEFAULT 5)
RETURNS TABLE (id INT, nombre TEXT, precio NUMERIC, cumple TEXT[], sin_dato TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = catalogo AS $$
  WITH ev AS (
    SELECT p.id, p.nombre, p.precio, f->>'a' AS atr,
      CASE
        WHEN f->>'a' = 'precio' THEN
          CASE WHEN (f->>'op' = '<' AND p.precio < (f->>'v')::numeric)
                 OR (f->>'op' = '>' AND p.precio > (f->>'v')::numeric) THEN 'cumple' ELSE 'no' END
        WHEN NOT p.atributos ? (f->>'a') THEN 'sin_dato'
        WHEN f->>'op' = '=' AND p.atributos->>(f->>'a') = f->>'v' THEN 'cumple'
        WHEN f->>'op' = '<' AND (p.atributos->>(f->>'a'))::numeric < (f->>'v')::numeric THEN 'cumple'
        WHEN f->>'op' = '>' AND (p.atributos->>(f->>'a'))::numeric > (f->>'v')::numeric THEN 'cumple'
        ELSE 'no' END AS estado
    FROM producto p, jsonb_array_elements(p_filtros) AS f
    WHERE p.categoria = p_categoria)
  SELECT id, nombre, precio,
    array_agg(atr) FILTER (WHERE estado = 'cumple'),
    array_agg(atr) FILTER (WHERE estado = 'sin_dato')
  FROM ev GROUP BY id, nombre, precio
  HAVING bool_and(estado <> 'no') AND (p_incluir_sin_dato OR bool_and(estado <> 'sin_dato'))
  ORDER BY count(*) FILTER (WHERE estado = 'sin_dato'), precio
  LIMIT p_limite
$$;
-- Medido: 3 filtros, 183 ms; con incluir_sin_dato, 287 ms (ambos dentro de RNF-05).
-- El texto del avance dice que las igualdades se convierten en una condición de contención (@>)
-- para usar el índice GIN; la captura no la muestra. Reconstruir y medir.

CREATE FUNCTION catalogo.calcular_facetas(p_categoria TEXT, p_atributo TEXT)
RETURNS TABLE (valor TEXT, productos BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = catalogo AS $$
  SELECT coalesce(atributos->>p_atributo, '(sin dato)'), count(*)
  FROM producto WHERE categoria = p_categoria GROUP BY 1 ORDER BY 2 DESC
$$;

CREATE ROLE agente_lectura NOLOGIN;
ALTER ROLE agente_lectura SET statement_timeout = '2s';
GRANT USAGE ON SCHEMA catalogo TO agente_lectura;
GRANT SELECT ON catalogo.diccionario_atributos TO agente_lectura;
GRANT EXECUTE ON FUNCTION catalogo.buscar_productos, catalogo.calcular_facetas TO agente_lectura;
-- Probado: con SET ROLE agente_lectura, la búsqueda funciona vía función;
-- SELECT directo sobre producto y UPDATE devuelven "permission denied" (G3).
```
