# Cambios propuestos · anuncios longevos, octubre de 2026

Nada de esta carpeta toca los archivos vivos. Aquí está lo que se propone y cómo aplicarlo. Sin commit.

**Regla que siguen todos:** la estructura del dueño no cambia. Lo que se propone son detalles que la afinan. Lo que la contradice quedó aparte, en «Observado, no adoptado» (`APRENDIZAJES.md`).

## Qué hay

| Archivo | Qué es |
|---|---|
| `APRENDIZAJES.md` | 23 ajustes generales y los ajustes por formato, cada uno con su evidencia. Lo primero que conviene leer. |
| `ganchos.v2.propuesta.json` | El banco de ganchos completo en versión 2. Pasa la revisión de `construir-ganchos.cjs`. |
| `ganchos.patch` | Lo mismo como parche sobre `formatos-video/ganchos/ganchos.json`. |
| `REGLAS_COMUNES.propuesto.md` | `REGLAS_COMUNES.md` completo con los añadidos. |
| `REGLAS_COMUNES.patch` | Lo mismo como parche. Solo añade líneas; no borra ni reescribe ninguna. |

## Banco de ganchos: de v1 a v2

- **Los 12 ganchos de v1 siguen igual.** Sus prompts, frases y transiciones no se tocan.
- **Cada gancho gana `observado`**: cuántas veces se vio en los 36 anuncios, y una nota.
- **Cada gancho gana `ajuste`**: una variante vista, o vacío. Es texto para quien dirige; el código no lo usa.
- **3 ganchos nuevos:** `ya-en-marcha` (15 de 36), `prueba-rara` (4 de 36), `responde-comentario` (3 de 36).
- **4 reglas nuevas** al final de `reglas`. Las 3 de v1 quedan intactas, incluida «el golpe dura 1 segundo y lo siguen tres tomas de menos de 1 segundo».
- **Bloque nuevo `observacion`**: fecha, tamaño de la muestra y lo no adoptado.

Veces que se vio cada gancho:

| Gancho | Visto |
|---|---|
| `ya-en-marcha` (nuevo) | 15 de 36 |
| `prueba-rara` (nuevo) | 4 de 36 |
| `pantalla-partida` | 3 de 36 |
| `destape` | 3 de 36 |
| `cifra-real` | 3 de 36 |
| `pregunta-tres-palabras` | 3 de 36 |
| `responde-comentario` (nuevo) | 3 de 36 |
| `pov-situacion` | 2 de 36 |
| `texto-contradice` | 2 de 36 |
| `reaccion` | 2 de 36 |
| `cambio-de-mundo` | 1 de 36 |
| `asmr-fuerte` | 1 de 36 |
| `objeto-cae`, `mano-atrapa`, `tapado-de-camara` | 0 de 36 |

Los tres con 0 se conservan: son el golpe visual tipo clip viral que definió el dueño, y que no aparezcan entre anuncios longevos de Meta no los descarta.

### Dos cosas a saber antes de aplicar

1. **Cambia qué gancho se elige.** `elegirGanchos` puntúa por las `palabras` de cada gancho. Con 3 ganchos nuevos, algunos productos (cepillos, fajas, aspiradoras, plantillas, limpieza) recibirán `ya-en-marcha` o `prueba-rara` donde antes recibían otro. Los proyectos ya creados conservan el suyo.
2. **`responde-comentario` necesita una objeción real.** Su riesgo lo dice: la objeción la da el cliente o sale de sus reseñas. Si la app no tiene ese dato, conviene dejarlo fuera de la elección automática y ofrecerlo solo a mano.

### Cómo aplicar

```
git apply formatos-video/investigacion/2026-10-anuncios-ganadores/ganchos.patch
node formatos-video/ganchos/construir-ganchos.cjs
```

El segundo comando valida y copia el banco a `src/lib/video-formatos/ganchos.json`. Para aplicar solo una parte, copiar a mano del archivo `.propuesta.json`.

## Reglas comunes

Añadidos, todos marcados con `[ganadores oct-2026 · n de 36]`:

- **Cómo leer las citas:** una línea que explica la marca nueva.
- **1a. Detalles de la apertura** (sección nueva, entre la 1 y la 1b): 5 detalles.
- **1b. Cierre:** 4 detalles al final de la sección.
- **2. Guion:** 3 detalles.
- **4. Edición:** 5 detalles (ritmo del cuerpo, subtítulos, título de apoyo, nivel de voz y música, duración por categoría).
- **6. Observado y NO adoptado** (sección nueva al final): la lista con sus conteos.

### Cómo aplicar

```
git apply formatos-video/investigacion/2026-10-anuncios-ganadores/REGLAS_COMUNES.patch
```

Los dos parches se comprobaron con `git apply --check` el 13-oct-2026. Si `REGLAS_COMUNES.md` o `ganchos.json` cambian antes, puede que haya que aplicarlos a mano.

## Lo que no se propone

- Ningún cambio en `servidor/CONTRATO-PROYECTO-VIDEO.md`, ni en el trabajador, ni en `formatos/*.md`.
- Ningún cambio al estilo de subtítulos por defecto. Queda como decisión abierta en `APRENDIZAJES.md`.
- Ninguna regla de música: no se pudo oír el audio.
