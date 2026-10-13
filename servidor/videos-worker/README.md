# Trabajador de videos de Reditus

Proceso de Node que vive en el servidor. Cada minuto le pregunta al CRM si hay un trabajo pendiente y lo atiende. En el CRM todo queda **«Por aprobar»**: nada sale sin que alguien del equipo lo apruebe.

Atiende dos clases de trabajo:

- **Proyecto por escenas** (trabajos con `etapa`; es el camino nuevo, pensado para gastar menos y poder supervisar): primero **imágenes base** (centavos) que una persona aprueba, luego **clips** solo de las imágenes aprobadas, y al final el **armado** en el servidor, que no cuesta. Una corrección rehace solo la escena tocada. Ver la sección 0.
- **Video completo** (trabajos sin `etapa`, como siempre): genera cada escena con el proveedor, monta con ffmpeg (une, normaliza, mezcla la voz, quema subtítulos) y sube el MP4. Sigue funcionando igual.

No tiene dependencias de npm: solo Node 20+ y ffmpeg.

## 0. Proyecto por escenas

El acuerdo con el CRM está en `..\CONTRATO-PROYECTO-VIDEO.md` (léelo: ahí están los campos y, al final, las precisiones del trabajador).

| Etapa | Qué hace | Cuesta |
|---|---|---|
| `imagenes` | Una imagen base por escena con el proveedor de imagen (`PROVEEDOR_IMAGEN`), usando las fotos reales del producto como referencia. La sube (JPG) y la reporta **en cuanto está**; el CRM la muestra para aprobar. | Créditos de imagen |
| `clips` | Un clip por escena, **desde su imagen aprobada** (imagen a video, la imagen es el primer fotograma), con el proveedor de video de siempre (`PROVEEDOR`). Si la imagen no está aprobada, no se pide. | Créditos de video |
| `armado` | Baja lo que falte, fabrica los clips de las escenas `foto-real` y `cierre` con la foto real del producto, une todo, subtitula, dibuja el rótulo de cierre, mezcla la música si el trabajo trae una pista, y sube el final. | Nada |

Lo que conviene saber:

- **Un fallo de una escena no tumba a las demás**: se reporta con su motivo y el trabajo sigue. Solo se cae el trabajo entero si no se puede hablar con el CRM o, en el armado, si falta un clip aprobado.
- **Nada se paga dos veces.** Lo ya generado queda en `datos\trabajos\<id>\` y se retoma tras un reinicio. Si una imagen o un clip quedó «pendiente» en el proveedor, su tarea se guarda en `datos\proyectos\<guion>-v<versión>\tareas.json` y se retoma cuando el CRM vuelva a pedir esa misma escena, aunque sea en otro trabajo. Crear una tarea paga nunca se reintenta a ciegas.
- **Duración**: el modelo de video solo hace 4, 6 u 8 s; se pide la menor que cubra la `duracion` de la escena y el armado **recorta lo que sobre**, sin cortar la frase (sección 0c).
- **Escenas `foto-real`** (costo cero, producto idéntico): la foto real con un movimiento suave (`acercar`, `alejar`, `paneo-izq`, `paneo-der`, `quieto`). La foto nunca se deforma: si no llena el cuadro, va entera sobre un fondo difuminado de ella misma. Ajustes en `config.json` → `armado.fotoReal`.
- **Rótulo de cierre**: en la escena `cierre` se dibujan la oferta (grande, sobre un panel oscuro) y el llamado a la acción (botón) durante toda la escena, **tal cual llegan** del CRM. El cuadro se reparte para que nada se pise: en vertical, oferta arriba · producto · botón · subtítulos; en horizontal, producto a la izquierda y textos a la derecha. Si un texto es muy largo se achica (y se avisa), no se recorta. Colores y fuente en `config.json` → `rotulo`.
- **Voz, uniones entre clips y música**: sección 0c. En corto: habla el propio clip (ElevenLabs solo si se pide), los clips se nivelan y se les quitan los silencios largos, y la música sale de la carpeta `musica\` según el tono.
- **Análisis de un video de referencia** (etapa `analisis`, para clonar un anuncio): sección 0c.
- **Armado rápido y repetible**: lo descargado y cada escena ya codificada quedan en `datos\cache\`, compartida por todos los proyectos. Volver a armar sin cambios no baja ni codifica nada; cambiar un texto (la oferta, un subtítulo) recodifica solo esa escena; poner o quitar música solo rehace el audio. El mismo proyecto da siempre el mismo archivo (mientras no se cambie `paralelo.hilosFfmpeg`). Lo que lleve 21 días sin usarse se borra solo (`diasParaBorrarCache`).
- **Imágenes base con Kie**: `config.json` → `kieImagen` (modelo por defecto «GPT Image 2.5 Sunburst» a 1K; alternativas Nano Banana 2 y Pro). Qué se verificó contra docs.kie.ai y qué falta por verificar: al inicio de `proveedores-imagen\kie.js`. **El precio en créditos no está en la documentación**: sale de la primera prueba real (`.\probar.ps1 -UnaImagen`).
- Otro proveedor de imagen: copia `proveedores-imagen\simulado.js`, respeta la interfaz descrita en `proveedores-imagen\index.js` y pon su nombre en `PROVEEDOR_IMAGEN`.

## 0b. Volumen: varios trabajos a la vez

Todo se ajusta en `config.json` → `paralelo` (sin tocar el `.env`):

| Ajuste | Por defecto | Qué limita |
|---|---|---|
| `trabajos` | 3 | Trabajos del CRM en curso a la vez |
| `imagenes` | 4 | Imágenes pidiéndose a la vez al proveedor (sumando todos los trabajos) |
| `clips` | 3 | Clips pidiéndose a la vez al proveedor (sumando todos los trabajos) |
| `armados` | 0 = automático | Armados a la vez: 2 si el equipo tiene 8 núcleos o más; si no, 1 |
| `hilosFfmpeg` | 0 = automático | Hilos de cada ffmpeg. Entre todos los armados se usa como mucho **la mitad de los núcleos** (en 8 núcleos: 2 armados × 2 hilos) |
| `prioridadBaja` | sí | ffmpeg corre con prioridad «por debajo de lo normal»: cualquier otro proceso del servidor pasa primero |
| `espera429` | 5 s → ×2 → tope 120 s, hasta 20 min | Qué hacer cuando el proveedor dice «demasiadas peticiones» |

Cómo se comporta:

- **Dentro de un trabajo** las escenas van a la vez, hasta donde dejen `imagenes` / `clips`. Cada una se reporta al CRM apenas termina.
- **Quién pasa primero**: los armados y los trabajos de una sola escena (correcciones) toman el siguiente cupo libre aunque haya un lote grande esperando. Entre trabajos de igual urgencia se alterna por proyecto: un lote no agota la fila él solo. Si el CRM manda `prioridad` en el trabajo, manda ese número.
- **429 del proveedor**: todas las llamadas a Kie esperan (5 s, 10 s, 20 s… hasta 120 s) y se insiste hasta 20 minutos. Un 429 al crear significa que Kie no creó nada, así que repetir no paga dos veces; una tarea ya creada nunca se pierde. Si salen muchos 429, baja `imagenes` o `clips`. (Solo Kie tiene este freno; `veo` y `fal` conservan sus reintentos de antes.)
- **Variaciones**: la caché del armado (`datos\cache\`) es de todos los proyectos y va por la dirección del archivo sin la firma. Un proyecto «hijo» que comparte clips con el original no baja ni codifica esas escenas otra vez: solo trabaja la que cambió. Dos armados que necesitan el mismo archivo a la vez lo hacen una sola vez.
- **Tope de gasto**: si el trabajo trae `gastoMaximoCreditos`, no se crean tareas pagas que lo harían pasarse; las escenas que falten se reportan con el motivo «tope de gasto» y el trabajo cierra normal. Mientras no se sabe cuánto cuesta una tarea, ese trabajo va de a una (aprende con la primera). El tope usa los créditos que reporta el proveedor: con un proveedor que no los reporta no puede frenar.
- **Medición**: `datos\registro\tiempos.csv`, una línea por trabajo de etapa: espera de turno aquí, cola del proveedor, generación, subida, armado y total de reloj (las cuatro primeras son la suma sobre las escenas, porque van varias a la vez). Con eso se ve si el cuello de botella es el proveedor o el servidor. La separación entre «cola» y «generación» depende de cada cuánto se consulta a Kie, así que es aproximada.
- Los videos completos de antes (sin `etapa`) siguen generando sus escenas una tras otra; lo único que cambia para ellos es que pueden ir varios trabajos a la vez y que ffmpeg corre con prioridad baja.

### Capacidad por hora (estimación)

**Medido** (con el simulado, en el equipo de desarrollo de 12 núcleos, ffmpeg a 3 hilos y prioridad baja; **no** en el servidor):

- Armar un video de 20 s y 5 escenas desde cero: 4–6 s. Volver a armar sin cambios: 0,6 s. Cambiar un texto: ~2 s. Una variación que comparte escenas: ~3 s, con otros trabajos corriendo a la vez.
- 8 trabajos mezclados (2 lotes de 8 imágenes, 3 clips, un trabajo con tope, 1 corrección, 3 armados de variación), hasta 6 a la vez: 12 s de reloj con un proveedor de mentira que tarda ~2 s por imagen. La corrección entró con los lotes en curso y salió antes que ellos.
- Lo que añade el trabajador por cada imagen o clip (subir y reportar): décimas de segundo.

Con eso, **el armado no es el límite**: aun suponiendo que el servidor (8 núcleos, 2 hilos por armado) vaya a la mitad de velocidad y que los clips reales pesen más que los simulados, dos armados a la vez dan del orden de cientos de videos por hora.

**No medido: depende del proveedor real** (Kie no se ha probado con clave). El límite es cuánto tarda Kie en cada tarea y cuántas deja correr a la vez:

- Clips por hora ≈ `clips` × 3600 ÷ (segundos que tarde un clip). Con 3 a la vez: si un clip tarda 2 min, ~90 por hora; si tarda 4 min, ~45.
- Imágenes por hora ≈ `imagenes` × 3600 ÷ (segundos por imagen). Con 4 a la vez: si tarda 30 s, ~480 por hora; si tarda 60 s, ~240.
- Un video con 3 escenas generadas y el resto en foto real: entre **15 y 30 videos nuevos por hora** con esos supuestos. Una variación que solo cambia la oferta o una escena cuesta casi nada más.

Esos tiempos por tarea son supuestos, no datos. El primer día con clave real mira `tiempos.csv`: las columnas `cola_proveedor_s` y `generacion_s` dicen cuánto tarda Kie de verdad; si aparecen 429 en el registro, baja `imagenes` o `clips` (o pide a Kie un límite mayor). Tampoco está medido cuántas peticiones por minuto aguanta la cuenta de Kie.

## 0c. Voz, uniones, música y análisis de referencia

### Quién habla

- **Por defecto habla el propio clip** (Veo, por Kie), en todos los formatos. ElevenLabs ya no se usa solo: hace falta que el trabajo lo pida (`contexto.voz.motor: "narracion"` u `opciones.voz: "elevenlabs"`) **y** que el servidor tenga la clave. Si lo pide y no hay clave, no falla: usa el audio del clip y lo avisa. `opciones.voz: false` = sin ninguna voz.
- **El texto de la frase, el acento y la voz los manda el CRM** dentro del prompt del clip (su bloque «AUDIO»). Cuando viene así, el trabajador no agrega nada. Cuando no viene (trabajos de antes), el trabajador arma la instrucción él: el acento sale de `contexto.voz` y, si no hay, del país del proyecto (España → castellano peninsular; México, Colombia, Argentina, Chile, Perú y Ecuador → el suyo; el resto → español neutro), y en los formatos narrados (`historia`, `crochet`, `esqueleto`, `plastilina`) pide narrador fuera de cámara. Todo en `config.json` → `habla`.
- **Nunca sale mudo sin avisar.** Si un clip que debía hablar vuelve sin audio o en silencio, se dice en esa escena al entregarla (campo `aviso`) y otra vez en los avisos del video. Si ninguna escena tiene voz, es el primer aviso del video.
- Las escenas de foto real y el cierre no hablan (son una foto): llevan subtítulos y música. La voz puede variar un poco de un clip a otro; el trabajador no la «arregla»: se regenera el clip desde el CRM.

### Uniones entre clips que hablan (`config.json` → `armado.habla`)

- **Volumen parejo**: cada clip se mide y se lleva al mismo volumen (−16 LUFS) con una ganancia fija, sin compresión que «bombee». Un clip donde nadie habla nunca se sube.
- **Silencios**: un silencio de más de 0,6 s al inicio o de 0,8 s al final se recorta, dejando un respiro alrededor de la frase. Nunca se corta una palabra: si la duración pedida cortaría la frase, manda la frase y se avisa.
- **Entrada en seco**: al primer clip se le quita todo silencio inicial y no lleva fundido; la música también entra de una. El gancho suena en el primer segundo.
- **Cortes**: fundidos de audio muy cortos (40 ms al entrar, 100 ms al salir) para que no haga «clic».
- **Subtítulos**: salen del texto del guion y empiezan donde empieza la frase de cada escena (se mide dónde arranca el sonido).
- Límite: lo de «dónde está la frase» se mide por silencio. Si el clip trae ruido de ambiente continuo no se distingue, y entonces se respeta la duración pedida y se avisa.

### Música de fondo (`config.json` → `musica`; ver `musica\LEEME.md`)

Por orden: (1) la pista que traiga el trabajo (`opciones.musica`, un enlace); (2) la carpeta **`musica\`**, con una subcarpeta por tono (`suspenso`, `energia`, `emotivo`, `neutro`…), elegida por `opciones.tonoMusica` (o el tono por defecto); (3) opcional y **apagado**, generarla con la cuenta de Kie (`musica.generarConKie`; gasta créditos una vez por tono y la guarda en la carpeta).

- La carpeta viene **vacía**: las pistas las pone el dueño, con licencia para anuncios. Mientras esté vacía, los videos salen sin música y lo avisan; nunca fallan por eso.
- La música va siempre por debajo de la voz (−30 LUFS contra −16) y además baja sola mientras alguien habla. Se repite si es corta y se apaga con un fundido al final.
- La generación por Kie se revisó contra su documentación y se probó con un servidor de mentira, no con la cuenta real: precio, estados de la tarea y licencia de uso están marcados «verificar».

### Fotogramas para el control de calidad

Al entregar el armado, el trabajador manda al CRM 5 fotogramas del video terminado (el primero del primer segundo, el último del cierre con el rótulo) y confirma si quemó subtítulos. Con eso el CRM revisa solo gancho, producto, oferta y subtítulos. `armado.fotogramasFinales` (0 = no mandar).

### Etapa `analisis` (clonar un anuncio)

Recibe un video de referencia que la persona subió al CRM y devuelve su estructura. Solo ffmpeg, sin IA y sin costo:

1. Baja el archivo. Límites: 200 MB y 3 minutos (`config.json` → `analisis`). Si pasa, o no es un video, falla con un motivo que empieza por «no analizable».
2. Detecta los cortes de plano y arma las tomas (hasta 16; si hay más, une las más cortas).
3. Saca un fotograma por toma (del medio) y el audio (MP3 mono), y los sube al CRM, que los guarda en privado y los borra después.
4. **Transcripción**: hoy no hay servicio configurado, así que devuelve `transcripcion: null` con el motivo y la persona escribe lo que se dice. El punto de extensión está en `transcripcion\` (variable `TRANSCRIPCION`); la recomendación y qué clave pediría están al inicio de `transcripcion\index.js`.
5. Borra el original siempre, termine bien o mal.

Quién clasifica cada toma (tipo, encuadre, qué pasa) es el CRM con su IA de visión; el trabajador no describe personas ni lee textos.

## 1. Instalar

1. Instala **Node.js 20 o superior** (https://nodejs.org) y **ffmpeg** (`winget install Gyan.FFmpeg`). Comprueba: `node -v` y `ffmpeg -version`.
2. Copia `.env.ejemplo` como `.env` y llénalo (ver la tabla de abajo).
3. En el CRM (Vercel → Settings → Environment Variables) crea `SERVIDOR_SECRET` con **el mismo valor** que pusiste en el `.env`, y vuelve a desplegar. Sin esa variable el paso «Generar video» del CRM queda deshabilitado y la API responde 503.

| Variable | Para qué |
|---|---|
| `CRM_URL` | Dirección del CRM, sin barra final |
| `SERVIDOR_SECRET` | Secreto compartido con el CRM (igual en los dos lados) |
| `PROVEEDOR` | `simulado` (pruebas, no gasta), `kie` (el recomendado), `veo` o `fal` (alternativas) |
| `PROVEEDOR_IMAGEN` | Quién hace las imágenes base: vacío (lo normal: `simulado` si `PROVEEDOR=simulado`; si no, `kie`), `simulado` o `kie` |
| `KIE_API_KEY` | Clave de Kie (clips con `PROVEEDOR=kie` e imágenes base con Kie) |
| `GEMINI_API_KEY` | Clave de la API de Gemini, para Veo directo (solo con `PROVEEDOR=veo`) |
| `FAL_KEY` | Clave de fal.ai (solo con `PROVEEDOR=fal`) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Opcionales. Voz de ElevenLabs: solo se usa si el trabajo la pide. Vacías = habla siempre el propio clip |
| `TRANSCRIPCION` | Opcional. Servicio de voz a texto para la etapa `analisis`. Vacío = ninguno (hoy no hay ninguno real implementado) |
| `NOMBRE_TRABAJADOR`, `FFMPEG`, `FFPROBE`, `CARPETA_DATOS`, `CARPETA_MUSICA` | Opcionales |

## 2. Probar con el simulado (no gasta)

```powershell
powershell -ExecutionPolicy Bypass -File .\probar.ps1                  # todo, local, sin CRM ni claves
powershell -ExecutionPolicy Bypass -File .\probar.ps1 -Etapa imagenes  # solo el proyecto por escenas, hasta esa etapa
powershell -ExecutionPolicy Bypass -File .\probar.ps1 -Etapa clips     #   (imagenes | clips | armado; armado = recorrido completo)
powershell -ExecutionPolicy Bypass -File .\probar.ps1 -Etapa armado
powershell -ExecutionPolicy Bypass -File .\probar.ps1 -ConCrm          # atiende la cola del CRM una vez
```

La primera corre todas las pruebas: el video completo de siempre (queda en `datos\prueba-local\entregados\`) y el proyecto por escenas con un CRM de mentira que habla el contrato: imágenes → corrección de una imagen → clips → armado → rearmado → cambio de un texto → corrección de un clip → música → voz, en vertical y en horizontal. Los videos quedan en `datos\prueba-etapas\entregados\` y los **fotogramas del cierre** (para mirar que el rótulo y los subtítulos no se pisan) en `..\..\qa-capturas\trabajador-etapas\`. Al final imprime cuánto tardó cada armado en ese equipo.

`-ConCrm` necesita el `.env` con `PROVEEDOR=simulado` (y `PROVEEDOR_IMAGEN` vacío o `simulado`): encola algo en el CRM, córrela, y debe aparecer allá como «Por aprobar».

Para el día de la clave real, dos pruebas que gastan lo mínimo y no tocan el CRM:

```powershell
powershell -ExecutionPolicy Bypass -File .\probar.ps1 -UnaImagen                       # UNA imagen base
powershell -ExecutionPolicy Bypass -File .\probar.ps1 -UnaImagen -Foto "https://…"     #   …con una foto real del producto como referencia
powershell -ExecutionPolicy Bypass -File .\probar.ps1 -UnClip                          # UN clip de 4 s
```

Las dos aceptan `-Prompt "texto"`, escriben los créditos de antes y después, y si se cortan a la mitad retoman la misma tarea al repetirlas (no pagan otra). La imagen queda en `datos\una-imagen\` y el clip en `datos\un-clip\`.

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
- **Audio**: los clips traen el audio de Veo y ese es el que se usa por defecto en todos los formatos (sección 0c).
- **Consumo**: cada tarea devuelve los créditos realmente cobrados; quedan en el CRM (aviso del video) y en `costos.csv` (columna `creditos`).
- **Retención**: Kie guarda los archivos 14 días; el trabajador los descarga apenas terminan.
- **Errores**: Kie puede responder HTTP 200 con un código de error adentro (402 = sin créditos, 429 = límite). El trabajador mira ese código y reporta el motivo.

Qué se verificó contra la documentación de Kie y qué no: al inicio de `proveedores/kie.js`. **No se ha ejecutado con una clave real**; las pruebas locales usan un servidor de mentira que imita su contrato.

La **imagen base** del proyecto por escenas también sale de Kie (sección 0; `config.json` → `kieImagen`). Kie ofrece además música y voz; el trabajador todavía no las usa: la música llega como pista desde el CRM y la voz es ElevenLabs.

## 4b. Alternativa: Veo directo con Google

1. **Clave**: entra a https://aistudio.google.com con la cuenta de Google de la agencia → «Get API key» → «Create API key» (elige o crea un proyecto). Veo es de pago: activa la facturación de ese proyecto. Pega la clave en `GEMINI_API_KEY` del `.env`.
2. Abre `config.json` → `veo` y revisa lo marcado **verificar**: los identificadores de modelo (son «preview» y cambian) y `usdPorSegundo` de cada variante con la tarifa de https://ai.google.dev/gemini-api/docs/pricing (en `null` el costo se reporta solo en segundos).
3. Cambia `PROVEEDOR=veo` y reinicia la tarea. Haz **un** video de prueba y míralo antes de dejarlo solo. Si Google responde 400 por `durationSeconds` o por la imagen, cambia `duracionComoTexto` o `formatoImagen` en `config.json` (son los dos detalles que la documentación no deja claros).

Lo que hay que saber de Veo:

- **Clips cortos**: 4, 6 u 8 segundos por escena, solo en 9:16 o 16:9. Cada escena del guion es un clip; el montaje los une.
- **Variantes**: `estandar`, `rapido` (por defecto) y `lite`. Se elige en `veo.porDefecto`, por formato en `veo.porFormato`, o por trabajo en el campo «Modelo» del CRM (alias o identificador). La variante usada queda en el CRM y en `costos.csv`.
- **Audio**: Veo siempre genera audio y es el que se usa por defecto (sección 0c). En `config.json` → `audio` se pueden poner excepciones por formato:
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

- `datos\registro\costos.csv`: una línea por trabajo con su **etapa** (`completo`, `imagenes`, `clips`, `armado`, `un-clip`, `una-imagen`), las **imágenes** generadas, los **segundos generados**, los **créditos** que cobró el proveedor, los modelos y el costo estimado. Con eso se ve cuánto se va en imágenes y cuánto en video. El armado siempre sale en cero. Si el archivo viene de una versión anterior (otras columnas), el trabajador lo aparta como `costos-hasta-<fecha>.csv` y empieza uno nuevo.
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
- Un solo proceso del trabajador por carpeta (lleva varios trabajos a la vez por dentro; ver la sección 0b). Los límites de paralelismo y la caché viven en ese proceso: no se deben correr dos trabajadores sobre la misma carpeta `datos\`.
- Rótulo de cierre: el ancho del texto se calcula con las medidas de Arial Bold (no hay librería de fuentes). Con otra fuente en `rotulo.fuente` el ajuste es aproximado: mira un fotograma antes de dejarla.
- Fotos reales: PNG con fondo transparente salen con el fondo negro (conviene JPG o PNG con fondo). De un GIF o WebP animado se usa el primer cuadro.
- En el armado, un clip rehecho debe llegar con otra dirección o con otro número de intento; si no, se usa el que ya estaba descargado (ver el contrato, «Cambios», punto 3).
- Si con el audio del clip se recorta una escena, puede cortarse la frase: el resultado lo avisa y se arregla subiendo la duración de esa escena y volviendo a armar (gratis).

Contrato de la API con el CRM: `src/lib/servidor-api.ts` en el repositorio del CRM y, para el proyecto por escenas, `..\CONTRATO-PROYECTO-VIDEO.md`.
