import "./estilos.css";
import { iniciarAplicacion } from "./vista";

const contenedor = document.getElementById("app");
if (contenedor) {
  void iniciarAplicacion(contenedor);
}
