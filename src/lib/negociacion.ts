// Maestría en negociación (/maestria): plan de estudio, escenarios y reglas de
// graduación. Sin dependencias de servidor: lo importan la página y los
// componentes de cliente. Los prompts de la IA viven en `negociacion-server.ts`.
//
// El contenido resume con palabras propias el método de Chris Voss (exnegociador
// del FBI): su libro «Rompe la barrera del no» y lo que enseña en su escuela
// The Black Swan Group. No reproduce texto del libro.

export type Dificultad = "facil" | "media" | "dificil";
export type TipoSesion = "clase" | "practica" | "examen";
export type Mensaje = { role: "user" | "assistant"; content: string };

export type Evaluacion = {
  nota: number;
  veredicto: string;
  tecnicas: { nombre: string; nota: number; comentario: string }[];
  fallos: { dijiste: string; problema: string; mejor: string }[];
  aciertos: string[];
  siguiente_paso: string;
};

export type Modulo = {
  n: number;
  titulo: string;
  resumen: string;
  /** Explicación en Markdown: se lee ANTES de practicar. */
  leccion: string;
  frases: string[];
  errores: string[];
  /** Técnicas que el evaluador debe buscar en la práctica de este módulo. */
  tecnicas: string[];
  /** Situación de práctica que interpreta la IA. */
  practica: string;
};

/** La IA empieza así un mensaje cuando detiene la escena para corregir. */
export const PAUSA = "⏸";

export const NOTA_APROBAR = 80;
export const NOTA_EXAMEN = 90;
export const MODULO_EXAMEN = 13;
export const PRACTICAS_MAESTRO = 10;
export const NOTA_PRACTICA_MAESTRO = 85;
export const DIFICILES_MAESTRO = 3;
/** Turnos mínimos del alumno para que una sesión se pueda calificar. */
export const TURNOS_MINIMOS = 4;

export const DIFICULTADES: { id: Dificultad; texto: string; detalle: string }[] = [
  { id: "facil", texto: "Fácil", detalle: "Te detiene y te corrige seguido" },
  { id: "media", texto: "Media", detalle: "Solo te detiene en errores graves" },
  { id: "dificil", texto: "Difícil", detalle: "No te detiene: reacciona como en la vida real" },
];

export const MODULOS: Modulo[] = [
  {
    n: 1,
    titulo: "Mentalidad, escucha y tono de voz",
    resumen: "Negociar es descubrir información, no ganar una discusión.",
    leccion: `**La idea.** Una negociación no es un debate que se gana con argumentos: es una conversación para **descubrir** qué quiere y qué teme la otra persona. Quien más escucha, más poder tiene. Las personas no deciden con lógica; deciden con emociones y luego lo justifican.

**Tres reglas de arranque**

1. **Ve despacio.** La prisa hace que el otro se sienta ignorado. Bajar el ritmo calma.
2. **Tu única tarea al inicio es escuchar.** Llega con hipótesis, no con certezas: todo lo que crees saber puede estar mal.
3. **El tono manda más que las palabras.**

**Las tres voces**

- **Voz de locutor nocturno:** grave, lenta, tranquila, con la frase bajando al final. Transmite calma y autoridad sin pelear. Úsala para lo que no es negociable.
- **Voz positiva y juguetona:** relajada, con una sonrisa. Es la de casi siempre: la gente piensa mejor cuando está de buen humor.
- **Voz directa o asertiva:** casi nunca. Genera rechazo.

**Cómo se ve bien hecho.** Cliente: «Eso está carísimo». Tú, sin defenderte, lento y tranquilo: «Carísimo…» y callas. Lo dejas hablar hasta entender qué hay detrás.`,
    frases: ["«Cuéntame más de eso.»", "«Quiero asegurarme de entenderte bien.»", "«Perdona, ¿cómo así?» (con tono tranquilo)"],
    errores: ["Responder de inmediato con argumentos o justificaciones.", "Hablar más que la otra persona.", "Subir el tono o acelerar cuando te presionan."],
    tecnicas: ["Escucha activa (deja hablar, no interrumpe ni argumenta)", "Ritmo lento y tono tranquilo", "Curiosidad en vez de defensa"],
    practica:
      "Eres un cliente potencial de una agencia de marketing que llega alterado: dice que ya lo estafó otra agencia y que todas son iguales. Hablas rápido y presionas. Te calmas SOLO si el alumno baja el ritmo, no se defiende y te deja hablar.",
  },
  {
    n: 2,
    titulo: "El espejo y el silencio",
    resumen: "Repite sus últimas palabras y cállate: el otro sigue hablando.",
    leccion: `**La idea.** El espejo es repetir, en tono de pregunta curiosa, **las últimas 1 a 3 palabras** (o las más importantes) de lo que acaba de decir la otra persona. Nada más. Suena demasiado simple, pero hace que el otro se sienta escuchado y, sin darse cuenta, **explique más**.

**Los 4 pasos**

1. Usa la voz tranquila.
2. Si hace falta, empieza con «Perdona…».
3. Haz el espejo (sus palabras, no las tuyas).
4. **Silencio de al menos 4 segundos.** Aquí es donde funciona. No lo rellenes.

**Para qué sirve.** Ganas tiempo, obtienes información y evitas el «¿qué quieres decir con eso?», que suena a ataque.

**Ejemplo**

- Él: «No podemos arrancar este mes, hay temas internos.»
- Tú: «¿Temas internos?» … (silencio)
- Él: «Sí, es que el socio no está convencido del presupuesto.»

Acabas de descubrir quién decide y cuál es la objeción real, sin haber preguntado nada.`,
    frases: ["«¿…[sus últimas 2 o 3 palabras]?»", "«Perdona, ¿[palabra clave]?»"],
    errores: ["Repetir la frase completa (suena a loro o a burla).", "Hacer el espejo y enseguida seguir hablando.", "Usarlo con tono de reto en vez de curiosidad."],
    tecnicas: ["Espejo (repetir 1 a 3 palabras clave)", "Silencio después del espejo", "Tono curioso, no desafiante"],
    practica:
      "Eres un cliente que da respuestas vagas: «lo tengo que pensar», «hay temas internos», «ahora no es el momento». Tienes una razón oculta concreta (tu socio no aprueba el gasto y ya tienen cotización de un competidor). Revelas un pedazo de esa información cada vez que el alumno hace un buen espejo y NO sigue hablando.",
  },
  {
    n: 3,
    titulo: "Etiquetas y empatía táctica",
    resumen: "Ponle nombre a lo que siente el otro para desactivarlo.",
    leccion: `**La idea.** Empatía táctica es entender lo que siente la otra persona **y decírselo**. No es estar de acuerdo ni ser amable: es demostrar que lo ves. Una **etiqueta** le pone nombre a esa emoción.

**La fórmula**

- «Parece que…»
- «Suena a que…»
- «Da la impresión de que…»

Nunca «Yo siento que…» o «Lo que yo escucho es…»: la palabra *yo* hace que el otro se ponga en guardia.

**Qué logra**

- Etiquetar una emoción **negativa** la reduce («Parece que te quedaste con mal sabor de la última agencia»).
- Etiquetar una **positiva** la refuerza («Parece que este proyecto te importa mucho»).

**Después de etiquetar: silencio.** Deja que la etiqueta trabaje. Si te equivocas no pasa nada: te corrige y aun así aprendes («No es eso, es que…»).

**Ejemplo**

- Él: «Ya he pagado por tres landings y ninguna vendió.»
- Tú: «Suena a que estás cansado de pagar por promesas.» … (silencio)
- Él: «Exacto. Lo que necesito es ver resultados antes de soltar más plata.»`,
    frases: ["«Parece que te preocupa…»", "«Suena a que esto ya te pasó antes.»", "«Da la impresión de que hay algo que no te cuadra.»"],
    errores: ["Empezar con «yo entiendo que…» o «yo siento que…».", "Etiquetar y luego añadir «pero…».", "Decir «te entiendo» en vez de nombrar la emoción concreta."],
    tecnicas: ["Etiquetas («Parece que… / Suena a que…»)", "Silencio después de la etiqueta", "Empatía sin ceder ni dar la razón"],
    practica:
      "Eres un cliente molesto porque la entrega de sus videos se retrasó una semana. Estás frustrado y amenazas con irte. Tu emoción de fondo es miedo: lanzas una campaña el viernes y quedarás mal con tu jefe. Bajas la guardia solo cuando el alumno etiqueta bien tus emociones; si se justifica o dice «te entiendo, pero», te enojas más.",
  },
  {
    n: 4,
    titulo: "Auditoría de acusaciones",
    resumen: "Di tú primero lo peor que el otro puede pensar de ti.",
    leccion: `**La idea.** Antes de una conversación difícil, haz la lista de **todo lo malo** que la otra persona podría pensar o decir de ti, y **dilo tú primero**. Cuando lo nombras, pierde fuerza. Si lo escondes, crece.

**Cómo se prepara**

1. Escribe cada acusación posible, incluso las injustas o exageradas.
2. Conviértelas en etiquetas: «Vas a pensar que…», «Seguro te parece que…».
3. Dilas al inicio, de corrido, con voz tranquila, y calla.

**No las niegues.** «No quiero que pienses que soy un aprovechado» mete la idea. Es mejor «Vas a pensar que me estoy aprovechando».

**Lo que suele pasar.** El otro responde suavizando: «No, tampoco es para tanto». Su cerebro deja de buscar ataques y empieza a escuchar.

**Ejemplo (vas a subir el precio a un cliente antiguo)**

«Esto te va a caer mal. Vas a pensar que somos unos desagradecidos después de dos años trabajando juntos, y que solo nos importa la plata.» … (silencio)

Después de eso, explicar el cambio es mucho más fácil.`,
    frases: ["«Vas a pensar que…»", "«Seguramente esto te va a sonar a…»", "«Estás en todo tu derecho de sentir que…»"],
    errores: ["Suavizar: quedarse corto con las acusaciones.", "Negarlas («no quiero que pienses que…»).", "Disculparse de más y ofrecer una concesión antes de que te la pidan."],
    tecnicas: ["Auditoría de acusaciones al inicio", "Etiquetas sin negación", "No conceder nada por adelantado"],
    practica:
      "Eres un cliente fiel desde hace dos años. El alumno viene a decirte que el precio de tus landing pages sube 30 %. Si entra directo al precio o se disculpa demasiado, reaccionas indignado y amenazas con buscar a otro. Si abre con una buena auditoría de acusaciones, le restas gravedad («no, tampoco es para tanto») y escuchas.",
  },
  {
    n: 5,
    titulo: "Dominar el «no»",
    resumen: "El «no» da seguridad; el «sí» forzado es mentira.",
    leccion: `**La idea.** Empujar a alguien hacia el «sí» lo pone a la defensiva: siente que le están vendiendo. En cambio, decir **«no» lo hace sentir a salvo y en control**. Después de un «no», la gente se relaja y habla. El «no» no es el final: es el comienzo de la negociación.

**Preguntas orientadas al «no».** Reformula lo que pedirías con un «sí» para que la respuesta cómoda sea «no»:

- En vez de «¿Tienes un minuto?» → **«¿Te llamo en mal momento?»**
- En vez de «¿Te parece bien?» → **«¿Sería una locura si…?»**
- En vez de «¿Estás de acuerdo?» → **«¿Estás en contra de que…?»**

**Cuando te dejan en visto.** Un mensaje de una sola línea: **«¿Ya descartaste este proyecto?»** Casi siempre responden rápido, porque a nadie le gusta sentir que perdió algo.

**Qué puede significar un «no».** «Todavía no estoy listo», «no entiendo», «no puedo pagarlo», «necesito hablarlo con alguien». Después de un «no», pregunta: «¿Qué es lo que no te funciona de esto?»`,
    frases: ["«¿Te llamo en mal momento?»", "«¿Sería una mala idea que…?»", "«¿Ya descartaste este proyecto?»", "«¿Qué es lo que no te cuadra?»"],
    errores: ["Encadenar preguntas para sacar «sí, sí, sí».", "Tomar el «no» como rechazo y rendirse o insistir.", "Preguntar «¿entonces sí?» para cerrar."],
    tecnicas: ["Preguntas orientadas al «no»", "Usar el «no» para seguir explorando", "No forzar el «sí»"],
    practica:
      "Eres un prospecto que pidió cotización hace tres semanas y dejó de responder. El alumno te contacta. Si busca un «sí» («¿tienes un minuto?», «¿te interesa todavía?») respondes evasivo y cortas rápido. Si usa preguntas orientadas al «no», te abres y cuentas que el proyecto se frenó porque tu jefe pidió comparar con dos proveedores más.",
  },
  {
    n: 6,
    titulo: "Llegar al «así es»",
    resumen: "Resume su mundo tan bien que diga «así es».",
    leccion: `**La idea.** El momento en que una negociación gira es cuando la otra persona dice **«así es»** (o «exacto», «eso mismo»). Significa que se siente comprendida del todo, y solo entonces está dispuesta a cambiar de postura.

**Cuidado con «tienes razón».** Suena parecido pero es lo contrario: es lo que decimos para que alguien nos deje en paz. Si oyes «tienes razón», no has avanzado.

**Cómo se llega: el resumen.** Junta lo que has ido descubriendo y devuélvelo completo:

**Resumen = paráfrasis** (lo que dijo, con tus palabras) **+ etiqueta** (lo que siente).

Y antes del resumen, usa todo lo anterior: silencios, pequeños «ajá», espejos y etiquetas.

**Ejemplo**

«A ver si te entendí. Llevas un año invirtiendo en pauta, las ventas no despegan, ya probaste con dos agencias que te prometieron mucho y te dejaron igual, y ahora tu socio te está presionando para que recortes. Suena a que estás cansado de apostar a ciegas.»

— «Así es.»

Desde ahí puedes proponer. Antes, no.`,
    frases: ["«A ver si te entendí…»", "«Entonces lo que está pasando es que…»", "«Suena a que lo más importante para ti es…»"],
    errores: ["Resumir tu propuesta en vez de su situación.", "Conformarte con un «tienes razón».", "Meter tu opinión o un «pero» dentro del resumen."],
    tecnicas: ["Resumen (paráfrasis + etiqueta)", "Conseguir un «así es» genuino", "No proponer antes de que se sienta entendido"],
    practica:
      "Eres dueño de una tienda online que duda en contratar. Cuentas tu situación por partes (ventas estancadas, dos malas experiencias con agencias, presión de tu socio, poco tiempo). Solo dices «así es» o «exacto» cuando el alumno hace un resumen que recoge los hechos Y la emoción. Si resume a medias o vende, respondes «sí, tienes razón» con desgano y sigues dudando.",
  },
  {
    n: 7,
    titulo: "Doblar la realidad",
    resumen: "Pérdida, justicia, plazos y anclas: lo que mueve una cifra.",
    leccion: `**La idea.** La gente no es racional con los números. Cuatro palancas cambian cómo se percibe una oferta:

**1. Aversión a la pérdida.** Duele más perder que lo que alegra ganar. Muestra lo que **pierde** si no hay acuerdo, no solo lo que gana.

**2. La palabra «justo».** Es la más poderosa. Si te dicen «solo queremos algo justo», no cedas: pide que te lo expliquen. Úsala tú al principio: «Quiero que sientas que te trato de forma justa; si en algún momento no es así, dímelo y lo revisamos».

**3. Los plazos.** Casi siempre son más flexibles de lo que parecen. No negocies contra tu propio reloj: un mal acuerdo es peor que ningún acuerdo.

**4. Anclas y cifras**

- **Ancla emocional antes del número:** prepara al otro para algo peor de lo que viene.
- **Deja que el otro diga la cifra primero**, si puedes.
- **Usa rangos:** «proyectos así están entre 1.800 y 2.400». El otro tiende a quedarse con el extremo que te conviene.
- **Cifras no redondas:** 1.870 suena calculado; 2.000 suena inventado.
- **Mueve lo no monetario:** plazos, alcance, forma de pago, un testimonio, un referido.

**Nunca partas la diferencia.** El punto medio suele ser malo para los dos.`,
    frases: ["«Quiero que sientas que esto es justo; si no, me lo dices.»", "«Trabajos así suelen estar entre X y Y.»", "«¿Qué te hace falta para que esto valga la pena para ti?»"],
    errores: ["Soltar tu precio de entrada y en cifra redonda.", "Proponer «partamos la diferencia».", "Bajar el precio sin pedir nada a cambio."],
    tecnicas: ["Anclaje (rango, cifra no redonda, ancla emocional)", "Enmarcar en pérdida", "Uso de «justo» y de términos no monetarios", "No partir la diferencia"],
    practica:
      "Eres un cliente que quiere un paquete de 3 landing pages y 6 videos. Tu presupuesto real es mayor del que dices. Presionas con «solo quiero un precio justo», pides que el alumno diga su precio primero y propones «partamos la diferencia». Cedes si ancla con un rango, usa cifras precisas, muestra lo que pierdes sin el proyecto y cambia concesiones por algo a cambio.",
  },
  {
    n: 8,
    titulo: "Preguntas calibradas",
    resumen: "«¿Cómo?» y «¿Qué?»: que el otro resuelva tu problema.",
    leccion: `**La idea.** Una pregunta calibrada es una pregunta abierta que empieza con **«¿Cómo…?»** o **«¿Qué…?»**. Le da al otro la **ilusión de control** (él tiene la palabra) mientras tú diriges la conversación. Lo pone a pensar en tu problema en vez de defender su postura.

**La reina de todas:** **«¿Cómo se supone que haga eso?»** — dicha con voz tranquila, es la forma de decir «no» sin decirlo. Obliga al otro a mirar tu situación y, muchas veces, a mejorar su oferta él solo.

**Evita**

- Preguntas de sí o no («¿Puedes subir el presupuesto?»).
- **«¿Por qué…?»**: suena a acusación en cualquier idioma. Cambia «¿Por qué quieres descuento?» por «¿Qué es lo que te hace pedir el descuento?».

**Repertorio**

- «¿Qué es lo más importante para ti en esto?»
- «¿Cómo puedo ayudarte a que esto funcione para los dos?»
- «¿Qué pasa si no lo resolvemos?»
- «¿Cómo te gustaría que avancemos?»
- «¿Qué te impide decidirlo hoy?»

**Regla de oro.** Cuando te ataquen, no contraataques: haz una pregunta calibrada. Y muerde tu lengua después.`,
    frases: ["«¿Cómo se supone que haga eso?»", "«¿Qué es lo más importante para ti aquí?»", "«¿Qué pasa si no hacemos nada?»"],
    errores: ["Preguntar «¿por qué?».", "Hacer preguntas cerradas de sí o no.", "Hacer la pregunta y responderla tú mismo."],
    tecnicas: ["Preguntas calibradas con «cómo» y «qué»", "«¿Cómo se supone que haga eso?» para decir no", "Evitar «por qué» y preguntas cerradas"],
    practica:
      "Eres un cliente exigente: pides 40 % de descuento, entrega en 3 días y pagar al final. Presionas y haces demandas una tras otra. Si el alumno responde con «no puedo», justificaciones o «¿por qué?», aprietas más. Si responde con preguntas calibradas de «cómo» y «qué», empiezas a resolverle el problema tú mismo y a soltar tus exigencias una por una.",
  },
  {
    n: 9,
    titulo: "Garantizar que se cumpla",
    resumen: "Un «sí» sin «cómo» no vale nada.",
    leccion: `**La idea.** Cerrar el trato no es el objetivo; el objetivo es que **se ejecute**. Un «sí» no sirve si después no pasa nada.

**Los tres tipos de «sí»**

- **De compromiso:** el real, lleva a la acción.
- **De confirmación:** una simple afirmación, sin promesa.
- **Falso:** el que dicen para quitarte de encima.

**Regla de los tres.** Haz que confirme lo mismo **tres veces** de formas distintas: con una pregunta calibrada, con un resumen («así es») y con una etiqueta. Es muy difícil mentir tres veces seguidas sin que se note.

**Las preguntas de «cómo»**

- «¿Cómo sabremos que vamos por buen camino?»
- «¿Qué hacemos si nos desviamos?»
- «¿Cómo afecta esto al resto de tu equipo?» ← descubre a **quienes deciden detrás de la mesa**: el socio, la pareja, el contador.

**Lee más allá de las palabras (regla 7‑38‑55).** El mensaje está sobre todo en el tono y el cuerpo. Si las palabras dicen «sí» y el tono dice duda, etiquétalo: «Dijiste que sí, pero noté algo de duda en tu voz».

**Los pronombres.** Quien dice mucho «yo» suele no ser quien decide. Quien habla de «nosotros» o «ellos» normalmente tiene a alguien detrás.`,
    frases: ["«¿Cómo sabremos que vamos bien?»", "«¿Quién más tiene que estar de acuerdo con esto?»", "«Dijiste que sí, pero parece que algo te hace dudar.»"],
    errores: ["Celebrar el primer «sí» y terminar la conversación.", "No preguntar quién más decide.", "Ignorar un «sí» dicho sin ganas."],
    tecnicas: ["Regla de los tres (confirmar de 3 formas)", "Preguntas de «cómo» para la ejecución", "Detectar a quien decide detrás de la mesa", "Etiquetar la incongruencia entre palabras y tono"],
    practica:
      "Eres un cliente que dice «sí, listo, hagámosle» muy rápido para terminar la llamada, pero en realidad no puede aprobar el pago: decide tu esposa, que maneja las finanzas del negocio, y no le has contado. Si el alumno acepta tu «sí» y cierra, la escena acaba con un acuerdo falso. Revelas la verdad solo si confirma de varias formas, pregunta cómo se va a ejecutar o quién más interviene, o etiqueta tu duda.",
  },
  {
    n: 10,
    titulo: "Regateo duro",
    resumen: "Tipos de negociador y el sistema Ackerman.",
    leccion: `**Primero: con quién hablas**

- **Analista:** metódico, frío, odia las sorpresas. Dale datos y tiempo; el silencio para él es pensar.
- **Complaciente:** cálido, quiere caer bien, dice «sí» fácil y luego no cumple. Pregúntale por el «cómo».
- **Asertivo:** directo, el tiempo es dinero, quiere ser escuchado. Primero haz que se sienta oído (espejos, resúmenes); después habla tú.

Trata al otro **como él necesita**, no como te gustaría que te trataran a ti.

**Decir «no» cuatro veces sin decir «no»**

1. «¿Cómo se supone que haga eso?»
2. «Tu oferta es muy generosa; lo siento, a mí eso no me funciona.»
3. «Lo siento, pero me temo que no puedo hacerlo.»
4. «Lo siento, no.»

**Sistema Ackerman (cuando toca regatear)**

1. Fija tu precio objetivo.
2. Primera oferta al **65 %** (si compras) — o su espejo si vendes.
3. Tres subidas cada vez más pequeñas: **85 %, 95 %, 100 %**.
4. Entre oferta y oferta, usa empatía y formas de decir «no» para que el otro se mueva primero.
5. La cifra final, **no redonda** (por ejemplo 1.873).
6. Con la última cifra, añade algo **no monetario** que demuestre que llegaste a tu límite.

**Si te golpean con una cifra absurda:** no contraataques con otra; desvía con una pregunta calibrada o cambia a lo no monetario.`,
    frases: ["«Tu oferta es generosa; lo siento, a mí eso no me funciona.»", "«¿Cómo se supone que haga eso?»", "«Es lo máximo que puedo: 1.873, y te incluyo…»"],
    errores: ["Hacer concesiones iguales o cada vez más grandes.", "Responder a una cifra extrema con otra cifra extrema.", "Tratar a un analista como a un asertivo (o al revés)."],
    tecnicas: ["Identificar el tipo de negociador y adaptarse", "Decir «no» sin decir «no»", "Concesiones decrecientes (Ackerman)", "Cifra final no redonda + elemento no monetario"],
    practica:
      "Eres un proveedor (editor de video freelance, estilo asertivo) que pide 45 USD por video. El alumno te contrata y su objetivo es cerrar en 30. Regateas duro, abres alto y dices que tienes otros clientes. Bajas solo ante concesiones decrecientes, formas empáticas de decir «no» y cuando te sientes escuchado. Si el alumno salta directo a su tope o parte la diferencia, te plantas arriba.",
  },
  {
    n: 11,
    titulo: "Cisnes negros",
    resumen: "El dato oculto que lo cambia todo.",
    leccion: `**La idea.** En casi toda negociación hay información que no conoces y que, si la descubres, cambia todo: los **cisnes negros**. Suele haber varios. No se encuentran preguntando de frente: salen cuando el otro se siente escuchado.

**Tres tipos de palanca**

- **Positiva:** puedes darle algo que quiere.
- **Negativa:** puedes hacerle perder algo. Nunca amenaces; etiquétala: «Parece que para ti es muy importante que esto salga antes del lanzamiento».
- **Normativa:** sus propias reglas y valores. Si muestras que lo que hace no encaja con lo que dice creer, se mueve solo.

**«No está loco».** Cuando el otro parece irracional casi siempre es por una de tres cosas:

1. Está **mal informado**.
2. Tiene una **limitación** que no te ha contado (no puede, no es que no quiera).
3. Tiene **otros intereses** que no conoces.

**Dónde buscar**

- Lo que no cuadra. Repásalo con espejos y etiquetas.
- Los momentos fuera de la reunión: antes de empezar, al despedirse, en una comida. Ahí se le escapa a la gente lo importante.
- **Lo que tienen en común.** Confiamos en quien se nos parece.

**Hábito.** Antes de cada negociación escribe: ¿qué no sé?, ¿qué lo haría actuar así?`,
    frases: ["«Parece que hay algo que hace esto más complicado de lo que se ve.»", "«¿Qué es lo que no estoy viendo?»", "«Da la impresión de que esto tiene que salir sí o sí antes de cierta fecha.»"],
    errores: ["Pensar que el otro «está loco» o «es terco».", "Aferrarte a tu plan cuando algo no cuadra.", "Usar lo que descubres como amenaza."],
    tecnicas: ["Descubrir información oculta (cisne negro)", "Etiquetar la palanca negativa sin amenazar", "Buscar la limitación o el interés oculto detrás de una postura «irracional»"],
    practica:
      "Eres un cliente que exige, de forma aparentemente irracional, cancelar el contrato y que le devuelvan todo. Tu cisne negro: tu empresa perdió a su principal inversionista la semana pasada y tienes prohibido decirlo; en realidad no quieres cancelar, necesitas pausar tres meses y no perder tu lugar. Das pistas pequeñas («las cosas cambiaron», «no depende de mí»). Lo revelas solo ante etiquetas y preguntas calibradas acertadas; si te discuten el contrato, te cierras.",
  },
  {
    n: 12,
    titulo: "Integración: la hoja de preparación",
    resumen: "Todo junto, en una negociación completa.",
    leccion: `**La idea.** Cuando hay presión no subes a la altura de la ocasión: **caes al nivel de tu preparación**. Antes de cada negociación importante llena una hoja de una página.

**La hoja en 5 partes**

1. **Objetivo.** Tu mejor escenario, concreto y ambicioso. No pienses en tu mínimo aceptable: eso te hace apuntar bajo.
2. **Resumen.** Dos frases con la situación del otro, a las que respondería «así es».
3. **Etiquetas y auditoría de acusaciones.** De tres a cinco frases listas: «Parece que…», «Vas a pensar que…».
4. **Preguntas calibradas.** De tres a cinco: qué valora, qué lo frena, quién más decide, cómo se ejecutará.
5. **Ofertas no monetarias.** Qué puedes dar y qué puedes pedir que no sea dinero.

**El orden en la conversación**

1. Arranca con tono tranquilo y, si hace falta, auditoría de acusaciones.
2. Escucha: espejos y etiquetas hasta entender.
3. Resume hasta el «así es».
4. Preguntas calibradas para que el otro proponga.
5. Si hay cifras: ancla, rango, concesiones decrecientes, cifra no redonda.
6. Asegura el «cómo» y confirma tres veces.

**En esta práctica** no hay una técnica del día: se evalúa que uses **la adecuada en cada momento**.`,
    frases: ["«A ver si te entendí…»", "«¿Qué es lo más importante para ti en esto?»", "«¿Cómo sabremos que vamos bien?»"],
    errores: ["Improvisar sin objetivo claro.", "Usar una sola técnica para todo.", "Saltar a la propuesta sin haber conseguido el «así es»."],
    tecnicas: ["Apertura (tono, auditoría de acusaciones)", "Espejos y etiquetas", "Resumen y «así es»", "Preguntas calibradas", "Manejo de la cifra (ancla, concesiones)", "Cierre con «cómo» y regla de los tres"],
    practica:
      "Negociación completa. Eres dueña de una marca de cosméticos que quiere un paquete mensual de la agencia (landing pages y videos). Eres de estilo analista. Tienes una cotización más barata de un competidor, dudas por una mala experiencia anterior, tu contador revisa todo gasto y necesitas lanzar en seis semanas (no lo dices de entrada). Negocias precio, plazos y forma de pago. Cedes solo ante buen uso de las técnicas en el momento adecuado.",
  },
];

export const EXAMEN = {
  titulo: "Examen final de maestría",
  escenario:
    "Negociación final, sin ayudas. Eres el director de compras de una cadena con 40 tiendas (estilo asertivo, con rasgos de analista) evaluando un contrato anual con la agencia. Abres con una cifra absurdamente baja, usas «solo quiero algo justo», pones un plazo falso («decido hoy»), das un «sí» falso a mitad de la conversación y escondes dos cisnes negros: (1) tu proveedor actual te falló y te quedaste sin campaña para la temporada alta, así que necesitas esto más de lo que aparentas; (2) quien firma es el gerente general, no tú. No regalas nada: cada concesión o dato hay que ganárselo con la técnica correcta. Nunca sales del personaje.",
};

export type Escenario = { id: string; titulo: string; descripcion: string; contexto: string };

export const ESCENARIOS: Escenario[] = [
  {
    id: "precio",
    titulo: "«Está muy caro»",
    descripcion: "Un prospecto interesado frena por el precio.",
    contexto:
      "Eres un prospecto de una agencia de marketing digital (landing pages y videos para e-commerce en LatAm). Te gusta la propuesta pero dices que está muy cara y que otra agencia cobra la mitad. El alumno es quien vende.",
  },
  {
    id: "descuento",
    titulo: "Cliente pide descuento",
    descripcion: "Un cliente actual quiere rebaja por volumen.",
    contexto:
      "Eres un cliente actual de la agencia que va a pedir más piezas este mes y exige un descuento fuerte «por fidelidad». Insinúas que podrías irte con otro. El alumno es quien vende.",
  },
  {
    id: "cobro",
    titulo: "Cobro de una factura vencida",
    descripcion: "Un cliente debe hace 45 días y da largas.",
    contexto:
      "Eres un cliente que le debe a la agencia una factura vencida hace 45 días. Das excusas, prometes pagar «la otra semana» y te incomoda el tema. El alumno viene a cobrar sin romper la relación.",
  },
  {
    id: "reembolso",
    titulo: "Cliente furioso pide reembolso",
    descripcion: "No le gustó la entrega y quiere su dinero.",
    contexto:
      "Eres un cliente furioso: la landing page que te entregaron no te gustó, dices que no es lo que pediste y exiges la devolución total. Amenazas con dejar una mala reseña pública. El alumno representa a la agencia.",
  },
  {
    id: "aumento",
    titulo: "Un colaborador pide aumento",
    descripcion: "Tu mejor editor quiere 40 % más o se va.",
    contexto:
      "Eres el mejor editor de video del equipo del alumno. Pides un aumento del 40 % y dices tener otra oferta. El alumno es tu jefe: quiere retenerte sin romper su estructura de costos.",
  },
  {
    id: "proveedor",
    titulo: "Proveedor sube tarifas",
    descripcion: "Un proveedor clave anuncia un alza.",
    contexto:
      "Eres un proveedor clave del alumno (programador freelance que publica sus páginas). Anuncias que desde el próximo mes cobras 35 % más y que tienes la agenda llena. El alumno es tu cliente.",
  },
  {
    id: "socio",
    titulo: "Desacuerdo con un socio",
    descripcion: "Tu socio quiere repartir utilidades y tú reinvertir.",
    contexto:
      "Eres socio del alumno en el negocio. Quieres repartir las utilidades del trimestre ya; el alumno quiere reinvertirlas. Te sientes poco valorado y llevas tiempo guardándotelo.",
  },
  {
    id: "compra",
    titulo: "Compra personal (carro o arriendo)",
    descripcion: "Negocia un precio fuera del trabajo.",
    contexto:
      "Eres el vendedor de un carro usado que el alumno quiere comprar. Pides un precio alto, dices que tienes otro interesado que va mañana y que el precio «ya está rebajado».",
  },
];

export const PERFILES = [
  { id: "sorpresa", texto: "Sorpresa", detalle: "No sabes con quién te toca" },
  { id: "analista", texto: "Analista", detalle: "Frío, metódico, quiere datos" },
  { id: "complaciente", texto: "Complaciente", detalle: "Amable, dice sí y no cumple" },
  { id: "asertivo", texto: "Asertivo", detalle: "Directo, impaciente, quiere ganar" },
] as const;

export type PerfilId = (typeof PERFILES)[number]["id"];

export type Progreso = { modulo: number; mejor_nota: number; intentos: number; aprobado_en: string | null };

export type SesionResumen = {
  id: string;
  tipo: TipoSesion;
  modulo: number | null;
  escenario: string;
  dificultad: Dificultad;
  nota: number | null;
  evaluacion: Evaluacion | null;
  created_at: string;
};

export type Requisito = { texto: string; hecho: boolean; detalle: string };

export type EstadoMaestria = {
  modulosAprobados: number;
  /** Primer módulo sin aprobar (1 a 12), o null si ya están todos. */
  moduloActual: number | null;
  practicasBuenas: number;
  dificilesBuenas: number;
  examenDisponible: boolean;
  graduado: boolean;
  graduadoEn: string | null;
  requisitos: Requisito[];
};

export function notaMinima(tipo: TipoSesion): number {
  return tipo === "examen" ? NOTA_EXAMEN : tipo === "practica" ? NOTA_PRACTICA_MAESTRO : NOTA_APROBAR;
}

/** Todo lo que decide qué está desbloqueado y si ya hay diploma. Lo usan la
 * página (para pintar) y las acciones del servidor (para hacer cumplir). */
export function estadoMaestria(progreso: Progreso[], sesiones: Pick<SesionResumen, "tipo" | "dificultad" | "nota">[]): EstadoMaestria {
  const aprobado = (n: number) => progreso.some((p) => p.modulo === n && p.aprobado_en);
  const modulosAprobados = MODULOS.filter((m) => aprobado(m.n)).length;
  const moduloActual = MODULOS.find((m) => !aprobado(m.n))?.n ?? null;
  const buenas = sesiones.filter((s) => s.tipo === "practica" && (s.nota ?? 0) >= NOTA_PRACTICA_MAESTRO);
  const practicasBuenas = buenas.length;
  const dificilesBuenas = buenas.filter((s) => s.dificultad === "dificil").length;
  const examen = progreso.find((p) => p.modulo === MODULO_EXAMEN);
  const examenDisponible =
    modulosAprobados === MODULOS.length && practicasBuenas >= PRACTICAS_MAESTRO && dificilesBuenas >= DIFICILES_MAESTRO;
  const graduado = !!examen?.aprobado_en;
  return {
    modulosAprobados,
    moduloActual,
    practicasBuenas,
    dificilesBuenas,
    examenDisponible,
    graduado,
    graduadoEn: examen?.aprobado_en ?? null,
    requisitos: [
      {
        texto: `Aprobar los ${MODULOS.length} módulos con ${NOTA_APROBAR} o más`,
        hecho: modulosAprobados === MODULOS.length,
        detalle: `${modulosAprobados} de ${MODULOS.length}`,
      },
      {
        texto: `${PRACTICAS_MAESTRO} prácticas libres con ${NOTA_PRACTICA_MAESTRO} o más`,
        hecho: practicasBuenas >= PRACTICAS_MAESTRO,
        detalle: `${Math.min(practicasBuenas, PRACTICAS_MAESTRO)} de ${PRACTICAS_MAESTRO}`,
      },
      {
        texto: `De esas, ${DIFICILES_MAESTRO} en dificultad difícil`,
        hecho: dificilesBuenas >= DIFICILES_MAESTRO,
        detalle: `${Math.min(dificilesBuenas, DIFICILES_MAESTRO)} de ${DIFICILES_MAESTRO}`,
      },
      {
        texto: `Examen final con ${NOTA_EXAMEN} o más`,
        hecho: graduado,
        detalle: graduado ? `${examen?.mejor_nota}` : examen?.intentos ? `mejor nota ${examen.mejor_nota}` : "pendiente",
      },
    ],
  };
}
