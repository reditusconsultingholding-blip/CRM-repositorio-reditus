import "server-only";
import { ES_COLA_DE_PRUEBA } from "@/lib/cola-raiz";

// DOBLE DE PRUEBA de la IA. Solo responde si se cumplen las dos cosas:
// la cola es la de prueba (COLA_VIDEOS_CARPETA distinto de «videos») y se
// pidió a propósito (IA_DOBLE=1). En producción esta función devuelve null
// siempre y la llamada sigue hacia la IA real. Sirve para recorrer en local
// los caminos que dependen de una respuesta de la IA sin pagar ni tener clave.

type Bloque = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };

const linea = (texto: string, etiqueta: string) => new RegExp(`^${etiqueta}:\\s*(.+)$`, "m").exec(texto)?.[1]?.trim() ?? "";

export function dobleDeIA(system: string, user: string | Bloque[]): { texto: string } | { error: string } | null {
  if (!ES_COLA_DE_PRUEBA || process.env.IA_DOBLE !== "1") return null;
  const texto = typeof user === "string" ? user : user.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("\n");
  const imagenes = typeof user === "string" ? 0 : user.filter((b) => b.type === "image").length;

  // Elegir las fotos del producto entre las de la página.
  if (system.includes("eliges las fotos")) {
    return { texto: JSON.stringify({ elegidas: [1, 2].filter((n) => n <= imagenes), producto: "producto de prueba", motivo: "doble de prueba" }) };
  }
  // Ficha del producto mirando las fotos.
  if (system.includes("ficha visual de un producto")) {
    return { texto: JSON.stringify({ tamano: "mediano", cabeEnMano: "si", presentacion: "se-sostiene", comoSeUsa: "Se abre por arriba (doble de prueba).", etiqueta: "Etiqueta de prueba, sin texto legible.", noSeSabe: "Medidas, contenido e ingredientes." }) };
  }
  // Control de calidad del video armado, mirando sus fotogramas.
  if (system.includes("control de calidad de anuncios de video")) {
    return { texto: JSON.stringify({ gancho: { nota: "ok", detalle: "Abre con una persona en acción (doble de prueba)." }, producto: { nota: "ok", detalle: "El producto se ve." }, cierre: { nota: "duda", detalle: "El rótulo se lee pequeño (doble de prueba)." }, subtitulos: { nota: "ok", detalle: "Hay subtítulos." } }) };
  }
  // Clasificar los fotogramas de un video de referencia.
  if (system.includes("fotogramas de un anuncio")) {
    const tipos = ["persona-habla", "persona-accion", "apoyo", "persona-accion", "producto", "producto"];
    const funciones = ["gancho", "dolor", "intento-fallido", "demostracion", "prueba", "cierre"];
    return {
      texto: JSON.stringify({
        tomas: Array.from({ length: imagenes }, (_, i) => ({
          tipo: i === imagenes - 1 ? "producto" : tipos[i % tipos.length],
          encuadre: i % 2 ? "plano-medio" : "primer-plano",
          textoEnPantalla: i === imagenes - 1,
          funcion: i === imagenes - 1 ? "cierre" : funciones[Math.min(i, funciones.length - 2)],
          quePasa: `toma ${i + 1} descrita por el doble de prueba`,
        })),
      }),
    };
  }
  // Investigación del producto.
  if (system.includes("FORMATOS RECOMENDADOS")) {
    return {
      texto: [
        "FUENTES: doble de prueba.",
        "PANORAMA DE LOS ANUNCIOS: sin anuncios consultados (doble de prueba).",
        "A QUIÉN SE LE VENDE: a quien toma café fuera de casa.",
        "DOLORES EN PALABRAS DEL CLIENTE: «se me enfría el café antes de llegar» (funcional); «termino botándolo» (emocional).",
        "DESEO: tomarlo caliente toda la mañana.",
        "GANCHOS A PROBAR:",
        "- ¿Tu café llega frío a la oficina?",
        "- Mira lo que pasa a las diez de la mañana.",
        "- Esto mantiene tu bebida caliente toda la mañana.",
        "QUÉ FALTA CONFIRMAR CON EL CLIENTE: plazos de entrega.",
        "FORMATOS RECOMENDADOS:",
        "ugc · no hay anuncios consultados; encaja porque el producto se entiende viéndolo usar.",
        "usos-del-producto · el producto es el protagonista.",
      ].join("\n"),
    };
  }
  // Solo el cierre.
  if (system.includes("Reescribe SOLO el bloque del paso 5")) {
    const oferta = linea(texto, "Oferta");
    const llamado = linea(texto, "Llamado a la acción");
    return { texto: `PASO 5 · CTA: "${oferta}. ${llamado}."\n   OFERTA EN VOZ Y EN PANTALLA: ${oferta}\n   LLAMADO A LA ACCIÓN: ${llamado}\n   CIERRE: producto real en pantalla con la oferta en texto grande, mínimo 5 s` };
  }
  // El guion.
  if (system.includes("Eres el guionista de Reditus Consulting, agencia")) {
    const oferta = linea(texto, "Oferta");
    const llamado = linea(texto, "Llamado a la acción");
    const producto = linea(texto, "Producto");
    return {
      texto: [
        `PASO 1 · IMPACTO (0–4 s): "¿Tu café llega frío a la oficina?"`,
        `PASO 2 · BAJADA (4–10 s): "Lo sirves caliente y a la hora ya está tibio."`,
        `PASO 3 · REFUERZO (10–16 s): "Los vasos comunes no aguantan ni el trayecto."`,
        `PASO 4 · SUBIDA (16–24 s): "Con ${producto.slice(0, 40)} sigue caliente toda la mañana."`,
        `   PRODUCTO EN PANTALLA: en mano, etiqueta de frente`,
        `PASO 5 · CTA (24–30 s): "${oferta}. ${llamado}."`,
        `   OFERTA EN VOZ Y EN PANTALLA: ${oferta}`,
        `   LLAMADO A LA ACCIÓN: ${llamado}`,
        `   CIERRE: producto real en pantalla con la oferta en texto grande, mínimo 5 s`,
        "",
        "3 HOOKS ALTERNATIVOS: (doble de prueba)",
      ].join("\n"),
    };
  }
  // El plan de escenas.
  if (system.includes("PLAN DE ESCENAS")) {
    const voz = (n: number) => new RegExp(`^PASO ${n}[^\\n]*?"([^"]+)"`, "m").exec(texto)?.[1] ?? "";
    return {
      texto: JSON.stringify({
        voz: "mujer de unos treinta años, voz cálida y cercana, ritmo tranquilo (doble de prueba)",
        escenas: [
          { paso: 1, titulo: "Gancho", tipo: "generada", duracion: 5, voz: voz(1), locucion: "camara", promptImagen: "Persona nueva en una oficina mirando su vaso, vertical 9:16, luz de día, sin texto.", promptVideo: "Levanta el vaso y habla a cámara.", movimiento: "acercar" },
          { paso: 2, titulo: "El problema", tipo: "generada", duracion: 6, voz: voz(2), locucion: "camara", promptImagen: "La misma persona sirve café en la cocina, vertical 9:16, sin texto.", promptVideo: "Sirve y prueba el café.", movimiento: "acercar" },
          { paso: 3, titulo: "Lo de siempre", tipo: "foto-real", duracion: 4, voz: voz(3), foto: 2, movimiento: "paneo-der" },
          { paso: 4, titulo: "El producto", tipo: "foto-real", duracion: 5, voz: voz(4), foto: 1, movimiento: "acercar" },
          { paso: 5, titulo: "Cierre", tipo: "cierre", duracion: 6, voz: voz(5), foto: 1, movimiento: "quieto" },
        ],
      }),
    };
  }
  // Cualquier otra llamada: como si la IA no estuviera.
  return { error: "Doble de prueba: esta llamada no tiene respuesta preparada." };
}
