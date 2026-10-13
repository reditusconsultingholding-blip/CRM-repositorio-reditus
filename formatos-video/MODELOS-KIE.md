# Modelos y flujo de Kie (para el proveedor `kie` del servidor)

Resumen de lo que se leyó en las skills del colega (carpeta `skills-colega`, sin ejecutar nada). La parte técnica sale de `clonacion-manual/scripts/clonador/kie.py`, `modelo.py`, `imagen.py` y `fondo.py`. **Nada de esto se probó contra la API**: antes de programar contra un endpoint o un identificador, verificarlo en la documentación de https://kie.ai.

Lo que aquí dice «por confirmar» no aparece en el material con identificador de API.

## 1. Flujo de la API

| Qué | Cómo |
|---|---|
| Base | `https://api.kie.ai` |
| Subidas | `https://kieai.redpandaai.co` |
| Autenticación | cabecera `Authorization: Bearer <clave>`; JSON con `Content-Type: application/json`. El script lee la clave de una línea `KIE_API_KEY=` en un `.env`; en el servidor debe ser una variable de entorno |
| Crear tarea | `POST /api/v1/jobs/createTask` con cuerpo `{ "model": "...", "input": { ... } }`. Éxito: `code == 200` y `data.taskId` |
| Consultar | `GET /api/v1/jobs/recordInfo?taskId=...` → `data.state` (`success`, `fail` o en curso), `data.resultJson` (cadena JSON con `resultUrls[]`), `data.failCode`, `data.failMsg` |
| Subir archivo | `POST {subidas}/api/file-stream-upload`, multipart con `uploadPath`, `fileName` y `file`. La URL viene en `data.downloadUrl` o `data.fileUrl`. Los archivos subidos caducan a las 24 h |
| Saldo | `GET /api/v1/chat/credit` → `data` |
| Música (Suno) | `POST /api/v1/generate` con `customMode`, `instrumental`, `model`, `title`, `style`, `negativeTags`, `callBackUrl`; consulta en `GET /api/v1/generate/record-info?taskId=...` → `data.status` (`SUCCESS` o un estado de fallo) y pistas en `data.response.sunoData[]` (`audioUrl`) |

**Sondeo que usa el script:** primera espera de 20 s y luego cada 25–30 s; tope de 30 min para video y 10 min para imagen. En Suno, desde 10 s hasta cada 20 s, tope de 15 min.

**Errores:** hasta 5 intentos con espera creciente para fallos de red. Un error HTTP no se reintenta. Si la red se corta justo después de enviar una creación, **no se reintenta** (para no pagar dos veces): se guarda la tarea como incierta y se recupera por su `taskId`. Antes de lanzar, se compara el saldo con el costo estimado.

## 2. Modelos con identificador conocido

| Uso | Identificador | Parámetros que usa el script |
|---|---|---|
| Video con voz | `google/gemini-omni-flash-1-1` | `prompt`, `aspect_ratio: "9:16"`, `resolution: "720p"`, `duration` como texto. Duraciones `4`, `6`, `8`, `10` s. Audio nativo. Acepta imágenes de referencia (hasta 7 adjuntos; un video de referencia cuenta por 2) |
| Imagen desde texto | `gpt-image-2-5-sunburst-text-to-image` | `prompt`, `aspect_ratio`, `resolution: "2K"`, `background: "opaque"` |
| Imagen con referencias | `gpt-image-2-5-sunburst-image-to-image` | lo mismo, más `input_urls` (hasta 16). A 2K no acepta 4:5, 5:4, 3:1, 1:3 ni 9:21: se usa la proporción más cercana (4:5 → 3:4) |
| Imagen (alternativa) | `nano-banana-pro` | `resolution: "1K"`, `output_format: "png"`, referencias en `image_input` |
| Música | Suno, modelo `V4_5` | instrumental; devuelve 2 versiones de cerca de 53 s |
| Efectos de sonido | `elevenlabs/sound-effect-v2` | `text`, `duration_seconds` (máximo 22), `prompt_influence: 0.3` |

**Costos que cita el material** (créditos; orientativos): imagen GPT a 2K cerca de 10; Nano Banana Pro cerca de 18; video Omni sin referencia 63 / 84 / 105 / 126 para 4 / 6 / 8 / 10 s; Suno 12. En el video del curso, 10.000 créditos equivalen a unos 50 USD y bajar la imagen de 2K a 1K reduce el consumo.

## 3. Modelos que las skills nombran sin identificador (por confirmar en Kie)

Las skills de formato solo dan nombres comerciales. Para usarlos por Kie hay que buscar su identificador y sus parámetros:

- **Video con fotograma inicial y final:** Kling (clips de 5 o 10 s). Lo piden claymation, animación 3D, explicativo 3D y los cambios de estado de crochet. Omni Flash solo acepta fotograma inicial.
- **Video de 15 s:** Seedance (lo usa la entrevista cuando un intercambio no cabe en 10 s).
- **Video sin audio y económico:** Seedance o Kling a 720p, para animados con voz aparte.
- **Voz narrada:** ElevenLabs texto a voz (una sola voz por anuncio). El material solo trae el identificador de efectos de sonido, no el de voz.
- **Imagen con prompt negativo:** Seedream (crochet).
- **Canción con letra:** Suno en modo personalizado. El script solo muestra el caso instrumental; para letra hay que confirmar el campo donde va.

## 4. Qué pedirle a cada formato

`formatos/index.json` trae por formato `modelos_sugeridos` (`imagen`, `video`, `voz`, `musica`), `duracion_clip` y `audio_del_clip`. Resumen:

| Formato | Imagen | Video | Clip | Audio del clip | Voz | Música |
|---|---|---|---|---|---|---|
| ugc | GPT Image 2.5 (personaje neutro) | Omni Flash con referencias | 10 / 8 / 6 s | sí | nativa | en edición |
| entrevista | GPT Image 2.5 | Omni Flash (10 s) o Seedance (15 s), primer fotograma | 10 o 15 s | sí, 720p | nativa | no |
| podcast | GPT Image 2.5 | Omni Flash, primer fotograma | 5–10 s | sí | nativa | no |
| objeto-parlante | GPT Image 2.5 | Omni Flash con la línea en el prompt | hasta 10 s | sí | nativa | en edición |
| claymation | Seedream / Nano Banana | Kling inicio/fin o Seedance | 3–5 s | no | ElevenLabs | en edición |
| crochet | Seedream | Seedance (Kling en cambios de estado) | hasta 9–10 s | no | ElevenLabs | en edición |
| esqueleto | Nano Banana / GPT Image con imagen maestra | Kling | 5 o 10 s | no | ElevenLabs | cama tensa |
| animacion-3d | Nano Banana Pro | Kling inicio/fin | hasta 10 s | no | ElevenLabs | Suno instrumental |
| explicativo-3d | Nano Banana Pro | Veo o Kling inicio/fin | hasta 8–10 s | no | ElevenLabs | en edición |
| musica | el del formato visual | el del formato visual | 3–4 s | no | Suno (cantada) | Suno con letra |
| historias-musicales | Nano Banana / Seedream | Kling / Veo / Seedance | 4 / 6 / 8 s | no | Suno (cantada) | Suno con letra |
| historia, usos-del-producto, pizza | GPT Image 2.5 | Omni Flash | 4–8 s | según formato | ver frontmatter | en edición |

Los tres últimos no vienen del colega: sus modelos son propuesta de Reditus.

## 5. Reglas de generación que conviene respetar en el trabajador

- Revisar **9:16** antes de lanzar. Video a 720p salvo que se pida otra cosa.
- Formatos con voz nativa: la línea que se dice va dentro del prompt y el clip se pide **sin música**.
- Formatos con voz aparte: clip sin audio; la voz se genera una sola vez con la misma voz para todo el anuncio.
- La duración del clip se elige como la menor duración admitida que cubra el tramo; no se pide más tiempo para que quepa un texto largo: se acorta el texto.
- La foto real del producto se adjunta en toda toma donde se vea. No se pide «sin texto» de forma general, porque borra la etiqueta.
- Las marcas reales no van en el prompt (los generadores las bloquean): el producto se describe por su aspecto.
- Guardar el `taskId` antes de esperar el resultado, para no perder una generación ya cobrada.

## 6. Recursos sueltos (sin procesar)

En `C:\Users\Usuario\Downloads\`: `Musica (1).mp3` y `Clonar esta voz en Eleven Labs.mp3`. Quedan anotados; no se abrieron.

## 7. Cierre obligatorio: lo que recibe el trabajador

Regla de Reditus: todo video recalca la oferta y el llamado a la acción al final. Por eso cada trabajo de la cola trae un campo propio, además de las escenas:

```json
"cierre": { "oferta": "2 unidades por $89.900 con envío gratis y pago contra entrega", "llamadoALaAccion": "Pide el tuyo en el botón de abajo" }
```

Qué debe hacer `videos-worker` con él:

- Dibujarlo como **rótulo final en pantalla** durante la escena de cierre (la última, de 5 s como mínimo): texto grande, legible en un celular, encima del producto real y sin taparlo. La oferta arriba y más grande; el llamado a la acción debajo.
- Va **además** de los subtítulos, no en su lugar. Lo dibuja el montaje (no se le pide al modelo de video, que deforma las letras).
- Se escribe **tal cual llega**: son las palabras del cliente. No se resume, no se le agregan urgencias ni signos, no se traduce.
- Si `oferta` o `llamadoALaAccion` llegan vacíos (guiones guardados antes de esta regla), no se dibuja ese renglón y conviene dejarlo en los avisos del resultado; no se inventa un texto.
- La escena de cierre usa la foto real del producto (`imagenesProducto`) y corta el estilo del video en los formatos animados, narrativos o musicales.

El tipo está en `src/lib/trabajos-video.ts` del CRM (`TrabajoVideo.cierre`).
