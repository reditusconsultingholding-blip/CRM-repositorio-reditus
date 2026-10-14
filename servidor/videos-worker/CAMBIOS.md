# Cambios del 19-oct: títulos de apoyo y voz automática por país

- **Títulos de apoyo** (`lib/titulos.js`, nuevo): frase corta arriba y centrada, distinta de los subtítulos. `escena.tituloApoyo`, `opciones.estiloTitulos` (`caja`, `subrayado`, `etiqueta`). No van en el cierre. Con Captions se pintan después.
- **Voz de ElevenLabs automática por país** (`lib/voces.js`, nuevo): con `ELEVENLABS_API_KEY` basta; `ELEVENLABS_VOICE_ID` ya no es obligatorio. La elegida queda en `datos/voces.json` y el video la avisa («Voz: …»). `.\probar.ps1 -Voces ES` lista 5 candidatas con su muestra; `-Fijar <id>` fija otra.
- El armado con narración solo falla si falta la clave o ElevenLabs la rechaza.
- Lo que devuelve Captions se guarda aparte: cambiar un título no lo manda (ni lo paga) de nuevo.
- El primer armado de cada proyecto vuelve a codificar sus escenas una vez.

# Cambios del 16-oct: cierre de calidad, narración, plantillas de subtítulos y transiciones

## Pasos para actualizar el servidor

1. Detén la tarea «Reditus - Trabajador de videos».
2. Copia la carpeta nueva encima de la que hay **sin tocar** `.env`, `datos\` ni `musica\`. Hay una carpeta nueva, **`fuentes\`** (tipografías): cópiala entera.
3. `config.json`: guarda el del servidor como `config.anterior.json`, pon el nuevo y vuelve a escribir a mano lo que se le hubiera cambiado (por ejemplo `kie.usdPorCredito`). Secciones nuevas: `armado.dinamismo`, `voz` (cambió entera), `subtitulos` (nota nueva). `rotulo` ya no existe.
4. `.env`: `PROVEEDOR=kie` y `KIE_API_KEY` se quedan como están. Para la narración, llena `ELEVENLABS_API_KEY` (dónde se saca: `.env.ejemplo`). El ID de voz ya no es obligatorio.
5. Comprueba: `powershell -ExecutionPolicy Bypass -File .\probar.ps1` (debe terminar en «TODO OK»; no gasta).
6. Arranca la tarea.

El primer armado de cada proyecto vuelve a codificar sus escenas una vez (cambió la edición).

## Alineado con el CRM (17 y 18-oct) y añadidos del mismo paquete

- **Apertura en cortes** como la manda el CRM (`escena.cortes` + `duracionClip`); la forma `apertura` del trabajo sigue valiendo.
- **Estilos** del CRM: `palabra` → karaoke, `caja` → titular. **Ritmos**: `muy-rapido`, `rapido`, `medio`, `calmado`.
- **`escena.transicion`** (incluye `fundido`, también para el cierre) y **`escena.golpesVisuales`**.
- **Urgencia** como línea entre el detalle y el botón (antes era una etiqueta arriba).
- **Narración sin clave**: el armado falla con el motivo (antes seguía con el audio del clip).
- **Fotogramas de control**: 6 (dos de los primeros 3 s y uno del cierre).
- **Transiciones más dinámicas**, acelerones y **cortes al golpe de la música** (`lib/efectos.js`).
- **Subtítulos con la API de Captions**, opcional (`lib/captions.js`, nuevo; variable `CAPTIONS_API_KEY`; `.\probar.ps1 -PlantillasCaptions`).

## Qué cambió

- **Tarjeta de cierre** nueva (`lib/rotulo.js`, reescrito): fondo desenfocado, producto grande con sombra, titular, detalle, etiqueta de urgencia opcional y botón del color de la marca, con entrada de 0,6 s. Sin subtítulo encima.
- **Narración con ElevenLabs** (`lib/voz.js`, reescrito): una voz para todo el video, tiempos reales por palabra, cifras dichas bien, la escena dura lo que su frase, ambiente del clip por debajo. Sin clave, sigue con la voz del clip.
- **Subtítulos**: cinco plantillas con tipografías propias (`lib/subtitulos.js`, reescrito; carpeta `fuentes/` nueva). Resaltado con el color de la marca.
- **Transiciones, micro-zoom, golpes de sonido y apertura rápida** (`lib/efectos.js`, nuevo).
- `lib/armado.js` reescrito para todo lo anterior. `lib/etapas.js`, `proveedores/kie.js` y `veo.js`: con narración los clips se piden sin diálogo.
- `pruebas/muestras.js` (nuevo): muestras con clips de verdad. `pruebas/etapas.js`: pruebas de todo lo nuevo.

## Sin probar con servicios reales

- **ElevenLabs** (voz, acento, tiempos por palabra, costo): solo contra un servidor de mentira. Hace falta la clave.
- Clips reales pedidos «sin diálogo» a Kie.
- Las transiciones y plantillas sí se vieron sobre clips reales (los de Ceryon), en el equipo de desarrollo.

---

# Cambios del 14-oct: habla el clip, uniones, música por tono y análisis de referencia

Se monta encima de las versiones de abajo. El acuerdo con el CRM está en `..\CONTRATO-PROYECTO-VIDEO.md` (secciones del 14-oct).

## Pasos para actualizar el servidor

1. Detén la tarea «Reditus - Trabajador de videos».
2. Reemplaza la carpeta `videos-worker` por la nueva **menos** `.env`, `datos\` y **`musica\`** (nueva: si ya le pusiste pistas, no la pises; si no existe, cópiala tal cual, trae solo un LEEME).
3. `config.json` se reemplaza por el nuevo. Si le habías cambiado algo a mano, vuelve a ponerlo. Cambió: `audio` (todo con el audio del clip), secciones nuevas `habla`, `armado.habla`, `analisis`, y `musica` con otros campos. `kie.instruccionVoz` ya no existe.
4. `.env`: nada obligatorio. Las de ElevenLabs pueden quedar vacías. Variables nuevas opcionales: `CARPETA_MUSICA`, `TRANSCRIPCION`.
5. **Música**: mete pistas con licencia en `musica\suspenso\`, `musica\energia\`, `musica\emotivo\` y `musica\neutro\` (ver `musica\LEEME.md`). Mientras estén vacías, los videos salen sin música y lo avisan.
6. Comprueba: `powershell -ExecutionPolicy Bypass -File .\probar.ps1` (debe terminar en «TODO OK»).
7. Arranca la tarea.

El primer armado de cada proyecto tras actualizar vuelve a codificar sus escenas una vez (cambió la forma de tratar el audio).

## Qué cambió

- **Voz**: por defecto habla el propio clip en todos los formatos. ElevenLabs solo si el trabajo lo pide y hay clave; si no hay clave, se usa el audio del clip y se avisa. Un clip con frase que vuelve sin audio se avisa en la escena (`aviso`) y en el video. `lib/habla.js` (nuevo), `config.json` → `audio` y `habla`.
- **Acento e idioma**: salen del trabajo (`contexto.voz`); si el CRM ya trae su bloque «AUDIO» en el prompt, no se agrega nada; si no llega nada, se decide por país. Narrador fuera de cámara en los formatos narrados o cuando la escena lo dice (`locucion`).
- **Uniones**: volumen parejo entre clips (−16 LUFS), recorte de silencios largos sin cortar palabras, fundidos cortos en los cortes, subtítulos que empiezan donde empieza la frase, y entrada en seco del primer clip. `lib/armado.js`, `lib/ffmpeg.js` (medición de audio), `config.json` → `armado.habla`.
- **Música**: carpeta `musica\` por tono, elegida con `opciones.tonoMusica`; nivelada por debajo de la voz; sin pista disponible el video sale sin música y lo dice. Generación por Kie preparada y apagada. `lib/musica.js` (nuevo), `musica\LEEME.md` (nuevo).
- **Control de calidad**: el armado manda 5 fotogramas del video terminado y confirma los subtítulos.
- **Etapa `analisis`**: desarma un video de referencia (cortes de plano, un fotograma por toma, audio) y borra el original. Transcripción: punto de extensión en `transcripcion\` (nuevo), sin servicio real. `lib/analisis.js` (nuevo).
- `lib/red.js`: descarga con tope de tamaño. `lib/etapas.js`: etapa nueva y avisos por escena. `proveedores/kie.js` y `veo.js`: la instrucción de voz sale de `lib/habla.js`.

## Sin probar con servicios reales

- Que Veo (por Kie) diga la frase con el acento pedido y mantenga la voz entre clips.
- El recorte de silencios con audio real de Veo: se probó con tonos; con ruido de ambiente continuo no se distingue dónde acaba la frase (se avisa).
- La generación de música por Kie (precio, estados de la tarea, licencia).
- Ningún servicio de transcripción.
- El CRM real: las pruebas usan uno de mentira escrito contra el contrato.

---

# Cambios del 13-oct: volumen (varios trabajos a la vez)

Se monta encima de la versión «proyecto por escenas» de abajo. Para actualizar: mismos pasos de la sección «Cómo actualizar el servidor»; `.env` no cambia. `config.json` trae la sección nueva `paralelo` y `diasParaBorrarCache`.

- **Paralelismo con límites** (`config.json` → `paralelo`): 3 trabajos a la vez, 4 imágenes y 3 clips contra el proveedor, armados según los núcleos (2 con 8 o más). ffmpeg corre con prioridad baja y con los hilos acotados: entre todos los armados usan como mucho la mitad de los núcleos. Archivos: `lib/limites.js` (nuevo), `lib/cola.js` (nuevo), `lib/ffmpeg.js`, `lib/etapas.js`, `trabajador.js`.
- **Turnos justos**: armados y correcciones (una escena) pasan primero; entre iguales se alterna por proyecto.
- **429 de Kie**: freno compartido con espera creciente y tope; también al crear (un 429 no crea nada), sin perder la tarea ya creada (`proveedores/kie.js`).
- **Caché compartida** entre proyectos en `datos\cache\` (antes era por proyecto): las variaciones no bajan ni codifican otra vez lo que comparten. La caché vieja de cada proyecto en `datos\proyectos\` queda sin uso y se borra sola a los 30 días; el primer armado de cada proyecto tras actualizar vuelve a bajar y codificar una vez.
- **Tope de gasto** por trabajo: campo opcional `gastoMaximoCreditos`.
- **Medición**: `datos\registro\tiempos.csv` (turno, cola del proveedor, generación, subida, armado, total). Estimación de capacidad en el README, sección 0b.
- El cierre de etapa espera hasta 150 s la respuesta del CRM (allá ahora se revisan las imágenes antes de contestar).
- Pruebas: 8 trabajos mezclados con hasta 6 a la vez, corrección que se adelanta, 429 simulado, tope de gasto y tres variaciones (`pruebas/etapas.js`).
- **Sin probar**: nada de esto ha corrido contra Kie real ni en el servidor; los límites de peticiones de la cuenta de Kie no se conocen.

---

# Cambios desde la versión con Kie del 12-oct (la que ya está copiada en el servidor)

**Qué trae:** el video como **proyecto por escenas**, en tres etapas: imágenes base que una persona aprueba → clips solo de lo aprobado → armado en el servidor sin costo. Una corrección rehace solo la escena tocada. Además: escenas con la **foto real** del producto animada (costo cero), **rótulo de cierre** con la oferta y el llamado a la acción, y **música**. Los trabajos de antes (un pedido = un video completo) siguen funcionando igual.

El acuerdo con el CRM está en `..\CONTRATO-PROYECTO-VIDEO.md`.

## Cómo actualizar el servidor (sin perder `.env` ni `datos\`)

1. Detén la tarea: `Stop-ScheduledTask -TaskName "Reditus - Trabajador de videos"`. Si hay un trabajo a medias no pasa nada: queda en `datos\trabajos\` y se retoma al arrancar.
2. Reemplaza el contenido de la carpeta `videos-worker` por el nuevo **menos** `.env` y `datos\` (esos dos no se tocan). Hay una carpeta nueva, `proveedores-imagen\`, y archivos nuevos en `lib\` y `pruebas\`: cópialos todos.
3. `config.json` se reemplaza por el nuevo. Si en el servidor le habías cambiado algo (por ejemplo `kie.usdPorCredito`), vuelve a ponerlo a mano en el nuevo: trae secciones que el viejo no tiene (`armado`, `rotulo`, `musica`, `kieImagen`, `diasParaBorrarProyectos`).
4. `.env`: no hace falta tocarlo. Con `PROVEEDOR=kie` las imágenes base salen de Kie con la misma `KIE_API_KEY`. Solo si quieres otra cosa, agrega `PROVEEDOR_IMAGEN` (ver `.env.ejemplo`).
5. Comprueba sin gastar: `powershell -ExecutionPolicy Bypass -File .\probar.ps1` (debe terminar en «TODO OK»).
6. El día de la clave real, antes de dejarlo solo: `.\probar.ps1 -UnaImagen` (una imagen) y `.\probar.ps1 -UnClip` (un clip). Mira el resultado y los créditos que cobró cada una.
7. Arranca la tarea: `Start-ScheduledTask -TaskName "Reditus - Trabajador de videos"`.

`datos\registro\costos.csv` cambia de columnas: el trabajador aparta solo el archivo viejo como `costos-hasta-<fecha>.csv` y empieza uno nuevo. No hay que borrar nada.

## Nuevo

- `lib/etapas.js`: atiende los trabajos con `etapa` (`imagenes`, `clips`, `armado`). Reporta cada escena por `progreso` en cuanto está; el fallo de una escena no tumba a las demás; retoma tras un reinicio sin volver a pedir ni a reportar lo hecho. También la prueba de una sola imagen.
- `lib/armado.js`: el armado. Descarga solo lo que falta, codifica cada escena una vez (con sus subtítulos y, en el cierre, el rótulo), une sin recodificar y mezcla la música recodificando solo el audio. Mismo proyecto → mismo archivo.
- `lib/rotulo.js`: diseño del cierre (oferta + botón de llamado a la acción) y reparto del cuadro para que el rótulo, el producto y los subtítulos no se pisen, en vertical y en horizontal.
- `lib/proyecto.js`: carpeta de cada proyecto (`datos\proyectos\<guion>-v<versión>\`): caché del armado y memoria de las tareas pagas pendientes.
- `proveedores-imagen/`: proveedores de imagen intercambiables. `simulado` (imagen de prueba con ffmpeg) y `kie` (GPT Image 2.5 Sunburst por defecto; Nano Banana 2 y Pro como alternativas en `config.json`).
- `pruebas/etapas.js`: CRM de mentira que habla el contrato y recorre todo el proyecto (vertical y horizontal), revisa el MP4 con ffprobe y deja fotogramas del cierre en `<repo>\qa-capturas\trabajador-etapas\`.
- `config.json`: secciones `armado`, `rotulo`, `musica`, `kieImagen` y `diasParaBorrarProyectos`.
- `.env.ejemplo`: variable `PROVEEDOR_IMAGEN` (opcional).
- `probar.ps1`: `-Etapa imagenes|clips|armado` (proyecto por escenas con el simulado), `-UnaImagen` y `-Foto` (una imagen real, gastando lo mínimo).
- `trabajador.js`: modo `--una-imagen ["texto"] [--foto https://…]`.

## Cambiado

- `lib/trabajo.js`: si el trabajo trae `etapa`, lo pasa a `lib/etapas.js`; si no, hace lo de siempre. La limpieza periódica también borra proyectos sin uso.
- `lib/crm.js`: `subir` (URL firmada por tipo: `imagen`, `clip`, `final`) y `cerrar` (cierra una etapa). `entregar` sigue igual para los trabajos de antes.
- `datos\registro\costos.csv`: columnas nuevas `etapa` e `imagenes` (ahora: fecha, trabajo, guion, version, formato, etapa, proveedor, modelos, resultado, segundos_video, imagenes, segundos_generados, costo_estimado_usd, creditos).
- `proveedores/kie.js`: en la etapa `clips` la imagen aprobada va siempre como primer fotograma, aunque `kie.modoImagen` diga `referencia`. Expone su llamada a la API para que la use el proveedor de imagen.
- `lib/subtitulos.js`: admite estilos y eventos extra en el mismo archivo (el rótulo). Los subtítulos no cambian.
- `lib/ffmpeg.js`: lectura de ancho y alto. `lib/registro.js`: tacha también las firmas de los enlaces de subida.
- `lib/entorno.js`: lee `PROVEEDOR_IMAGEN` y crea `datos\proyectos\`.
- `README.md`: sección 0 «Proyecto por escenas», pruebas nuevas, costos por etapa.

## Sin cambios

- `proveedores/veo.js`, `fal.js` y `simulado.js`. `lib/voz.js` (ElevenLabs). `instalar-servicio.ps1`. Los trabajos sin `etapa`.

## Por verificar con la clave real (nada de esto se pudo probar sin gastar)

- **Imagen por Kie**: el precio en créditos (la documentación no lo publica), que las fotos del producto sirvan como enlace público, que 1K alcance y que respete 9:16 con fotos de referencia. Todo está en `config.json` → `kieImagen`, marcado «verificar».
- **Imagen a video por Kie**: que el clip arranque en la imagen aprobada y conserve el producto.
- **Voz en foto-real y cierre** con ElevenLabs real (se probó con un servidor de mentira).
- **El CRM real**: las pruebas usan uno de mentira escrito contra el mismo contrato.

## Siguiente paso (no implementado)

- **Música generada** (Suno por Kie): hoy la pista llega como enlace desde el CRM.
- **Voz por Kie** en vez de ElevenLabs directo, si se quiere una sola factura.
- **Subida de fotos a Kie**: solo si las fotos del producto dejaran de ser enlaces públicos o si Nano Banana no acepta enlaces externos.
