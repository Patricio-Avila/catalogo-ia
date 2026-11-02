// Núcleo agnóstico del proyecto (ADR-0002).
// Sin dependencias de Deno ni de supabase-js: TypeScript puro.

export { VERSION_NUCLEO, salud } from "./salud";

// API Hono (§6.2) y tope de gasto
export { crearApp, CONFIG_OPENAPI, claveCliente } from "./api/app";
export type { DependenciasApi, AppApi } from "./api/app";
export { LimiteMemoria, SIN_LIMITE, LIMITE_POR_OMISION as LIMITE_GASTO_POR_OMISION } from "./api/limite_gasto";
export type { LimiteGasto, OpcionesLimite } from "./api/limite_gasto";
export {
  PeticionBuscar,
  RespuestaBuscar,
  PeticionFacetas,
  RespuestaFacetas,
  RespuestaDiccionario,
  RespuestaSalud,
  RespuestaError,
  EtiquetaApi,
  DescartadoApi,
  AclaracionApi,
  LIMITE_MAXIMO_API,
} from "./contrato/api";

// Contrato (§6.1 y §6.2)
export {
  DOMINIOS,
  Dominio,
  OPERADORES,
  Operador,
  OPERADORES_POR_TIPO,
  TIPOS_ATRIBUTO,
  TipoAtributo,
  NombreAtributo,
  ValorFiltro,
  Filtro,
  ObjetoFiltros,
  FiltroPropuesto,
  SalidaModelo,
  OBJETO_VACIO,
} from "./contrato/filtros";
export { Diccionario, EntradaDiccionario, entradasDe } from "./contrato/diccionario";
export { Resultado, ResultadoBusqueda, Faceta, ValorFaceta } from "./contrato/respuestas";

// G1
export { validarObjetoFiltros, MOTIVOS_DESCARTE } from "./g1/validar";
export type {
  Origen,
  MotivoDescarte,
  Descartado,
  FiltroCrudo,
  EntradaValidacion,
  FiltroValidado,
  ResultadoValidacion,
} from "./g1/validar";

// Extractor numérico
export { extraerNumeros } from "./extractor/numerico";

// Modelo
export type { AdaptadorModelo, PeticionModelo, RespuestaModelo, AclaracionPropuesta } from "./modelo/interfaz";
export { AdaptadorFixtures } from "./modelo/fixtures";
export type { FixturesModelo } from "./modelo/fixtures";

// Interpretación y acciones
export { interpretarPeticion, nivelDe, UMBRALES } from "./interpretar";
export type { Interpretacion, Etiqueta, Aclaracion, Nivel, OrigenEtiqueta, ParametrosInterpretar } from "./interpretar";
export { Accion, aplicarAccion, reemplazar } from "./acciones";
export type { ResultadoAccion } from "./acciones";

// Caché exacta
export { claveCache, materialClave, CacheMemoria } from "./cache/clave";
export type { CacheInterpretaciones, EntradaCache, DatosClave } from "./cache/clave";

// Acceso a datos
export { AccesoPostgres, LIMITE_MAXIMO, LIMITE_POR_OMISION } from "./datos/acceso";
export type { AccesoDatos, OpcionesPostgres } from "./datos/acceso";
export { AccesoNulo } from "./datos/acceso_nulo";

// Vocabulario prohibido y utilidades de texto
export { VOCABULARIO_PROHIBIDO, vocabularioProhibidoEn } from "./vocabulario";
export { quitarAcentos, normalizarValor, normalizarPeticion, aNumero, aBooleano } from "./texto";

// Datos de prueba (diccionarios y fixtures del modelo)
export { DICCIONARIOS, DICCIONARIO_FARMACIA, DICCIONARIO_LLANTAS, DICCIONARIO_BELLEZA } from "./datos_prueba/diccionarios";
export { FIXTURES_MODELO } from "./datos_prueba/fixtures_modelo";
