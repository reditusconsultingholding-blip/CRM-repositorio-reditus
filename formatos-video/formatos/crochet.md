---
slug: crochet
nombre: Crochet
estado: confirmado
confianza: alta. Confirmado con la skill del colega; no está en la base de Antonio.
para_que_sirve: Un mundo en miniatura tejido entero en lana, con voz narrada. Estilo artesanal y cercano que detiene el dedo y suaviza temas incómodos.
duracion: 30–45 s
relacion_aspecto: "9:16"
etapa_embudo: TOFU
necesita: [foto real del envase, 4 a 6 síntomas o señales que viva el comprador, mecanismo con datos que dé el cliente, país e idioma, oferta y modo de uso]
producto_en_pantalla: Paso 4 · Subida: el producto entra al mundo tejido y se corta a una toma real del producto en mano; al centro en el paso 5
cierre: Paso 5 obligatorio (mínimo 5 s): el cierre corta el estilo del video y muestra el producto real con la oferta en texto grande; la voz dice la oferta y el llamado a la acción
riesgos: [manos manipulando objetos pequeños, nubes de partículas · humo · vapor, pedir «un personaje de crochet» en vez de un mundo tejido, luz de estudio, fotograma final a medio movimiento]
modelo_imagen: Seedream (admite prompt negativo); alternativas Nano Banana Pro y GPT Image
modelo_video: Seedance de imagen a video (alternativas Kling y Veo)
modelo_voz: ElevenLabs para la narración
modelo_musica: en edición; la skill no fija herramienta
duracion_clip: una toma por línea; ninguna pasa de 9–10 s
audio_del_clip: sin audio; la voz va aparte
fuentes: [skills del colega · anuncios-crochet, método §5.4, base §1]
---

## Qué es

Un diorama donde absolutamente todo está tejido: personajes, caras, muebles y fondos, con las puntadas a la vista. Movimiento tipo stop-motion, cámara casi fija y una sola fuente de luz que nace dentro del set (una ventanita, una lámpara tejida) [colega: anuncios-crochet].

Cada toma se clasifica antes de generarla [colega: anuncios-crochet]:

- **A:** un movimiento que empieza y termina igual. Basta un fotograma.
- **B:** algo cambia de estado. Lleva fotograma inicial y fotograma final ya terminado.
- **C:** plano sostenido con movimiento mínimo.

## Cuándo usarlo

- Productos con varios síntomas visibles que se pueden encadenar, o con un mecanismo explicable con datos [colega: anuncios-crochet].
- Fragancia, sabor o sensación, mostrados por la reacción del personaje [colega: anuncios-crochet].
- Productos con un ángulo de fabricación o pureza [colega: anuncios-crochet].

## Cuándo no

- Si la idea depende de manos manipulando cosas pequeñas, o de humo, vapor o partículas: el estilo falla ahí [colega: anuncios-crochet].
- Marcas sobrias o productos técnicos [propuesta].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–10 s | Impacto | Gancho con 4 a 6 síntomas seguidos, una toma por síntoma | [colega: anuncios-crochet] |
| 10–14 s | Bajada | Frase bisagra: todo eso tiene una sola causa | [colega: anuncios-crochet] |
| 14–24 s | Refuerzo | El mecanismo con datos, sin villano; por qué lo de siempre no lo toca | [colega: anuncios-crochet] |
| 24–34 s | Subida | El producto como solución específica a ese mecanismo. Toma real del producto en mano | [colega: anuncios-crochet][base §1] |
| 34–42 s | CTA | Uso concreto y oferta local. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [colega: anuncios-crochet][regla de Reditus] |

## Reglas visuales

- Se describe siempre «un mundo tejido», no un personaje tejido sobre un fondo normal [colega: anuncios-crochet].
- Tres bloques fijos se pegan sin cambios: lo que debe verse y lo que no en cada imagen, y el cierre de cada video [colega: anuncios-crochet].
- Una idea por línea; la duración de la toma sale de contar palabras [colega: anuncios-crochet].
- Personaje fijo repetido palabra por palabra, o un personaje distinto por toma [colega: anuncios-crochet].
- El mecanismo se muestra con un objeto agrandado, un mini lugar de proceso o la reacción del personaje; nunca con diagramas ni flechas [colega: anuncios-crochet].
- Lo que sería polvo o partículas se resuelve con bolitas de lana [colega: anuncios-crochet].
- Movimientos fluidos; texto solo en edición [método §5.4][colega: anuncios-crochet].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus]. En este formato el cierre tiende a diluirse: se corta el estilo y se pasa a la toma real.

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Crochet 9:16 | DURACIÓN: 42 s | CLIENTE: {{cliente}}
VOZ: narración en off · PERSONAJE: [fijo / uno por toma]

PASO 1 · IMPACTO (0–10 s): "[Síntoma 1]. [Síntoma 2]. [Síntoma 3]. [Síntoma 4]."   (los que vive quien tiene {{dolor}})
PASO 2 · BAJADA (10–14 s): "Todo eso viene de lo mismo."
PASO 3 · REFUERZO (14–24 s): "[El mecanismo, con el dato que dio el cliente]. Por eso [lo de siempre] no lo resuelve."
PASO 4 · SUBIDA (24–34 s): "{{producto}} [qué hace sobre ese mecanismo]. {{beneficio}}."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (34–42 s): "[Cómo se usa, en una frase]. {{oferta}}."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

TIPO DE CADA TOMA: [A / B / C]
```

## Prompts para modelo de video

### Mundo y personaje

```text
Diorama en miniatura completamente tejido en lana y ganchillo: [lugar], muebles y fondo tejidos, puntadas visibles. Personaje tejido: [quién es, emoción]. Una sola luz que sale de [ventana / lámpara tejida]. Formato 9:16.
No debe verse: piel real, plástico, luz de estudio, texto, logos.
```

### Toma tipo A (síntoma)

```text
DURACIÓN: 4 s.
IMAGEN: [mundo y personaje, descripción completa] haciendo [el gesto del síntoma].
MOVIMIENTO: el gesto empieza y vuelve a su posición; cámara casi fija.
9:16 · sin audio.
```

### Toma tipo B (cambio de estado)

```text
DURACIÓN: 5 s.
FOTOGRAMA INICIAL: [estado del problema]. FOTOGRAMA FINAL: [estado resuelto, ya quieto], mismo encuadre.
MOVIMIENTO: el cambio ocurre de forma gradual.
9:16 · sin audio.
```

### Toma real del producto en mano (paso 4)

```text
IMAGEN: una mano real con rasgos de {{pais}} sostiene {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) en [contexto de uso].
MOVIMIENTO: gira un poco el producto y lo usa; se corta antes de terminar.
DURACIÓN: 3 s · 9:16 · sin audio.
```

### Cierre · oferta y llamado a la acción

```text
IMAGEN: {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) [en una mano / sobre una superficie limpia], fondo sencillo, con el tercio superior libre para el rótulo.
MOVIMIENTO: acercamiento lento; el producto queda quieto al final.
RÓTULO FINAL (lo pone el editor o el servidor, no el modelo de video): {{oferta}} · {{llamado}}
VOZ: "[la oferta y el llamado a la acción, con las palabras que dio el cliente]"
DURACIÓN: mínimo 5 s · 9:16
```
