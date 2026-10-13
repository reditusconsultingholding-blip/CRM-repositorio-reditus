---
slug: animacion-3d
nombre: Animación 3D
estado: confirmado
confianza: alta para el formato (viene de la skill del colega). No está en la base de Antonio más que como «animado».
para_que_sirve: Miniexplicador en animación 3D cálida, con narrador. Presenta a una persona con el problema, el producto, lo que pasa por dentro y el resultado, todo dentro del mismo mundo.
duracion: 30–50 s
relacion_aspecto: "9:16"
etapa_embudo: TOFU y MOFU
necesita: [foto real del envase, texto exacto de la etiqueta, dolor y mecanismo en palabras del cliente, país e idioma, oferta]
producto_en_pantalla: Paso 4 · Subida: el producto aparece en su versión animada, generada desde la foto real y con el texto de la etiqueta tal cual; vuelve en el paso 5 junto a la toma real
cierre: Paso 5 obligatorio (mínimo 5 s): el cierre corta el estilo del video y muestra el producto real con la oferta en texto grande; la voz dice la oferta y el llamado a la acción
riesgos: [caer en fotorrealismo, etiqueta con texto inventado, sujetos flotando sin apoyo, alargar o recortar líneas para cuadrar la duración, parecido con personajes o estudios conocidos]
modelo_imagen: Nano Banana Pro o GPT Image para las escenas; Nano Banana o Seedream para los pares de fotograma inicial y final
modelo_video: Kling con fotograma inicial y final en el mecanismo; alternativas Veo y Seedance
modelo_voz: ElevenLabs para la narración
modelo_musica: Suno · instrumental hecha para el anuncio
duracion_clip: una toma por línea; máximo 10 s por clip
audio_del_clip: sin audio; voz y música van aparte
fuentes: [skills del colega · anuncios-estilo-pixar, método §3.2, método §6, base §3.7]
---

## Qué es

Animación 3D con aspecto de largometraje familiar: personas estilizadas y expresivas, casas con textura, luz cálida de cine y poca profundidad de campo [colega: animación 3D]. El mecanismo se ve dentro del mismo mundo (por ejemplo, el cuerpo del personaje se vuelve translúcido en su propia cocina), no en un fondo técnico. Narra una voz rápida y conversacional; los subtítulos saltan palabra por palabra.

Avanza en cuatro capítulos: persona y situación, producto, mecanismo, resultado [colega: animación 3D]. Aquí se ordenan sobre los cinco pasos de Reditus.

## Cuándo usarlo

- Productos con un mecanismo que se puede dibujar y un problema que la gente entiende mal [colega: animación 3D].
- Para pasar a animación un guion ganador ya escrito, sin tocarle una palabra [colega: animación 3D].

## Cuándo no

- Si se quiere que hable el objeto (`objeto-parlante`), una canción (`musica`) o un fondo técnico de estudio (`explicativo-3d`) [colega: animación 3D].
- Si no hay foto del envase ni el texto de la etiqueta [colega: animación 3D].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–4 s | Impacto | La persona en su situación: un problema que parece superficial | [colega: animación 3D][método §3.2] |
| 4–12 s | Bajada | Algo pasa por debajo: primera vista del interior | [colega: animación 3D] |
| 12–22 s | Refuerzo | El mecanismo completo, con cambio de estado visible | [colega: animación 3D] |
| 22–32 s | Subida | Entra el producto y se ve qué le hace a ese mecanismo | [colega: animación 3D] |
| 32–42 s | CTA | El resultado en la vida de la persona y la oferta. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [colega: animación 3D][base §1][regla de Reditus] |

## Reglas visuales

- Antes de las tomas se hacen dos hojas de referencia, sobre pared lisa cálida y sin marco: la del personaje (si se repite) y la del producto [colega: animación 3D].
- La hoja del producto se genera con la foto real adjunta y el texto de la etiqueta dictado línea por línea [colega: animación 3D][base §3.7].
- El mecanismo y las transformaciones del producto usan fotograma inicial y final: misma escena, cámara quieta, solo cambia el estado [colega: animación 3D].
- Las palabras que no se quieren ver (fotorrealista, estudio, diagrama) no se escriben ni siquiera negadas en la descripción principal [colega: animación 3D].
- La duración pedida orienta, no manda: no se agregan ni se quitan líneas para cuadrarla [colega: animación 3D].
- Un B-roll por toma; si sale el personaje o el envase, se adjunta su hoja [colega: animación 3D].
- El estilo se describe con rasgos, sin nombrar estudios ni películas [regla de Reditus].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus]. En este formato el cierre tiende a diluirse: se corta el estilo y se pasa a la toma real.

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Animación 3D 9:16 | DURACIÓN: 42 s | CLIENTE: {{cliente}}
VOZ: narración en off, rápida y cercana

PASO 1 · IMPACTO (0–4 s): "[Nombre ficticio] cree que {{dolor}} es solo [lo que parece]."
PASO 2 · BAJADA (4–12 s): "Pero por debajo está pasando esto: [qué ocurre]."
PASO 3 · REFUERZO (12–22 s): "[El mecanismo, paso a paso, con el dato que dio el cliente]."
PASO 4 · SUBIDA (22–32 s): "{{producto}} [qué le hace a ese mecanismo]. {{beneficio}}."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (32–42 s): "[Cómo queda su día]. {{oferta}}."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

TOMAS: una por línea · PARES INICIO/FIN: en el mecanismo
```

## Prompts para modelo de video

### Hoja del personaje

```text
Hoja de referencia de un personaje original de animación 3D familiar: [quién es, edad, rasgos de {{pais}}, ropa], proporciones estilizadas, ojos expresivos, vista de frente y de tres cuartos, sobre pared lisa de tono cálido con textura suave, sin marco, formato vertical 9:16.
```

### Hoja del producto

```text
REFERENCIA: {{producto}} (foto real del envase).
Versión en animación 3D del mismo envase, con su forma y colores exactos. Texto de la etiqueta, tal cual: "[línea 1]" / "[línea 2]" / "[línea 3]". Sobre pared lisa de tono cálido, apoyado en una repisa, sin marco, formato vertical 9:16.
```

### Toma de situación o resultado

```text
Formato vertical 9:16. REFERENCIA: hoja del personaje.
IMAGEN: [personaje, descripción completa] en [lugar de su casa con textura], [qué hace], luz cálida de cine, poca profundidad de campo.
MOVIMIENTO: una acción corta; cámara con acercamiento suave.
DURACIÓN: 5 s · sin audio.
```

### Toma de mecanismo (par inicio/fin)

```text
Formato vertical 9:16.
FOTOGRAMA INICIAL: [el interior en estado de problema, dentro del mismo lugar]. FOTOGRAMA FINAL: la misma escena con [el estado resuelto]. Cámara quieta.
MOVIMIENTO: el cambio ocurre de forma gradual.
DURACIÓN: 6 s · sin audio.
```

### Toma real de cierre

```text
IMAGEN: {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) en una mano, en [contexto de uso].
MOVIMIENTO: acercamiento lento. Espacio libre abajo para el rótulo de la oferta.
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
