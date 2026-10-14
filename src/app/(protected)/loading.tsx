import { CargandoSeccion } from "@/components/cargador-seccion";

// Mientras el servidor arma cualquier sección del CRM que no tenga su propio
// esqueleto: el aro con el logo, en el área de contenido (el menú sigue a la vista).
export default function Loading() {
  return <CargandoSeccion />;
}
