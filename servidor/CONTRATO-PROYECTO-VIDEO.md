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
