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
