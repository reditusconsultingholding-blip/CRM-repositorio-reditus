// Modo privado de las cifras de la empresa (rentabilidad, nómina, gastos).
// El CEO comparte pantalla y graba: con el modo puesto, las cifras se ven
// como caracteres cambiando y el número real ni siquiera se pinta.
//
// · La elección vive en localStorage de ese navegador. Sin elección
//   guardada arranca OCULTO, que es lo seguro para quien comparte pantalla.
// · Se copia a una cookie para que el servidor (Panel CEO) sepa si debe
//   mandar las cifras o no: en modo oculto no viajan al navegador.
// Este archivo no lleva "use client" para que el servidor pueda leer el
// nombre de la cookie; las funciones solo se llaman desde componentes de cliente.

export const CLAVE_CIFRAS = "rd-cifras";
export const CIFRAS_VISIBLES = "visibles";
const CIFRAS_OCULTAS = "ocultas";
const EVENTO = "rd-cifras";

/** true = ocultas. Ante cualquier duda (sin dato, sin acceso), ocultas. */
export function leerCifrasOcultas(): boolean {
  try {
    return localStorage.getItem(CLAVE_CIFRAS) !== CIFRAS_VISIBLES;
  } catch {
    return true;
  }
}

function cookieActual(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${CLAVE_CIFRAS}=([^;]*)`));
  return m ? m[1] : null;
}

function escribirCookie(ocultas: boolean) {
  const valor = ocultas ? CIFRAS_OCULTAS : CIFRAS_VISIBLES;
  document.cookie = `${CLAVE_CIFRAS}=${valor}; path=/; max-age=31536000; samesite=lax`;
}

/** Deja la cookie igual a la elección guardada. Devuelve true si tuvo que cambiarla. */
export function sincronizarCookieCifras(): boolean {
  const ocultas = leerCifrasOcultas();
  const esperado = ocultas ? CIFRAS_OCULTAS : CIFRAS_VISIBLES;
  if (cookieActual() === esperado) return false;
  escribirCookie(ocultas);
  return true;
}

export function ponerCifrasOcultas(ocultas: boolean) {
  try {
    localStorage.setItem(CLAVE_CIFRAS, ocultas ? CIFRAS_OCULTAS : CIFRAS_VISIBLES);
  } catch {
    // Sin localStorage la elección dura lo que dure la cookie.
  }
  escribirCookie(ocultas);
  window.dispatchEvent(new Event(EVENTO));
}

export function suscribirCifras(f: () => void) {
  window.addEventListener(EVENTO, f);
  window.addEventListener("storage", f); // otra pestaña del mismo navegador
  return () => {
    window.removeEventListener(EVENTO, f);
    window.removeEventListener("storage", f);
  };
}
