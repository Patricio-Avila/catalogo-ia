-- 0009: tope de tiempo por consulta del agente a 5 s (G4, RNF-04; 2026-11-22).
--
-- Problema: en la base de la nube (Supabase Free, instancia nano) cada una de las
-- tres consultas de POST /buscar tarda de 1.2 a 2.2 s sobre una vertical completa,
-- unas cinco veces lo medido en CI (docs/mediciones/t8_resultados.md §3.3). Con el
-- statement_timeout de 2 s de 0002, calcular_facetas con incluir_sin_dato (2.1 a
-- 2.2 s medidos) se cancelaba y la búsqueda respondía con error.
--
-- Regla nueva: 5 s por consulta. G4 se conserva: una consulta costosa se sigue
-- cancelando al vencer el tope. La meta de RNF-05 (menos de 1 s en el percentil
-- 95) no cambia y se sigue midiendo en CI; la prueba 07 conserva su comprobación
-- de 2 s. Como en 0002, se fija en los dos roles porque la configuración de rol
-- aplica a la sesión del usuario que inicia sesión (agente_api), no a SET ROLE.
-- Las sesiones abiertas conservan el tope anterior hasta reconectarse.

alter role agente_lectura set statement_timeout = '5s';
alter role agente_api set statement_timeout = '5s';
