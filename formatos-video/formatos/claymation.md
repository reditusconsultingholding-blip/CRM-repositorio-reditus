---
slug: claymation
nombre: Claymation (plastilina)
alias: [plastilina]
estado: confirmado
confianza: alta. Antonio mostró un claymation en pauta y la skill del colega detalla la producción. «Plastilina» es el mismo formato con su nombre en español.
para_que_sirve: Personajes y escenarios de plastilina, tipo stop-motion, actúan un problema silencioso y su mecanismo mientras una voz lo cuenta. Permite tratar temas delicados sin personas reales.
duracion: 30–45 s
relacion_aspecto: "9:16"
etapa_embudo: TOFU
necesita: [foto real del envase, dolor y beneficio principal, país e idioma, precio u oferta (o pedir que no aparezca), mecanismo del producto en palabras del cliente]
producto_en_pantalla: Paso 4 · Subida: el producto entra modelado en plastilina conservando la silueta y los colores del envase real; en el paso 5 se cierra con la toma real del producto
cierre: Paso 5 obligatorio (mínimo 5 s): el cierre corta el estilo del video y muestra el producto real con la oferta en texto grande; la voz dice la oferta y el llamado a la acción
riesgos: [movimientos lentos, personaje que cambia entre tomas, envase deformado, personajes flotando sobre fondo liso, materiales reales que rompen el estilo]
modelo_imagen: Seedream o Nano Banana (también GPT Image) con la ficha del personaje repetida
modelo_video: Kling con fotograma inicial y final (alternativa económica Seedance) · de imagen a video
modelo_voz: ElevenLabs para la narración; voz del clip solo si los personajes hablan
modelo_musica: en edición; la skill no fija herramienta
duracion_clip: tomas de 3 a 5 s; una toma más larga se parte en subclips con un fotograma puente
audio_del_clip: sin audio (720p); la voz va aparte
fuentes: [skills del colega · anuncios-claymation, clase 3 02:00:21–02:12:24, método §5.4, método §6, base §3.7]
---

## Qué es

Animación con aspecto de plastilina modelada a mano: cuerpos redondeados, superficie mate con marcas suaves de modelado, escenarios en miniatura del mismo material, luz de estudio difusa y sensación de lente macro [colega: anuncios-claymation]. Por defecto narra una voz en off; los personajes solo hablan en la variante de conversación [colega: anuncios-claymation]. Antonio lo usa con el personaje hablando y escenas de 2 s [clase 3 02:00:21]; las dos formas son válidas.

Nota sobre el producto: la skill del colega lo muestra esculpido en plastilina; la regla de Reditus pide ver el producto real. Se cumplen las dos: esculpido en la subida y toma real en el cierre.

## Cuándo usarlo

- Productos con un problema que no se ve y un mecanismo que se puede explicar con un villano o una metáfora [colega: anuncios-claymation].
- Nichos sensibles, donde el muñeco dice lo que una persona real no puede decir [clase 3 02:00:21].
- También transformaciones «satisfactorias», comparaciones lado a lado y humor absurdo [colega: anuncios-claymation].

## Cuándo no

- Moda y belleza, donde hay que ver el producto sobre una persona real [propuesta].
- Público que necesita prueba real: se acompaña de un UGC en el mismo lote [método §3.1].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–4 s | Impacto | El problema oculto, con una intriga que queda abierta | [colega: anuncios-claymation][método §3.2] |
| 4–14 s | Bajada | El mecanismo convertido en personaje: qué está pasando por dentro | [colega: anuncios-claymation] |
| 14–22 s | Refuerzo | Por qué lo que la gente suele hacer no alcanza | [colega: anuncios-claymation] |
| 22–32 s | Subida | El producto como respuesta a ese mecanismo, dentro del mismo mundo | [colega: anuncios-claymation] |
| 32–40 s | CTA | La oferta ilustrada (por ejemplo, alguien que entrega el pedido en la puerta) y toma real del producto. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [colega: anuncios-claymation][base §1][regla de Reditus] |

## Reglas visuales

- Una toma por línea del guion; su duración sale de contar palabras (unas 2,4 por segundo) [colega: anuncios-claymation].
- La ficha del personaje se repite palabra por palabra en cada toma [colega: anuncios-claymation][clase 3 02:00:21].
- Cada toma ocurre en un lugar reconocible; fondo liso solo para un detalle aislado [colega: anuncios-claymation].
- Vidrio, agua, metal o tela se ven como imitaciones de plastilina, nunca reales [colega: anuncios-claymation].
- El envase conserva su silueta; si lleva cara, solo ojos y boca [colega: anuncios-claymation][base §3.7].
- Movimientos fluidos, no lentos [método §5.4].
- Un B-roll por toma, con lugar definido; el texto en pantalla se pone en edición [colega: anuncios-claymation].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus]. En este formato el cierre tiende a diluirse: se corta el estilo y se pasa a la toma real.

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Claymation 9:16 | DURACIÓN: 40 s | CLIENTE: {{cliente}}
VOZ: narración en off

PASO 1 · IMPACTO (0–4 s): "¿Sabes por qué {{dolor}}? No es lo que crees."
PASO 2 · BAJADA (4–14 s): "[El mecanismo, contado como un personaje que hace algo por dentro]."
PASO 3 · REFUERZO (14–22 s): "Por eso [lo que la gente suele hacer] no alcanza."
PASO 4 · SUBIDA (22–32 s): "{{producto}} [qué le hace a ese mecanismo, en una frase]. {{beneficio}}."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (32–40 s): "{{oferta}}."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

TOMAS: una por línea · SEGUNDOS POR TOMA: palabras ÷ 2,4
```

## Prompts para modelo de video

### Ficha del personaje

```text
Personaje de plastilina modelada a mano: [quién es, edad, rasgos], cuerpo redondeado, superficie mate con marcas suaves de modelado, [emoción]. Escenario en miniatura de plastilina: [lugar]. Luz de estudio suave, lente macro, formato 9:16.
Evitar: materiales reales, render liso, persona real, texto, logos.
```

### Toma de problema o mecanismo

```text
IMAGEN: [ficha del personaje, completa] en [lugar], haciendo [lo que dice la línea].
MOVIMIENTO: [una acción corta], fluido, con cadencia de stop-motion.
DURACIÓN: 4 s · 9:16 · sin audio.
```

### Toma de subida con el producto

```text
IMAGEN: [ficha del personaje, completa] junto a {{producto}} modelado en plastilina, con la silueta y los colores del envase de la foto real adjunta.
MOVIMIENTO: el personaje lo levanta y cambia de expresión.
DURACIÓN: 4 s · 9:16 · sin audio.
```

### Toma real de cierre

```text
IMAGEN: {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) en [contexto de uso], una mano lo toma.
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
