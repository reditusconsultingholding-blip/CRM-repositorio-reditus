# Trabajador de videos de Reditus

Proceso de Node que vive en el servidor. Cada minuto le pregunta al CRM si hay un video pendiente; si lo hay, genera cada escena con un proveedor por API, monta con ffmpeg (une escenas, normaliza a la relación de aspecto, mezcla la voz y quema subtítulos estilo anuncio), sube el MP4 al CRM y reporta. En el CRM el video queda **«Por aprobar»**: nada sale sin que alguien del equipo comercial lo apruebe.

No tiene dependencias de npm: solo Node 20+ y ffmpeg.

## 1. Instalar

1. Instala **Node.js 20 o superior** (https://nodejs.org) y **ffmpeg** (`winget install Gyan.FFmpeg`). Comprueba: `node -v` y `ffmpeg -version`.
2. Copia `.env.ejemplo` como `.env` y llénalo (ver la tabla de abajo).
3. En el CRM (Vercel → Settings → Environment Variables) crea `SERVIDOR_SECRET` con **el mismo valor** que pusiste en el `.env`, y vuelve a desplegar. Sin esa variable el paso «Generar video» del CRM queda deshabilitado y la API responde 503.

| Variable | Para qué |
|---|---|
| `CRM_URL` | Dirección del CRM, sin barra final |
| `SERVIDOR_SECRET` | Secreto compartido con el CRM (igual en los dos lados) |
| `PROVEEDOR` | `simulado` (pruebas, no gasta), `kie` (el recomendado), `veo` o `fal` (alternativas) |
| `KIE_API_KEY` | Clave de Kie (solo con `PROVEEDOR=kie`) |
| `GEMINI_API_KEY` | Clave de la API de Gemini, para Veo directo (solo con `PROVEEDOR=veo`) |
| `FAL_KEY` | Clave de fal.ai (solo con `PROVEEDOR=fal`) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Voz de ElevenLabs, para los formatos con audio `elevenlabs`. Vacías = esos videos salen sin voz (lo reporta) |
| `NOMBRE_TRABAJADOR`, `FFMPEG`, `FFPROBE`, `CARPETA_DATOS` | Opcionales |

## 2. Probar con el simulado (no gasta)

```powershell
powershell -ExecutionPolicy Bypass -File .\probar.ps1          # local, sin CRM ni claves
powershell -ExecutionPolicy Bypass -File .\probar.ps1 -ConCrm  # atiende la cola del CRM una vez
```

La primera hace un video de mentira (clips de color con el nombre de cada escena, con subtítulos) en `datos\prueba-local\entregados\`. La segunda necesita el `.env` con `PROVEEDOR=simulado`: pide un video en `/videos` del CRM, córrela, y el video debe aparecer allá como «Por aprobar».

Otros comandos: `node trabajador.js --comprobar` (configuración, ffmpeg y secreto), `node trabajador.js --una-vez`, `node trabajador.js` (residente).

## 3. Dejarlo arrancando con Windows

PowerShell **como administrador**:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar-servicio.ps1
powershell -ExecutionPolicy Bypass -File .\instalar-servicio.ps1 -Quitar   # para quitarlo
```

Crea la tarea programada «Reditus - Trabajador de videos» (arranca al encender, cuenta SYSTEM, se relanza si se cae). Si ffmpeg quedó instalado solo para tu usuario, pon su ruta completa en `FFMPEG` y `FFPROBE` del `.env`.

## 4. Pasar a Kie (el proveedor recomendado)

Kie (https://kie.ai) da Veo 3.1 y otros modelos con una sola clave y cobra por créditos.

1. **Clave**: entra a kie.ai con la cuenta de la agencia → «API Key» → crea una y pégala en `KIE_API_KEY` del `.env`. Recarga créditos en «Billing» (precios en https://kie.ai/pricing).
2. Pon `PROVEEDOR=kie`.
3. **Primera llamada real, gastando lo mínimo** (una sola escena de 4 s, solo texto, 720p, sin CRM ni montaje):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\probar.ps1 -UnClip
   ```

   Deja el clip en `datos\un-clip\` y escribe los créditos de antes y después y los que cobró la tarea. Con otro texto: `.\probar.ps1 -UnClip -Prompt "…"`. Si se corta a la mitad, al repetirla retoma la misma tarea (no paga otra).
4. Mira el clip. Si está bien, llena `kie.usdPorCredito` en `config.json` (cuánto vale un crédito) para que el CRM muestre el costo en dólares, y reinicia la tarea de Windows.

Lo que hay que saber:

- **Variantes** (`config.json` → `kie.modelos`): `rapido` (veo3_fast, por defecto para texto y para imagen), `lite` (veo3_lite, la más barata) y `calidad` (veo3). Se cambia en `kie.porDefecto`, por formato en `kie.porFormato`, o por trabajo en el campo «Modelo» del CRM.
- **Clips**: 4, 6 u 8 segundos, en 9:16 o 16:9, a 720p (1080p y 4k cuestan más y van siempre a 8 s).
- **Foto del producto**: Kie la recibe **por enlace público** (no se sube el archivo). Se usan los enlaces https que se pegan en el CRM al pedir el video; deben abrir sin iniciar sesión. `kie.modoImagen`: `"primer-fotograma"` (la primera foto es el primer fotograma; por defecto) o `"referencia"` (hasta 3 fotos como referencia; solo 8 s y solo `rapido`/`lite`).
- **Audio**: los clips traen el audio de Veo, igual que con Veo directo; aplica lo de `config.json` → `audio` (ver la sección de Veo).
- **Consumo**: cada tarea devuelve los créditos realmente cobrados; quedan en el CRM (aviso del video) y en `costos.csv` (columna `creditos`).
- **Retención**: Kie guarda los archivos 14 días; el trabajador los descarga apenas terminan.
- **Errores**: Kie puede responder HTTP 200 con un código de error adentro (402 = sin créditos, 429 = límite). El trabajador mira ese código y reporta el motivo.

Qué se verificó contra la documentación de Kie y qué no: al inicio de `proveedores/kie.js`. **No se ha ejecutado con una clave real**; las pruebas locales usan un servidor de mentira que imita su contrato.

Kie también ofrece generación de imagen, música y voz; el trabajador todavía no las usa (ver `CAMBIOS.md`, «Siguiente paso»).

## 4b. Alternativa: Veo directo con Google

1. **Clave**: entra a https://aistudio.google.com con la cuenta de Google de la agencia → «Get API key» → «Create API key» (elige o crea un proyecto). Veo es de pago: activa la facturación de ese proyecto. Pega la clave en `GEMINI_API_KEY` del `.env`.
2. Abre `config.json` → `veo` y revisa lo marcado **verificar**: los identificadores de modelo (son «preview» y cambian) y `usdPorSegundo` de cada variante con la tarifa de https://ai.google.dev/gemini-api/docs/pricing (en `null` el costo se reporta solo en segundos).
3. Cambia `PROVEEDOR=veo` y reinicia la tarea. Haz **un** video de prueba y míralo antes de dejarlo solo. Si Google responde 400 por `durationSeconds` o por la imagen, cambia `duracionComoTexto` o `formatoImagen` en `config.json` (son los dos detalles que la documentación no deja claros).

Lo que hay que saber de Veo:

- **Clips cortos**: 4, 6 u 8 segundos por escena, solo en 9:16 o 16:9. Cada escena del guion es un clip; el montaje los une.
- **Variantes**: `estandar`, `rapido` (por defecto) y `lite`. Se elige en `veo.porDefecto`, por formato en `veo.porFormato`, o por trabajo en el campo «Modelo» del CRM (alias o identificador). La variante usada queda en el CRM y en `costos.csv`.
- **Audio**: Veo siempre genera audio. En `config.json` → `audio` se decide por formato:
  - `"veo"`: la frase del guion va en el prompt y la dice el clip; no se le pone otra voz encima. La escena conserva la duración completa del clip para no cortar la frase.
  - `"elevenlabs"`: se pide el clip sin diálogo, se descarta su audio y se monta la voz de ElevenLabs.
  - `"ninguno"`: mudo.
  En los tres casos los subtítulos salen del texto hablado del guion.
- **Foto del producto**: las escenas donde aparece se generan a partir de la primera foto pegada en el CRM (PNG, JPG o WebP, por enlace https).
- **Retención**: Google guarda el video 2 días; el trabajador lo descarga apenas termina.
- **Filtros**: si Veo bloquea una escena, el trabajo falla con ese motivo (Google no cobra los bloqueados) y se reintenta hasta 3 veces.

Qué se verificó contra la documentación oficial y qué no: está al inicio de `proveedores/veo.js`. El recorrido contra Google **no se ha ejecutado con una clave real**.

### Alternativa: fal.ai

`PROVEEDOR=fal` + `FAL_KEY`. Revisa antes cada modelo de `config.json` → `fal` en fal.ai (identificador, campos, duraciones, precio). Detalle de lo verificado en `proveedores/fal.js`. Tampoco se ha ejecutado con clave real.

Otro proveedor: copia `proveedores/simulado.js`, respeta la interfaz descrita en `proveedores/index.js` y pon su nombre en `PROVEEDOR`.

## 5. Costos

- `datos\registro\costos.csv`: una línea por trabajo con los **segundos generados** (lo que cobra el proveedor), los modelos y el costo estimado. Costo del mes ≈ suma de segundos × tarifa del modelo.
- El CRM muestra lo mismo por trabajo en «Cola de videos» (solo CEO) y tiene un tope diario (`TOPE_DIARIO_VIDEOS`, 6 por defecto, en `src/lib/trabajos-video.ts`).
- Es un estimado, no la factura: una petición que el proveedor cobró pero cuyo clip no llegó a descargarse no queda contada.

## 6. Cómo se comporta cuando algo falla

- Llamadas de red: reintentos con espera creciente (2 s, 5 s, 15 s, 30 s).
- Si un trabajo falla, se reporta el motivo; el CRM lo devuelve a la cola con espera (2 y 10 min) y al **tercer intento queda en `fallo`**. Mientras espera, se atienden los demás.
- Las escenas ya generadas se guardan en `datos\trabajos\<id>\` y se reutilizan en el reintento; con Kie, Veo o fal se retoma la misma tarea en vez de pagar otra.
- Si el proceso se cae o el equipo se reinicia, al arrancar retoma lo que quedó a medias. Si pasa 10 minutos sin reportar, el CRM le quita el trabajo y lo vuelve a encolar.
- Registro: `datos\registro\trabajador.log` (rota a los 5 MB, guarda 5). Las claves se tachan antes de escribir.
  Ver en vivo: `Get-Content .\datos\registro\trabajador.log -Tail 30 -Wait`

## 7. Límites que conviene saber

- Los tiempos de los subtítulos se reparten sobre la duración del audio en proporción al largo de cada palabra (no hay reconocimiento de voz): van cerca, no exactos.
- Con imagen-a-video el clip **arranca en la foto del producto** tal cual se pegó en el CRM.
- Con audio de Veo, los subtítulos se reparten sobre la duración de la escena: no hay forma de saber en qué instante exacto dice cada palabra.
- Los prompts salen de los del formato más lo que dice el guion en cada paso; los campos genéricos entre [corchetes] del formato llegan al modelo sin completar (el CRM lo avisa en el trabajo).
- Un trabajo a la vez por servidor.

Contrato de la API con el CRM: `src/lib/servidor-api.ts` en el repositorio del CRM.
