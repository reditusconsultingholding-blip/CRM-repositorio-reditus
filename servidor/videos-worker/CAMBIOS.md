# Cambios desde la versión del 12-oct (la que ya está copiada en el servidor)

Para actualizar el servidor: reemplaza la carpeta `videos-worker` completa **menos** `.env` y `datos\`. Luego agrega `KIE_API_KEY` al `.env`, pon `PROVEEDOR=kie` y reinicia la tarea «Reditus - Trabajador de videos».

## Nuevo
- `proveedores/kie.js`: proveedor **Kie** (kie.ai), ahora el recomendado. `PROVEEDOR=simulado|kie|veo|fal`.
- `config.json` → sección `kie` (variantes rapido/lite/calidad, modo de la foto del producto, resolución, valor del crédito).
- `.env.ejemplo`: variable `KIE_API_KEY` con los pasos para obtenerla.
- Prueba de un solo clip: `.\probar.ps1 -UnClip` (o `node trabajador.js --un-clip "texto"`). Una escena de 4 s, solo texto, sin CRM.
- `pruebas/pruebas.js`: servidor de mentira que imita el contrato de Kie (crear, consultar, descargar, retomar, error 402, un clip).

## Cambiado
- `lib/trabajo.js`: suma los créditos que reporta el proveedor y los manda al CRM como aviso; función `unClip`.
- `datos\registro\costos.csv`: columna nueva al final, `creditos`. Si el archivo ya existe en el servidor conserva el encabezado viejo: bórralo o renómbralo para que se cree con el nuevo.
- `lib/entorno.js`: lee `KIE_API_KEY` y la tacha en el registro.
- `trabajador.js`: modo `--un-clip` (no exige `CRM_URL` ni `SERVIDOR_SECRET`).
- `probar.ps1`: parámetros `-UnClip` y `-Prompt`.
- `README.md`: sección de Kie; Veo directo y fal quedan como alternativas.

## Sin cambios
- El CRM y su API. `proveedores/veo.js`, `fal.js` y `simulado.js`. `instalar-servicio.ps1`.

## Siguiente paso (no implementado)
Kie también genera imagen, música y voz. Lo que haría falta para usarlo:
- **Imagen base** (personaje o escena con el producto antes de imagen a video; lo piden casi todos los formatos): elegir el modelo de imagen de Kie y verificar su contrato; un paso previo en `lib/trabajo.js` que la genere y la guarde; que el CRM mande el prompt de «Imagen base» del formato (hoy solo manda las «Escena…»); y **aprobación de esa imagen en el CRM antes de gastar en video**, por la regla del dueño.
- **Música** (formato «música» y fondo de los demás): modelo de música de Kie, el prompt «Canción» del formato desde el CRM, y mezcla a bajo volumen en el montaje.
- **Voz**: hoy es ElevenLabs directo; si se quiere una sola factura, un `lib/voz` alternativo contra Kie.
- **Subida de archivos a Kie**: solo si las fotos del producto dejaran de ser enlaces públicos.
