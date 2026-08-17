/** Limpia una respuesta en Markdown para que suene natural al leerla en
 * voz alta — quita tablas, bloques de código/mermaid, símbolos de
 * formato, etc. Se usa tanto para la voz del navegador como (a futuro)
 * para ElevenLabs. */
export function markdownToSpeechText(md: string): string {
  return md
    .replace(/```mermaid[\s\S]*?```/g, "Te muestro un diagrama en pantalla.")
    .replace(/```[\s\S]*?```/g, "Te muestro un bloque de código en pantalla.")
    .replace(/\|.*\|/g, "") // filas de tabla
    .replace(/^-{3,}$/gm, "")
    .replace(/[#*_`>~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [texto](link) -> texto
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}
