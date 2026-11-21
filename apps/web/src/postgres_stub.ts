// Stub vacio para el navegador: el cliente web nunca abre conexiones directas a
// PostgreSQL (G3); usa HTTP contra la API o el motor en memoria local.
export default function postgresStub() {
  throw new Error("AccesoPostgres solo está disponible en el servidor");
}
