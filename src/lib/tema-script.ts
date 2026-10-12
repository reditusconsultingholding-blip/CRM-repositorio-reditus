// Código que corre antes de pintar el CRM, para que no haya destello de tema.
// Vive aparte de components/tema.tsx porque ese archivo es de cliente y el
// layout (servidor) necesita la cadena tal cual.
export const CLAVE_TEMA = "rd-tema";

export const TEMA_SCRIPT = `(function(){try{var t=localStorage.getItem("${CLAVE_TEMA}");var d=t?t==="oscuro":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
