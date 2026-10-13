---
slug: entrevista
nombre: Entrevista en la calle
estado: confirmado
confianza: alta. La base de Antonio y la skill del colega describen el mismo formato; la del colega trae más detalle de producción.
para_que_sirve: Parece un clip viral de preguntas en la calle. Una voz fuera de cuadro para a alguien, le saca una confesión sobre su problema y el producto entra después.
duracion: 30–50 s
relacion_aspecto: "9:16"
etapa_embudo: TOFU
necesita: [foto del producto en fondo blanco, frases reales del comprador, qué probó antes y abandonó, un dato real de prueba, a quién se entrevista (género · edad · perfil) y en qué ciudad]
producto_en_pantalla: Paso 4 · Subida: el entrevistador le pone el producto real en la mano, ya abierto, y la persona lo prueba ahí mismo. En la variante de gancho se ve en tomas reales superpuestas en edición
cierre: Paso 5 obligatorio (mínimo 5 s): después del remate de la conversación va una placa con el producto real y la oferta en texto grande; una voz dice la oferta y el llamado a la acción
riesgos: [mostrar el producto demasiado pronto, que la persona mire al lente y no al entrevistador, voces que cambian entre clips, precio o urgencia dentro del diálogo, destapar el producto en cámara]
modelo_imagen: GPT Image 2.5 o Nano Banana para la hoja de la persona · la calle vacía · la mano con micrófono
modelo_video: Gemini Omni Flash (clips de 10 s) o Seedance 2.0 (clips de 15 s) desde el primer fotograma
modelo_voz: la del propio clip; texto a voz solo para parchar una sílaba
modelo_musica: ninguna o muy baja
duracion_clip: 10 o 15 s según el generador; un clip por intercambio completo
audio_del_clip: con audio (720p)
fuentes: [skills del colega · anuncios-entrevista, método §5.4, método §6]
---

## Qué es

Entrevista callejera en la que la persona parece «atrapada», no actuando. Tiene dos variantes [colega: anuncios-entrevista]:

- **Entrevista completa:** cinco peldaños, con el producto entregado en la mano y probado en cámara.
- **Gancho callejero:** tres preguntas rápidas de «¿esto o aquello?», la persona se traba en la tercera, la imagen se congela y sigue su historia en voz; el producto va en tomas superpuestas.

Diferencia con la base de Antonio: él pone al entrevistador a cuadro, de perfil o de espalda, y cierra con CTA a cámara [método §6]. Aquí el entrevistador queda fuera de cuadro (solo entra su brazo con el micrófono) y la marca la dice él en off. Para este formato manda esta versión, que es la más detallada; se conserva de Antonio que quien calla no mueve la boca y que no hay B-roll durante la entrevista [método §5.4, §6].

## Cuándo usarlo

- Entrevista completa: productos de reacción inmediata (sabor, olor, textura) o digitales que se muestran en el celular [colega: anuncios-entrevista].
- Gancho callejero: productos de resultado lento, servicios y digitales [colega: anuncios-entrevista].

## Cuándo no

- Si el producto tiene que verse desde el primer segundo [colega: anuncios-entrevista].
- Si no hay tiempo para regenerar: es de los formatos más difíciles [método §6].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–8 s | Impacto | Abordaje y confesión: la pregunta incómoda y una respuesta que la persona no esperaba dar | [colega: anuncios-entrevista][método §3.2] |
| 8–16 s | Bajada | Cuenta cómo le afecta en su día | [método §3.2] |
| 16–24 s | Refuerzo | Lo que ya probó y dejó | [colega: anuncios-entrevista] |
| 24–38 s | Subida | El entrevistador le entrega el producto ya abierto; lo prueba ahí mismo y da su veredicto | [colega: anuncios-entrevista] |
| 38–45 s | CTA | Remate de la persona y cierre: la marca la dice el entrevistador en off. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [colega: anuncios-entrevista][regla de Reditus] |

## Reglas visuales

- Tres elementos se generan una sola vez y se reutilizan: hoja de la persona en fondo blanco, calle vacía y mano con micrófono inalámbrico [colega: anuncios-entrevista].
- Una imagen por clip, que es su primer fotograma; cada prompt de video termina describiendo cómo queda el cuadro, y eso abre la imagen del clip siguiente [colega: anuncios-entrevista].
- Cámara fija, de muslos hacia arriba; la persona mira al entrevistador; el brazo entra siempre por el mismo lado [colega: anuncios-entrevista].
- Preguntas cortas, respuestas más largas; la descripción de cada voz es idéntica en todos los clips [colega: anuncios-entrevista].
- Sin marcas de tiempo, coordenadas ni colas de calidad en el prompt de video; tampoco se redescriben persona, calle o luz [colega: anuncios-entrevista].
- Sin precio ni urgencia en el diálogo: van en subtítulos o en el texto del anuncio [colega: anuncios-entrevista].
- Subtítulos en edición, en negrita, de dos o tres palabras [colega: anuncios-entrevista].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus]. La skill del colega deja precio y urgencia fuera del diálogo; aquí manda la regla de Reditus: van en la placa final, dichos por una voz en off.

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Entrevista en la calle 9:16 | DURACIÓN: 45 s | CLIENTE: {{cliente}}
VARIANTE: [entrevista completa / gancho callejero]

PASO 1 · IMPACTO (0–8 s) · ENTREVISTADOR en off: "Una pregunta rápida, ¿[pregunta incómoda sobre {{dolor}}]?" · PERSONA: "[confesión]"
PASO 2 · BAJADA (8–16 s) · PERSONA: "[cómo le afecta en su día]"
PASO 3 · REFUERZO (16–24 s) · ENTREVISTADOR: "¿Y qué has probado?" · PERSONA: "[lo que probó y dejó]"
PASO 4 · SUBIDA (24–38 s) · ENTREVISTADOR, le pasa el producto: "Prueba esto." · PERSONA, lo prueba: "[reacción]. {{beneficio}}."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (38–45 s) · PERSONA: "[remate]" · ENTREVISTADOR en off: "Se llama {{producto}}."   SUBTÍTULO: {{oferta}}
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

PALABRAS POR CLIP: [contarlas contra la duración del clip]
```

## Prompts para modelo de video

### Hoja de la persona

```text
Hoja de referencia con tres vistas (frente, tres cuartos, perfil) de [mujer/hombre de N años con rasgos de {{pais}}, perfil del comprador], ropa de calle, fondo blanco liso, piel con textura real, sin texto.
```

### Calle vacía y mano con micrófono

```text
1) Acera de [ciudad de {{pais}}] de día, sin personas en primer plano, encuadre vertical a la altura del pecho.
2) Antebrazo [tono de piel] que entra por la izquierda del cuadro sosteniendo un micrófono inalámbrico pequeño, fondo blanco liso.
```

### Clip 1 · Abordaje y confesión

```text
PRIMER FOTOGRAMA: la persona de la hoja en la calle, de muslos hacia arriba, mirando hacia la izquierda del cuadro; el brazo con el micrófono entra por la izquierda.
VOZ EN OFF (entrevistador): [descripción fija de su voz] dice "[pregunta]"
PERSONA: [descripción fija de su voz, acento de {{pais}}] responde "[confesión]"
NO DEBE PASAR: mirar al lente, texto en pantalla, cortes, movimiento de cámara.
DURACIÓN: 10 s · 9:16 · con audio.
Termina: la persona se ríe y baja la mirada.
```

### Clip de entrega del producto

```text
PRIMER FOTOGRAMA: [cómo terminó el clip anterior].
REFERENCIA: {{producto}} (foto real en fondo blanco), ya abierto, tamaño proporcional, etiqueta sin alterar.
ACCIÓN: la mano del entrevistador le pasa el producto; la persona lo recibe y lo prueba.
VOZ EN OFF: "[frase de entrega]" · PERSONA: "[reacción]"
NO DEBE PASAR: destapar el producto en cámara, segundo envase, etiqueta distinta.
DURACIÓN: 10 s · 9:16 · con audio.
Termina: la persona sostiene el producto a la altura del pecho.
```

### Clip de cierre

```text
PRIMER FOTOGRAMA: [cómo terminó el clip anterior], con el producto en la mano.
PERSONA: "[remate]" · VOZ EN OFF: "[nombre del producto]"
DURACIÓN: 10 s · 9:16 · con audio.
```

### Cierre · oferta y llamado a la acción

```text
IMAGEN: {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) [en una mano / sobre una superficie limpia], fondo sencillo, con el tercio superior libre para el rótulo.
MOVIMIENTO: acercamiento lento; el producto queda quieto al final.
RÓTULO FINAL (lo pone el editor o el servidor, no el modelo de video): {{oferta}} · {{llamado}}
VOZ: "[la oferta y el llamado a la acción, con las palabras que dio el cliente]"
DURACIÓN: mínimo 5 s · 9:16
```
