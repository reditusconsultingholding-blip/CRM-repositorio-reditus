# Formatos de video de Reditus

Esta carpeta es la biblioteca de formatos que usa la sección **Crear video** del CRM. Cada formato es un archivo de texto (`formatos/<nombre>.md`) que una persona puede leer y cambiar. No hace falta ninguna herramienta especial: se edita el archivo, se corre un comando y se sube el cambio.

Dentro del repositorio del CRM vive en `formatos-video/`.

## Qué hay aquí

| Archivo | Para qué sirve |
|---|---|
| `formatos/<nombre>.md` | Un formato: qué es, cuándo usarlo, sus 5 pasos, la plantilla del guion y los prompts por escena |
| `REGLAS_COMUNES.md` | Lo que cumplen todos los formatos: los 5 pasos, el producto real en pantalla y el cierre con oferta y llamado a la acción |
| `MODELOS-KIE.md` | Qué modelo se usa para cada cosa y qué recibe el servidor de videos |
| `METODO-CLONACION.md` | Cómo se arma un video siguiendo la estructura de un anuncio ganador |
| `construir.cjs` | Revisa que los formatos estén completos y genera `formatos/index.json` |
| `formatos/index.json` | Lo genera el comando. **No se edita a mano** |

## Los formatos

| Formato | Estado |
|---|---|
| UGC · Entrevista en la calle · Podcast · Historia · Claymation (plastilina) · Crochet · Esqueleto · Objeto parlante · Animación 3D · Explicativo 3D · Música (jingle) · Historia musical | confirmado |
| Pizza · Usos del producto | por confirmar: el archivo trae una interpretación de trabajo, marcada así en pantalla |

## Cambiar un formato

1. Abre `formatos/<nombre>.md` con cualquier editor de texto.
2. Cambia lo que necesites. Respeta los títulos que empiezan con `##`: el CRM los busca por su nombre.
3. En la carpeta del CRM, corre:

   ```
   node scripts/sincronizar-video-formatos.mjs
   ```

   El comando revisa todos los formatos. Si algo falta, **no cambia nada** y dice en español qué archivo y qué le falta. Si todo está bien, actualiza lo que lee el CRM (`src/lib/video-formatos/formatos.json`).
4. Sube el cambio al repositorio como cualquier otro (los `.md`, `formatos/index.json` y `src/lib/video-formatos/formatos.json`). Al publicarse el CRM, el formato ya aparece cambiado en Crear video.

## Agregar un formato nuevo

1. Copia un formato parecido dentro de `formatos/` y ponle un nombre en minúsculas, sin tildes y con guiones: `mi-formato.md`.
2. Arriba, entre las dos líneas `---`, cambia los datos. `slug` debe ser igual al nombre del archivo (sin `.md`).
3. Reescribe cada sección. Corre el comando del paso 3 de arriba y corrige lo que te indique.

### Lo que el comando exige a todo formato

- **Datos de arriba:** `slug`, `nombre`, `estado` (`confirmado` o `por confirmar`), `para_que_sirve`, `duracion`, `relacion_aspecto`, `necesita`, `producto_en_pantalla`, `cierre`, `riesgos`, `modelo_imagen`, `modelo_video`, `modelo_voz`, `modelo_musica`, `duracion_clip`, `audio_del_clip`.
  Las listas van en una sola línea, entre corchetes y separadas por comas: `[foto del producto, oferta]`. Un elemento no puede llevar comas por dentro.
- **Secciones**, con estos títulos exactos: `## Qué es`, `## Cuándo usarlo`, `## Cuándo no`, `## Estructura escena por escena`, `## Reglas visuales`, `## Plantilla de guion`, `## Prompts para modelo de video`.
- **Los 5 pasos**, en la tabla y en este orden: Impacto, Bajada, Refuerzo, Subida, CTA. En la plantilla cada uno va rotulado: `PASO 1 · IMPACTO (…)` … `PASO 5 · CTA (…)`.
- **Producto real en pantalla:** la plantilla lleva la línea `PRODUCTO EN PANTALLA` y al menos un prompt usa la «foto real» del producto.
- **Cierre obligatorio (paso 5):** dura 5 segundos o más; en la tabla nombra la oferta, el llamado a la acción y el producto real; la plantilla trae las líneas `OFERTA EN VOZ Y EN PANTALLA: {{oferta}}`, `LLAMADO A LA ACCIÓN: {{llamado}}` y `CIERRE: {{producto}} …`; y hay un prompt llamado `Cierre · …`.
- **Sin nombres de terceros:** ni el nombre del formato, ni la plantilla, ni los prompts pueden nombrar estudios, creadores o personajes conocidos. El estilo se describe con sus rasgos.

### Las palabras entre llaves

En la plantilla y en los prompts, `{{producto}}`, `{{pais}}`, `{{cliente}}`, `{{oferta}}`, `{{llamado}}`, `{{beneficio}}` y `{{dolor}}` se reemplazan solos con lo que se escribe en Crear video. Lo que va entre `[corchetes]` es un dato que una persona debe completar con información real del cliente: nunca se inventan precios, cifras, testimonios ni resultados.

### De dónde sale cada regla

Al lado de cada regla va su fuente: `[base §N]` y `[método §N]` son la base de conocimiento de Reditus (las clases de Antonio); `[colega: …]` son las skills que compartió el colega del dueño; `[regla de Reditus]` es una decisión propia; `[propuesta]` es una idea sin fuente que se valida probando. El contenido está escrito con palabras propias: no se pegan textos del curso.

## Comandos

```
node scripts/sincronizar-video-formatos.mjs            # desde la carpeta del CRM: revisa, genera y copia
node scripts/sincronizar-video-formatos.mjs <carpeta>  # igual, con la biblioteca en otra carpeta
node formatos-video/construir.cjs --revisar            # solo revisa, sin escribir nada
```

No necesitan instalar nada aparte de Node, que el CRM ya usa.
