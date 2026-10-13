# Contrato · video como proyecto por escenas

Acuerdo entre el CRM y el trabajador de videos (`servidor/videos-worker`). Quien cambie algo aquí avisa al otro lado.

## Idea

Un video deja de ser «un pedido» y pasa a ser un **proyecto con escenas**. Lo caro es generar clips; por eso:

1. primero se generan **imágenes base** (centavos) y una persona las aprueba;
2. solo de lo aprobado se generan **clips**;
3. el **armado** (unir, subtítulos, rótulo de cierre, música) lo hace el servidor y no cuesta;
4. una corrección rehace **solo la escena afectada** y vuelve a armar.

## Proyecto (lo guarda el CRM dentro de la versión del guion)

```jsonc
{
  "contexto": {            // lo arma el CRM antes de pedir nada
    "producto": "…", "pais": "CO",
    "fotos": ["https://…"],                 // fotos reales del producto (públicas)
    "analisisProducto": "…",                // tamaño, cómo se sostiene, cómo se usa (confirmado por una persona)
    "cierre": { "oferta": "…", "llamadoALaAccion": "…" }
  },
  "escenas": [
    {
      "n": 1,
      "paso": 1,                            // paso de la estructura (1 impacto … 5 cierre)
      "tipo": "generada",                   // "generada" | "foto-real" | "cierre"
      "duracion": 8,                        // segundos objetivo
      "voz": "texto hablado de la escena",
      "promptImagen": "…",                  // solo tipo "generada"
      "promptVideo": "…",                   // solo tipo "generada"
      "fotoUrl": "https://…",               // tipo "foto-real" o "cierre": foto real que se anima
      "movimiento": "acercar",              // foto-real: acercar | alejar | paneo-izq | paneo-der | quieto
      "imagen": { "estado": "pendiente", "url": null, "intentos": 0, "nota": "" },
      "clip":   { "estado": "pendiente", "url": null, "intentos": 0, "nota": "" }
    }
  ],
  "costo": { "creditos": 0, "segundosGenerados": 0, "imagenes": 0 },
  "final": { "estado": "pendiente", "url": null, "armados": 0 }
}
```

Estados de `imagen` y `clip`: `pendiente` → `en-cola` → `generando` → `por-aprobar` → `aprobada` | `rechazada` | `fallo`.
Las escenas `foto-real` y `cierre` no pasan por imagen ni por clip generado: su clip lo fabrica el trabajador al armar, sin costo.

Tope de intentos por escena y por tipo: 3 (constante en el CRM). Al llegar al tope el CRM no encola más y avisa.

## Trabajos en la cola

El trabajo mantiene los campos de hoy y gana `etapa` y una lista corta de qué hacer:

```jsonc
{
  "id": "…", "toma": "…", "guionId": "…", "version": 3,
  "etapa": "imagenes",                     // "imagenes" | "clips" | "armado"
  "relacionAspecto": "9:16",
  "formato": "ugc",
  "contexto": { /* como arriba */ },
  "escenas": [ /* SOLO las que hay que procesar en esta etapa, con sus campos */ ],
  "todas": [ /* etapa "armado": todas las escenas en orden, con clip.url o fotoUrl */ ],
  "opciones": { "subtitulos": true, "voz": true, "musica": null, "modelo": null }
}
```

- `imagenes`: por cada escena genera una imagen base con `promptImagen` (y `contexto.fotos` como referencia del producto), la sube y la reporta.
- `clips`: por cada escena genera el clip desde `imagen.url` (imagen a video) con `promptVideo`; la sube y la reporta.
- `armado`: descarga los clips de `todas` (los que ya tenga en disco no los vuelve a bajar), fabrica los clips de `foto-real` y `cierre`, une, subtitula con `voz`, dibuja el rótulo de `contexto.cierre`, mezcla música si hay, sube el final.

Un trabajo de etapa `imagenes` o `clips` puede traer una sola escena (corrección). Un cambio de texto, subtítulo, oferta o música es solo `armado`.

## Rutas (todas POST JSON, `Authorization: Bearer <SERVIDOR_SECRET>`)

Se conservan `tomar`, `progreso`, `resultado`, `fallo`. Cambios:

- `…/<id>/resultado` paso 1: `{ toma, pedirSubida: true, tipo: "imagen" | "clip" | "final", escena?: n }` → URL firmada de subida.
- `…/<id>/progreso`: además de lo de hoy acepta `escenas: [{ n, tipo: "imagen" | "clip", ruta | url, creditos?, segundos?, error? }]`. Cada elemento actualiza esa escena del proyecto (pasa a `por-aprobar`, o a `fallo` con el motivo) **en cuanto llega**, sin esperar al resto: la pantalla las va mostrando una a una.
- `…/<id>/resultado` paso 2 en `imagenes` / `clips`: `{ toma, etapa, creditos?, segundosGenerados? }` cierra el trabajo (las escenas ya se reportaron por `progreso`). En `armado`: como hoy, con la ruta del final.
- `…/<id>/fallo`: igual que hoy. Un fallo de una escena concreta NO tumba el trabajo: se reporta en `progreso` con `error` y el trabajo sigue con las demás.

El CRM suma `creditos`, `segundos` e imágenes al `costo` del proyecto.

## Reglas

- Nada se genera en `clips` si su imagen no está `aprobada`. Nada se arma si falta un clip `aprobado` (salvo `foto-real` y `cierre`).
- El video final siempre queda «Por aprobar» antes de poder usarse o enviarse.
- Los trabajos de `armado` no cuentan para el tope diario de videos; cuentan los de `clips`.
- Compatibilidad: un trabajo sin `etapa` es un video completo de los de antes y se procesa como hoy.

## Cambios

### 12-oct-2026 · precisiones del lado del trabajador (`videos-worker`)

Nada de lo acordado arriba cambia. Son puntos que el texto dejaba abiertos y cómo los resolvió el trabajador; si el CRM necesita otra cosa, se ajusta aquí.

1. **Créditos y segundos: se cuentan una sola vez, desde `progreso.escenas`.** El trabajador manda `creditos` y `segundos` en cada elemento de `progreso.escenas` y, además, el total de la etapa en el `resultado` que la cierra (`{ toma, etapa, creditos?, segundosGenerados? }`). Ese total es la **misma** plata ya reportada por escena (sirve para la fila del trabajo en «Cola de videos»). Porqué: si el CRM sumara los dos al `costo` del proyecto, lo contaría doble.
2. **Formato de lo que se sube.** `tipo: "imagen"` es siempre **JPG** (si el modelo devuelve PNG o WebP, el trabajador lo convierte antes de subir); `clip` y `final` son **MP4**. Porqué: la URL firmada necesita un tipo de contenido fijo y el modelo de imagen no garantiza el formato.
3. **Cuándo se vuelve a descargar un archivo en `armado`.** El trabajador identifica cada archivo por su dirección **sin la parte firmada** (lo que va después de `?`) más `clip.intentos`. Por eso: (a) un enlace recién firmado del mismo archivo no se vuelve a bajar; (b) un clip rehecho **debe** llegar con otra ruta **o** con otro `intentos` (el campo ya existe en el proyecto), o el armado usará el archivo anterior. Las fotos (`fotoUrl`) y la música se identifican solo por su dirección sin firma: si se reemplaza una foto, que sea con otra dirección.
4. **`opciones.musica`**: una URL (`"https://…"`) o `{ "url": "https://…", "volumen": 0.2 }`. Con `null` no hay música (no se inventa una). Porqué: el contrato decía «música si hay» sin la forma del campo.
5. **`opciones.voz: false`** deja el video sin voz (ni la de los clips, ni narración). Si el campo no viene, se entiende `true`. `opciones.subtitulos` igual: solo `false` los quita.
6. **Escena `cierre`**: usa `fotoUrl` y, si no viene, la primera de `contexto.fotos`; sin ninguna, el rótulo va sobre un fondo liso y se avisa. Dura al menos 5 s aunque `duracion` sea menor (para que el rótulo se alcance a leer; se cambia en `config.json` → `armado.cierreMinSegundos`). Si `oferta` o `llamadoALaAccion` llegan vacíos, ese renglón no se dibuja y se avisa en `avisos`. Si el proyecto no trae ninguna escena `cierre`, el rótulo no se dibuja y se avisa.
7. **Duración de cada escena en el final.** `generada`: `duracion`, recortando el clip si sobra (el modelo solo hace 4, 6 u 8 s); si el clip es más corto que `duracion`, queda lo que dura el clip. `foto-real` y `cierre`: `duracion`. En cualquier tipo, si la narración de ElevenLabs de esa escena dura más, la escena se alarga hasta que termine la frase.
8. **Fallos que sí tumban el trabajo** (van por `fallo`, no por `progreso`): no poder hablar con el CRM o subir un archivo, una `etapa` desconocida, no tener proveedor de imagen configurado y, en `armado`, que falte un clip (sin `clip.url`, o con `clip.estado` distinto de `aprobada` cuando el campo viene). Todo lo demás es fallo de **una** escena y va por `progreso` con `error`.
9. **Una escena que no sea `generada`** dentro de un trabajo de `imagenes` o `clips` se reporta con `error` (su clip lo fabrica el armado); no se genera nada para ella.
10. **Clave o saldo del proveedor (401 / 402)**: la primera escena lo reporta con su motivo y las que siguen en ese trabajo se reportan con el mismo motivo **sin** pedirse (fallarían igual).
11. **Reintento sin pagar dos veces.** Si una imagen o un clip queda «pendiente en el proveedor» (se venció la espera), la escena se reporta con `error` y el trabajador guarda el identificador de esa tarea: cuando el CRM vuelva a encolar **esa misma escena con el mismo texto** (aunque sea otro trabajo), se retoma la tarea ya pagada en vez de crear otra. Si el texto cambió, sí se crea una nueva.
12. **Campos extra que el trabajador acepta en el trabajo** (opcionales, no los exige): `opciones.modeloImagen` (alias de `config.json` → `kieImagen.modelos`) y `escena.nombre` (para el registro).
13. **Ajustes tras leer las precisiones del CRM (abajo).** (a) Punto 1 del CRM: la memoria de tareas pendientes del punto 11 **no** va por `n`; va por lo que se pidió (texto + fotos o imagen + relación). Dentro de un trabajo sí se lleva la cuenta por `n` (es estable ahí). (b) Punto 3 del CRM: el trabajador lee `escenas[].ok` de la respuesta de `progreso`; con `ok: false` pide otra subida, sube de nuevo y reporta otra vez (una sola vez más, sin volver a generar); si sigue en `false`, el trabajo va por `fallo` con ese motivo y lo ya generado queda guardado para el reintento. (c) Punto 8 del CRM: la música llega solo como URL; la forma `{ url, volumen }` del punto 4 queda aceptada pero sin uso.

### 12-oct-2026 · precisiones del lado del CRM

Aclaraciones y añadidos hechos al implementar el lado del CRM. Ninguno rompe lo de arriba ni las precisiones del trabajador; todos los campos nuevos son opcionales.

1. **`escenas[].n` es el número de orden y puede cambiar** si la persona reordena, agrega o quita escenas (el CRM solo lo permite cuando no hay ningún trabajo del proyecto en curso). Por eso el trabajador **no debe guardar en disco por `n`**: la caché del armado va por dirección, como ya hace (punto 3 de arriba): cada regeneración se sube a una carpeta nueva (`…/proyecto/<trabajoId>/`), así que su URL siempre cambia, y `intentos` también sube. Dentro de un mismo trabajo `n` es estable.
2. **Subida por tipo** (`resultado` paso 1): con `tipo: "imagen"` la ruta es `.jpg` con `content-type: image/jpeg` (el trabajador siempre sube JPG, punto 2 de arriba); opcionalmente acepta `extension: "png" | "webp"`. La respuesta trae `subida.ruta`; esa misma `ruta` es la que se reporta en `progreso`. Rutas: `videos-generados/<guionId>/proyecto/<trabajoId>/e<n>-imagen.<ext>` y `…/e<n>-clip.mp4`. Con `tipo: "final"` (o sin `tipo`) es la subida del video armado, como hoy. En un trabajo de `imagenes` o `clips`, pedir subida sin `tipo` responde 400.
3. **`progreso` con `escenas`**: `estado` pasa a ser opcional (se asume `generando`). La respuesta agrega `escenas: [{ n, tipo, ok, error? }]`: una escena con `ok: false` NO quedó registrada (ruta que no es la entregada, archivo que aún no está en Storage o vacío, escena que no es del trabajo) y hay que corregirla y reportarla otra vez. Repetir el reporte de una escena ya registrada no la duplica ni la cobra dos veces. Si una escena se reporta con `error` y después el trabajador la logra en su propio reintento, basta reportarla de nuevo sin `error`: vale la última.
4. **Reanudar sin volver a pagar**: si un trabajo de `imagenes` o `clips` se retoma (caída del trabajador, toma vencida), en `tomar` su `escenas` trae **solo las que todavía no se reportaron**. Si ya estaban todas, el CRM lo cierra solo y no lo entrega.
5. **Dónde queda lo reportado**: el trabajador nunca escribe el guion. Sus reportes quedan en el trabajo de la cola y el CRM los pasa al proyecto cuando la pantalla consulta (cada pocos segundos) o al abrir `/videos`. Para el trabajador no cambia nada; evita que su reporte y la aprobación de una persona se pisen.
6. **Costo**: por trabajo se toma lo mayor entre la suma de `creditos` / `segundos` por escena y el total de `resultado` (`creditos`, `segundosGenerados`), para no contar dos veces (coincide con el punto 1 del trabajador: el total es la misma plata). Una imagen cuenta cuando su escena se reporta sin `error`.
7. **Nota de corrección**: al regenerar, el CRM ya agrega la nota de quien revisó al final de `promptImagen` (etapa `imagenes`) o de `promptVideo` (etapa `clips`), bajo «CORRECCIÓN PEDIDA POR QUIEN REVISÓ EL INTENTO ANTERIOR». También viaja en `imagen.nota` / `clip.nota`.
8. **Campos de más en el trabajo por etapa**: además de lo del contrato llegan los de siempre (`producto`, `cliente`, `pais`, `formatoNombre`, `duracionObjetivo`, `imagenesProducto` = `contexto.fotos`, `cierre` = `contexto.cierre`, `pedidoPor`, `intentos`, `maxIntentos`) y cada escena trae `titulo`. `opciones.musica`: el CRM manda solo una URL https (texto) o `null`; no usa la forma `{ url, volumen }`. Cada escena lleva también `nombre` (igual a `titulo`).
9. **Tope diario**: `imagenes` y `armado` no cuentan. `clips` cuenta **una vez por proyecto y día** (regenerar un clip no gasta otro cupo: para eso está el tope de 3 intentos por escena y tipo). Los videos completos de antes cuentan como siempre.
10. **Cierre de `imagenes` / `clips`** (`resultado` paso 2): responde `{ ok, estado: "listo", etapa, guionId, version, faltaron: [n…] }`. Las escenas que nunca se reportaron quedan en `fallo` en el proyecto («el servidor terminó sin entregar esta escena») y la persona decide si las regenera.

### 13-oct-2026 · automatización para volumen (lado del CRM)

Lo que cambia para el trabajador con el modo directo, las variaciones y los lotes. El resto del contrato sigue igual.

1. **Más trabajos y de muchos proyectos a la vez.** Con el modo directo el CRM encola solo: al cerrar un trabajo de `imagenes` revisa las imágenes con IA y encola los `clips`; al cerrar los `clips` encola el `armado`. Los lotes y las variaciones multiplican eso por proyecto. Cada trabajo es independiente (su propio `guionId`, `toma` y carpeta de archivos), así que **se pueden procesar varios en paralelo**: `tomar` entrega uno por llamada y el bloqueo es por trabajo; basta llamar `tomar` varias veces. Dentro de un trabajo, las escenas también pueden ir en paralelo: cada una se reporta por `progreso` cuando termina, en cualquier orden.
2. **`resultado` de cierre puede tardar más.** Al cerrar `imagenes` o `clips`, antes de responder el CRM hace avanzar el proyecto (revisión de imágenes con IA de visión incluida): puede tardar hasta ~60 s. Usar un tiempo de espera de al menos 120 s en esa llamada. Si se corta, el trabajo YA quedó cerrado: repetir el cierre responde lo mismo (es idempotente) y no duplica nada.
3. **`tomar` como latido.** Cuando la cola está vacía, `tomar` aprovecha para retomar proyectos en modo directo que se quedaron a medias; por eso una llamada sin trabajo puede tardar unos segundos más y, rara vez, devolver un trabajo recién encolado. Conviene seguir preguntando cada minuto aunque no haya nada.
4. **Armado sin revisar clip por clip.** Con «armar al terminar los clips», un `armado` puede traer en `todas` clips que ninguna persona aprobó todavía. Llegan con `clip.estado: "aprobada"` (para que la regla 8 del trabajador no tumbe el trabajo) y además `clip.sinRevisar: true`. No hay que tratarlos distinto; el campo es informativo.
5. **Regeneración automática.** Una imagen que la IA rechaza se vuelve a pedir UNA vez sola: llega como un trabajo de `imagenes` de una escena, con el motivo al final de `promptImagen` (igual que una corrección de una persona, punto 7 de arriba) e `imagen.intentos` en 2. Como el texto cambió, no aplica «retomar la tarea ya pagada» (punto 11 del trabajador): es una generación nueva.
6. **Variaciones.** Un proyecto hijo reutiliza los clips del original: en su `armado`, `todas[].clip.url` apunta a archivos de la carpeta del proyecto ORIGINAL (otro `guionId` en la ruta). La caché por dirección sirve tal cual y evita volver a descargarlos. El trabajo trae `variacion: true` (informativo).
7. **Topes.** Los fija el CEO en el CRM (videos por día, variaciones por día, intentos por escena, créditos por proyecto y por día). El tope de créditos se aplica ANTES de encolar con lo ya reportado; por eso importa que `creditos` llegue en cada elemento de `progreso.escenas` (punto 1 del trabajador): si no llega, el CRM no puede frenar el gasto.

### 13-oct-2026 · volumen (lado del trabajador)

Lo que hace el trabajador desde hoy y lo que propone. Nada de lo anterior cambia de forma; los campos nuevos son opcionales.

1. **Varios trabajos a la vez.** El trabajador llama `tomar` hasta tener 3 trabajos en curso (configurable) y, mientras tenga puestos libres y algo en curso, vuelve a preguntar cada 10 s (ocioso, cada minuto como siempre). Dentro de un trabajo las escenas van en paralelo y se reportan por `progreso` en cualquier orden, cada una en su propia llamada. Para el CRM: pueden llegar varios `progreso` del mismo trabajo casi al mismo tiempo. Mientras un trabajo espera turno (cupo del proveedor o del armado), sigue mandando `progreso` sin `escenas` cada ~45 s como latido.
2. **Orden.** El trabajador atiende en el orden en que `tomar` entrega. Por dentro da el cupo del proveedor y del armado primero a los trabajos de `armado` y a los de **una sola escena** (correcciones), y entre iguales alterna por `guionId`. Con eso una corrección se adelanta a un lote **si consigue uno de los 3 puestos**. Para que no dependa de eso, conviene que `tomar` entregue primero armados y correcciones.
3. **Propuesta (no implementada en el CRM; el trabajador ya la entiende): `prioridad`.** Campo opcional numérico en el trabajo; mayor = más urgente; si no viene, el trabajador usa 1 para armados y trabajos de una escena y 0 para el resto. Porqué: hoy «urgente» se deduce de la forma del trabajo; un lote de una sola escena o una corrección de dos escenas se clasifican mal.
4. **Propuesta (no implementada; apagada en el trabajador): `soloUrgentes` en `tomar`.** Cuerpo `{ trabajador, soloUrgentes: true }` → el CRM entrega solo armados y correcciones (o `prioridad` > 0), o `null`. Permitiría reservar un puesto extra para urgentes cuando los 3 están ocupados por lotes. El trabajador **no** manda ese campo hasta que se active en su `config.json` (`paralelo.cupoUrgentes`), así que hoy `tomar` recibe lo mismo de siempre.
5. **Nuevo campo opcional del trabajo: `gastoMaximoCreditos`** (número, en créditos del proveedor; vale para `imagenes` y `clips`). El trabajador no crea tareas pagas que harían pasar de ese máximo lo gastado **por ese trabajo** (cuenta también lo gastado en intentos anteriores del mismo trabajo). Las escenas que no se pidan se reportan por `progreso` con `error` que empieza por **`tope de gasto`**, y el trabajo se cierra normal por `resultado` (no por `fallo`). Detalles: (a) retomar una tarea ya creada no cuenta como gasto nuevo; (b) mientras no se conoce el costo de una tarea, ese trabajo va de a una; (c) depende de que el proveedor reporte créditos (Kie sí; con uno que no los reporte el tope no puede frenar). Sugerencia para el CRM: no contar como intento fallido de la escena un `error` que empiece por «tope de gasto».
6. **Caché entre proyectos (corrige el punto 3 de las precisiones del 12-oct).** La caché del armado ahora es una sola para todos los proyectos y cada archivo se identifica **solo por su dirección sin la firma**; `clip.intentos` ya no interviene. Encaja con el punto 6 del CRM (variaciones) y con su punto 1 del 12-oct (cada regeneración se sube a una carpeta nueva). Sigue valiendo la condición: un archivo distinto debe tener una dirección distinta.
7. **Cierre de etapa.** El `resultado` que cierra `imagenes` o `clips` espera hasta 150 s la respuesta (punto 2 del CRM) y, si se corta, se repite.
8. **429 del proveedor.** No toca al CRM: el trabajador espera y reintenta por su cuenta (hasta 20 min) sin perder la tarea; durante esa espera el trabajo sigue mandando latidos.

### 13-oct-2026 · «Clonar anuncio»: análisis de la referencia (PREPARADO, no implementado en ningún lado)

Hoy la estructura del anuncio de referencia la describe una persona en el CRM, toma por toma (`referenciaTomas` en el guion), y con eso se escribe el guion y se propone el plan. **No hay nada que el trabajador deba hacer todavía.** Esto es lo que haría falta para que el análisis sea automático; lo hace el trabajador (necesita ffmpeg y transcripción, que en el CRM no caben):

1. **Trabajo nuevo, `etapa: "analisis"`** (el CRM aún no lo encola). Llegaría así: `{ id, toma, guionId, etapa: "analisis", referencia: { url: "https://…" } }`, donde `url` es un archivo de video que la persona subió al CRM (Storage, enlace https). Enlaces de bibliotecas de anuncios o redes NO: no se descargan desde el servidor.
2. **Qué devuelve** por `resultado` (sin subir archivos): `{ toma, etapa: "analisis", duracion, tomas: [{ desde, hasta, tipo, encuadre, textoEnPantalla, quePasa }], frases: [{ desde, hasta, funcion }] }`.
   - `tipo`: `"persona-habla" | "persona-accion" | "producto" | "apoyo" | "texto"`. `encuadre`: `"primer-plano" | "plano-medio" | "plano-abierto" | "detalle"`.
   - `funcion`: `"gancho" | "dolor" | "causa" | "intento-fallido" | "mecanismo" | "demostracion" | "prueba" | "oferta" | "cierre"`.
   - `quePasa`: una frase que describe la FORMA de la toma con palabras propias. **Nunca** la transcripción literal, nombres de personas, marcas, textos de pantalla ni descripción de rasgos de las personas: el CRM clona la estructura, no el material.
3. **Cómo**: cortes de plano con ffmpeg (detección de escena) → un fotograma por toma; transcripción con tiempos del audio; una pasada de visión/texto que clasifica cada toma y cada frase con las listas de arriba. Los fotogramas y la transcripción se usan y se descartan en el servidor: no viajan al CRM ni se guardan.
4. **Costo**: es análisis, no generación; no cuenta para ningún tope. Si falla, el CRM deja el formulario guiado como está.

