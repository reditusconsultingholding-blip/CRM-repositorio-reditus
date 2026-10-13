import "server-only";
import { redirect } from "next/navigation";
import { requireProfile, type Profile } from "@/lib/auth";
import {
  EXAMEN,
  MODULOS,
  PAUSA,
  notaMinima,
  type Dificultad,
  type Evaluacion,
  type Mensaje,
  type Modulo,
  type PerfilId,
  type Progreso,
  type SesionResumen,
  type TipoSesion,
} from "@/lib/negociacion";
import { createClient } from "@/lib/supabase/server";

// Maestría en negociación: prompts y llamadas a la IA. Dos modelos:
//  · el del juego de rol responde en vivo, así que va el más rápido;
//  · el que califica decide si hay diploma, así que va el más capaz.
export const MODELO_ROL = "claude-haiku-5-5";
export const MODELO_EVALUADOR = "claude-opus-5-5";

const API = "https://api.anthropic.com/v1/messages";

/** La sección es privada del CEO: cualquier otro rol vuelve al dashboard. */
export async function requireMaestria(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "ceo") redirect("/dashboard");
  return profile;
}

/** Progreso y sesiones ya calificadas. Devuelve null si las tablas no existen
 * (falta correr la migración 0064): la página avisa en vez de romperse. */
export async function cargarMaestria(userId: string): Promise<{ progreso: Progreso[]; sesiones: SesionResumen[] } | null> {
  const supabase = await createClient();
  const [p, s] = await Promise.all([
    supabase.from("negociacion_progreso").select("modulo, mejor_nota, intentos, aprobado_en").eq("user_id", userId),
    supabase
      .from("negociacion_sesiones")
      .select("id, tipo, modulo, escenario, dificultad, nota, evaluacion, created_at")
      .eq("user_id", userId)
      .not("nota", "is", null)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  if (p.error || s.error) return null;
  return { progreso: (p.data ?? []) as Progreso[], sesiones: (s.data ?? []) as SesionResumen[] };
}

// Va primero en todos los prompts y nunca cambia, para que la caché de
// prompts lo reutilice entre turnos.
const METODO = `Eres parte de un programa privado de entrenamiento en negociación para el CEO de Reditus Consulting, una agencia de marketing digital de LatAm que vende landing pages y videos para tiendas online. El alumno quiere dominar el método de Chris Voss (exnegociador de secuestros del FBI, autor de «Rompe la barrera del no» y fundador de The Black Swan Group).

TÉCNICAS DEL MÉTODO (el criterio con el que se enseña y se corrige)
1. Mentalidad y voz: negociar es descubrir información; ir despacio; voz tranquila de locutor nocturno, voz positiva la mayor parte del tiempo, voz asertiva casi nunca.
2. Espejo: repetir las últimas 1 a 3 palabras en tono curioso y callar al menos 4 segundos.
3. Etiquetas y empatía táctica: «Parece que…», «Suena a que…», «Da la impresión de que…»; nunca «yo siento/entiendo que»; silencio después.
4. Auditoría de acusaciones: decir primero lo peor que el otro puede pensar, sin negarlo («Vas a pensar que…»).
5. El «no»: da seguridad; preguntas orientadas al no («¿Sería una mala idea…?», «¿Ya descartaste este proyecto?»); no forzar el sí.
6. «Así es»: resumen = paráfrasis + etiqueta, hasta que el otro diga «así es»; «tienes razón» no cuenta.
7. Doblar la realidad: aversión a la pérdida, la palabra «justo», plazos flexibles, ancla emocional, rangos, cifras no redondas, términos no monetarios; nunca partir la diferencia.
8. Preguntas calibradas: «¿Cómo…?» y «¿Qué…?» («¿Cómo se supone que haga eso?»); evitar «¿por qué?» y preguntas de sí o no.
9. Ejecución: tres tipos de sí (compromiso, confirmación, falso); regla de los tres; preguntas de «cómo»; quién decide detrás de la mesa; regla 7-38-55; pronombres.
10. Regateo: tipos de negociador (analista, complaciente, asertivo); cuatro formas de decir no sin decirlo; sistema Ackerman (65 %, 85 %, 95 %, 100 %, concesiones decrecientes, cifra final no redonda y un extra no monetario).
11. Cisnes negros: información oculta que lo cambia todo; palanca positiva, negativa y normativa; quien parece irracional está mal informado, limitado o tiene otros intereses.
12. Preparación: hoja de una página (objetivo, resumen, etiquetas y auditoría, preguntas calibradas, ofertas no monetarias).

ERRORES QUE SIEMPRE SE CORRIGEN
Discutir o justificarse; argumentar con lógica en vez de escuchar; hablar de más; decir «te entiendo, pero…»; preguntar «¿por qué?»; ceder sin pedir nada a cambio; soltar el precio de entrada; partir la diferencia; aceptar un «sí» sin «cómo»; amenazar.

REGLAS DE FORMA
- Español de Colombia, natural y hablado. El alumno muchas veces te escucha en voz alta: frases cortas, sin listas, sin tablas, sin asteriscos ni otros símbolos de formato.
- Sé breve. El alumno quiere ritmo de conversación real.`;

const PERFIL_TEXTO: Record<Exclude<PerfilId, "sorpresa">, string> = {
  analista: "Tu estilo es ANALISTA: metódico, frío, pides datos y tiempo, desconfías de la prisa y de las sorpresas.",
  complaciente: "Tu estilo es COMPLACIENTE: amable y conversador, quieres caer bien, dices «sí» con facilidad aunque luego no cumplas, evitas el conflicto.",
  asertivo: "Tu estilo es ASERTIVO: directo, impaciente, el tiempo es dinero, quieres sentir que ganas y que te escuchan.",
};

const PAUSAS: Record<Dificultad, string> = {
  facil: `PAUSAS DE ENTRENADOR (modo fácil): detén la escena cada vez que el alumno cometa un error, incluso mediano, o deje pasar una oportunidad clara de usar una técnica.`,
  media: `PAUSAS DE ENTRENADOR (modo medio): detén la escena solo ante errores graves (discute, se justifica largo, cede sin pedir nada, parte la diferencia, pregunta «¿por qué?» de forma acusadora) o si su mensaje no tiene nada que ver con la negociación.`,
  dificil: `SIN PAUSAS (modo difícil): nunca salgas del personaje para corregir. Si el alumno se equivoca, reacciona como reaccionaría una persona real: endurécete, desconfía o aprovecha el error. Solo si escribe algo que no tiene absolutamente nada que ver con la escena, responde en personaje con extrañeza.`,
};

const COMO_PAUSAR = `Cómo pausar: NO respondas en personaje. Empieza el mensaje exactamente con «${PAUSA} PAUSA.» y en máximo tres frases di qué falló, qué técnica tocaba y un ejemplo de cómo sonaría bien dicho. Termina con «Inténtalo de nuevo.» La escena no avanza: cuando el alumno lo repita, sigues en personaje desde el mismo punto como si el intento fallido no hubiera ocurrido.`;

const PERSONAJE = `CÓMO INTERPRETAR AL PERSONAJE
- Habla como una persona real en una conversación hablada: de una a tres frases por turno.
- No regales nada. Cede, revela información o baja el tono únicamente cuando el alumno usa bien una técnica: un buen espejo te hace explicar más; una etiqueta acertada te calma; una pregunta calibrada te pone a resolver su problema; un buen resumen te saca un «así es».
- Ante un error, reacciona como alguien real: te cierras, te molestas o aprietas más.
- Guarda al menos un dato oculto importante (un cisne negro) coherente con la escena y suéltalo solo si se lo ganan.
- Nunca menciones las técnicas por su nombre mientras estás en personaje ni des pistas de qué debería decir.
- Si se llega a un acuerdo real y bien amarrado, ciérralo en personaje y añade una última línea: «(Fin de la escena. Pulsa Terminar y calificar.)»`;

export function contextoClase(m: Modulo): string {
  return `MODO: CLASE del módulo ${m.n}, «${m.titulo}».
El alumno acaba de leer la explicación de este módulo. Tú eres su entrenador. Técnicas que se trabajan hoy: ${m.tecnicas.join("; ")}.

FASE 1, COMPROBAR QUE ENTENDIÓ. Tu primer mensaje es una sola pregunta corta para verificar que entendió la idea (que la explique con sus palabras o dé un ejemplo de frase). Si responde mal, incompleto o algo que no tiene nada que ver, vuelve atrás: explícalo de nuevo en dos o tres frases con un ejemplo distinto y pregunta otra vez. No pases a la práctica hasta que lo demuestre. Como máximo dos preguntas de comprobación si las responde bien.

FASE 2, PRÁCTICA. Cuando haya entendido, dilo en una frase, anuncia «Vamos a la práctica.», describe la situación en una o dos frases (quién eres tú y qué quiere lograr el alumno) y di tu primera línea en personaje. La situación: ${m.practica}

${PERSONAJE}

PAUSAS DE ENTRENADOR: esto es una clase, así que detén la escena cada vez que el alumno no use la técnica del módulo cuando tocaba, la use mal o cometa uno de los errores de siempre. Si lo hace bien, no interrumpas: sigue en personaje.
${COMO_PAUSAR}

FASE 3, CIERRE. Cuando el alumno haya usado bien la técnica del módulo al menos tres veces dentro de la escena, cierra en personaje y dile que ya puede pulsar «Terminar y calificar».`;
}

export function contextoPractica(escena: string, perfil: PerfilId, dificultad: Dificultad): string {
  const estilos = Object.keys(PERFIL_TEXTO) as Exclude<PerfilId, "sorpresa">[];
  const real = perfil === "sorpresa" ? estilos[Math.floor(Math.random() * estilos.length)] : perfil;
  return `MODO: PRÁCTICA LIBRE, juego de rol en vivo.
LA ESCENA: ${escena}
${PERFIL_TEXTO[real]}
Tu primer mensaje es tu primera línea en personaje, sin introducción ni explicación.

${PERSONAJE}

${PAUSAS[dificultad]}
${dificultad === "dificil" ? "" : COMO_PAUSAR}`;
}

export function contextoExamen(): string {
  return `MODO: EXAMEN FINAL. No hay entrenador ni pausas.
LA ESCENA: ${EXAMEN.escenario}
Tu primer mensaje es tu primera línea en personaje, sin introducción.

${PERSONAJE}

${PAUSAS.dificil}`;
}

type SesionIA = { tipo: TipoSesion; modulo: number | null; escenario: string; contexto: string; dificultad: Dificultad; mensajes: Mensaje[] };

/** La API exige que la conversación empiece con un turno del usuario: el
 * primer mensaje (el de la IA abriendo la escena) se pide con esta señal. */
const ARRANQUE: Mensaje = { role: "user", content: "(Empieza.)" };

/** Abre la respuesta en streaming del juego de rol. Devuelve la respuesta
 * cruda de Anthropic (eventos SSE); quien llama la traduce a texto. */
export function abrirTurno(apiKey: string, sesion: Pick<SesionIA, "contexto">, mensajes: Mensaje[]): Promise<Response> {
  return fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODELO_ROL,
      max_tokens: 1024,
      stream: true,
      // Sin razonamiento previo: lo que importa aquí es que conteste ya.
      thinking: { type: "disabled" },
      system: [{ type: "text", text: `${METODO}\n\n${sesion.contexto}`, cache_control: { type: "ephemeral" } }],
      messages: [ARRANQUE, ...mensajes],
    }),
  });
}

const ESQUEMA_EVALUACION = {
  type: "object",
  properties: {
    nota: { type: "integer", description: "Nota global de 0 a 100." },
    veredicto: { type: "string", description: "Dos o tres frases, directas, hablándole de tú al alumno." },
    tecnicas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          nota: { type: "integer", description: "De 0 a 100. 0 si tocaba usarla y no la usó." },
          comentario: { type: "string" },
        },
        required: ["nombre", "nota", "comentario"],
        additionalProperties: false,
      },
    },
    fallos: {
      type: "array",
      description: "Los errores más importantes, del más grave al menos grave. Máximo 5.",
      items: {
        type: "object",
        properties: {
          dijiste: { type: "string", description: "Cita textual corta de lo que dijo el alumno." },
          problema: { type: "string" },
          mejor: { type: "string", description: "Cómo debió decirlo, palabra por palabra." },
        },
        required: ["dijiste", "problema", "mejor"],
        additionalProperties: false,
      },
    },
    aciertos: { type: "array", items: { type: "string" }, description: "Lo que hizo bien, citando el momento. Máximo 4." },
    siguiente_paso: { type: "string", description: "Una sola cosa concreta para practicar en la próxima sesión." },
  },
  required: ["nota", "veredicto", "tecnicas", "fallos", "aciertos", "siguiente_paso"],
  additionalProperties: false,
} as const;

function limitar(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

/** Califica una sesión terminada. Nunca lanza: devuelve `{ error }` con un
 * texto que se le puede mostrar a la persona. */
export async function evaluarSesion(sesion: SesionIA): Promise<{ evaluacion: Evaluacion } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "La IA no está activada: falta ANTHROPIC_API_KEY en las variables de entorno." };

  const modulo = sesion.tipo === "clase" ? MODULOS.find((m) => m.n === sesion.modulo) : undefined;
  const foco = modulo
    ? `Es la clase del módulo ${modulo.n}, «${modulo.titulo}». Evalúa SOBRE TODO estas técnicas: ${modulo.tecnicas.join("; ")}. Las demás solo cuentan si las usó mal.`
    : `Es ${sesion.tipo === "examen" ? "el EXAMEN FINAL" : "una práctica libre"}: evalúa todas las técnicas que la situación pedía, y si usó la adecuada en cada momento.`;

  const transcripcion = sesion.mensajes
    .map((m) => `${m.role === "user" ? "ALUMNO" : m.content.startsWith(PAUSA) ? "ENTRENADOR" : "CONTRAPARTE"}: ${m.content}`)
    .join("\n\n");

  const system = `${METODO}

MODO: EVALUADOR. Vas a calificar la transcripción de una sesión de entrenamiento. Eres un examinador exigente y justo: de tu nota depende que el alumno reciba un diploma de maestría, y ese diploma solo vale si es difícil de conseguir.

ESCALA
- 90 a 100: nivel de negociador profesional. Usó la técnica correcta en casi todos los momentos, con buena redacción, y consiguió información o concesiones reales. Reservado para desempeños que firmaría un instructor del método.
- 80 a 89: sólido. Técnicas bien aplicadas con uno o dos fallos menores.
- 65 a 79: en progreso. Usa las técnicas pero de forma mecánica, a destiempo o mezcladas con errores.
- 40 a 64: flojo. Predominan la discusión, la justificación o las concesiones gratis.
- 0 a 39: no aplicó el método.

REGLAS
- Califica solo lo que dijo el ALUMNO. Las líneas de ENTRENADOR son pausas de corrección: cada pausa cuenta como un error que el alumno cometió, aunque después lo haya corregido.
- No premies la intención: premia lo que quedó dicho. Una técnica nombrada pero mal ejecutada no suma.
- El resultado importa: si no descubrió nada ni movió a la contraparte, la nota no puede pasar de 75.
- Si la sesión es demasiado corta para demostrar dominio, dilo y no pases de 70.
- En «fallos», cita literalmente y reescribe la frase como debió decirse. Sé concreto, sin sermones.
- Para aprobar esta sesión el alumno necesita ${notaMinima(sesion.tipo)}. No ajustes la nota para acercarlo ni alejarlo de esa cifra.`;

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO_EVALUADOR,
        max_tokens: 16000,
        output_config: { effort: "high", format: { type: "json_schema", schema: ESQUEMA_EVALUACION } },
        system,
        messages: [
          {
            role: "user",
            content: `${foco}\n\nSituación: ${sesion.escenario}\nDificultad: ${sesion.dificultad}\n\nTRANSCRIPCIÓN\n\n${transcripcion}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      return { error: `El evaluador no respondió (${res.status}). ${detalle.slice(0, 160)}`.trim() };
    }
    const data = await res.json();
    if (data?.stop_reason === "refusal") return { error: "El evaluador no pudo calificar esta sesión. Intenta de nuevo." };
    if (data?.stop_reason === "max_tokens") return { error: "La calificación quedó incompleta. Intenta de nuevo." };
    const texto = (data?.content ?? []).find((c: { type: string }) => c.type === "text")?.text;
    if (!texto) return { error: "El evaluador respondió vacío. Intenta de nuevo." };
    const e = JSON.parse(texto) as Evaluacion;
    return {
      evaluacion: {
        nota: limitar(e.nota),
        veredicto: String(e.veredicto ?? ""),
        tecnicas: (e.tecnicas ?? []).map((t) => ({ nombre: String(t.nombre), nota: limitar(t.nota), comentario: String(t.comentario) })),
        fallos: (e.fallos ?? []).slice(0, 5).map((f) => ({ dijiste: String(f.dijiste), problema: String(f.problema), mejor: String(f.mejor) })),
        aciertos: (e.aciertos ?? []).slice(0, 4).map(String),
        siguiente_paso: String(e.siguiente_paso ?? ""),
      },
    };
  } catch (err) {
    return { error: `No se pudo calificar: ${err instanceof Error ? err.message : "error de red"}` };
  }
}
