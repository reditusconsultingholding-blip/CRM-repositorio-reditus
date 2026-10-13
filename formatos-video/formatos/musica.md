---
slug: musica
nombre: Música (jingle)
estado: confirmado
confianza: alta. Confirmado con la skill del colega; la base de Antonio solo lo nombra.
para_que_sirve: El anuncio es una canción original corta que vende el resultado para el cliente. La parte visual se toma prestada de otro formato animado.
duracion: 15, 30 o 60 s
relacion_aspecto: "9:16"
etapa_embudo: TOFU
necesita: [enlace del producto, país e idioma, precio u oferta (o pedir que no aparezca), género musical (uno o dos), duración elegida, foto real del envase]
producto_en_pantalla: Paso 4 · Subida (coro): el producto real en mano o en uso mientras se canta su nombre; primer plano en el paso 5
cierre: Paso 5 obligatorio (mínimo 5 s): el cierre corta el estilo del video y muestra el producto real con la oferta en texto grande; la voz dice la oferta y el llamado a la acción
riesgos: [coro que solo repite «cómpralo», letra que promete resultados, mezclar letra y estilo en el mismo texto, imitar a un artista o una canción existente, tomas reales complejas]
modelo_imagen: el del formato visual que se elija (claymation · crochet · objeto parlante · esqueleto · explicativo 3D)
modelo_video: el del formato visual que se elija; clips sin audio
modelo_voz: Suno (la voz cantada sale con la canción)
modelo_musica: Suno · canción original con letra
duracion_clip: según el formato visual; un corte por línea de la letra
audio_del_clip: sin audio; la canción es el único sonido
fuentes: [skills del colega · anuncios-musicales, método §7, base §1]
---

## Qué es

Micro-video musical: una canción propia, con verso y coro que riman, hecha para el producto [colega: anuncios-musicales]. Este formato define **la canción** (concepto, letra y descripción del estilo musical) y una idea visual general; las tomas se producen con las reglas de otro formato animado, al que se le entrega la letra como guion.

Se preparan dos o tres propuestas de canción realmente distintas, y se recomienda una [colega: anuncios-musicales].

## Cuándo usarlo

- Productos de impulso y marcas con tono alegre [propuesta].
- Con un género del país del comprador en lugar de un trend genérico [base §1].
- Como variación de un guion ganador [propuesta].

## Cuándo no

- Temas de salud delicados o marcas sobrias [propuesta].
- Nunca sobre la melodía o la letra de una canción existente [base §1].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–5 s | Impacto | El gancho cantado, dentro de los primeros cinco segundos | [colega: anuncios-musicales] |
| 5–11 s | Bajada | Primer verso: la situación y su consecuencia | [colega: anuncios-musicales][método §3.2] |
| 11–15 s | Refuerzo | Segundo verso o puente: lo que no funcionó (en 60 s, aquí va el giro) | [colega: anuncios-musicales] |
| 15–24 s | Subida | Coro: el resultado para el cliente y el producto en pantalla | [colega: anuncios-musicales][método §7] |
| 24–30 s | CTA | Remate con la oferta local. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [base §1][regla de Reditus] |

Tiempos para la versión de 30 s. En 15 s solo caben gancho y un coro; en 60 s, canción completa con puente [colega: anuncios-musicales].

## Reglas visuales

- Líneas cortas (de 4 a 8 sílabas) y con rima de verdad [colega: anuncios-musicales].
- La letra vende el resultado, no repite la marca; el vocabulario va con el género [colega: anuncios-musicales].
- La descripción del estilo musical va aparte de la letra, es breve (género, tipo de voz, tempo, ánimo, producción) y se escribe en inglés [colega: anuncios-musicales].
- La idea visual tiene que ser producible: animación u objetos estilizados, atados a momentos de la letra [colega: anuncios-musicales].
- Un corte por línea; el nombre del producto aparece escrito cuando se canta [propuesta].
- Letra en pantalla, limpia y en una línea [método §8].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus]. En este formato el cierre tiende a diluirse: se corta el estilo y se pasa a la toma real.

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Música (jingle) 9:16 | DURACIÓN: 30 s | CLIENTE: {{cliente}}
GÉNERO: [género popular en {{pais}}] · FORMATO VISUAL: [claymation / crochet / objeto parlante / esqueleto / explicativo 3D]

PASO 1 · IMPACTO · GANCHO (0–5 s): "[Línea que rime sobre {{dolor}}]"
PASO 2 · BAJADA · VERSO 1 (5–11 s): "[Situación y consecuencia, dos o tres líneas cortas]"
PASO 3 · REFUERZO · VERSO 2 (11–15 s): "[Lo que probó y no sirvió]"
PASO 4 · SUBIDA · CORO (15–24 s): "[{{beneficio}}, en líneas fáciles de repetir, con {{producto}}]"
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA · REMATE (24–30 s): "{{oferta}}."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

ESTILO MUSICAL (en inglés, breve): [género, tipo de voz, tempo, ánimo, producción]
```

## Prompts para modelo de video

### Canción

```text
LETRA: [pegar la letra aprobada, con sus partes marcadas].
ESTILO (aparte, en inglés): [género de {{pais}}], [voz femenina/masculina], [tempo], [ánimo], [producción].
Canción original. No imitar a ningún artista ni canción existente.
```

### Toma por línea (según el formato visual elegido)

```text
IMAGEN: [personaje u objeto estilizado del formato visual, descripción completa] en [la escena de esta línea de la letra].
MOVIMIENTO: una acción corta al compás.
DURACIÓN: 3 s · 9:16 · sin audio.
```

### Toma del coro con el producto

```text
REFERENCIA: {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional).
IMAGEN: una mano real levanta el producto en [contexto de uso], luz cálida.
MOVIMIENTO: lo muestra a cámara y lo usa.
DURACIÓN: 4 s · 9:16 · sin audio.
```

### Toma previa al cierre

```text
IMAGEN: {{producto}} (foto real) en primer plano.
MOVIMIENTO: acercamiento lento. Espacio libre abajo para el rótulo de la oferta.
DURACIÓN: 4 s · 9:16 · sin audio.
```

### Cierre · oferta y llamado a la acción

```text
IMAGEN: {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) [en una mano / sobre una superficie limpia], fondo sencillo, con el tercio superior libre para el rótulo.
MOVIMIENTO: acercamiento lento; el producto queda quieto al final.
RÓTULO FINAL (lo pone el editor o el servidor, no el modelo de video): {{oferta}} · {{llamado}}
VOZ: "[la oferta y el llamado a la acción, con las palabras que dio el cliente]"
DURACIÓN: mínimo 5 s · 9:16
```
