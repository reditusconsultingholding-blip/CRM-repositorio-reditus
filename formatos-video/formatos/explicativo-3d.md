---
slug: explicativo-3d
nombre: Explicativo 3D
estado: confirmado
confianza: alta para el formato (viene de la skill del colega). No está en la base de Antonio.
para_que_sirve: Minidocumental animado que responde una pregunta curiosa a toda velocidad. Las escenas de vida son cálidas y las de mecanismo cambian a un 3D limpio, sobre fondo liso, que deja ver cómo funciona.
duracion: 30–45 s
relacion_aspecto: "9:16"
etapa_embudo: TOFU
necesita: [foto real del envase, texto exacto de la etiqueta, el dato curioso o el mecanismo que confirme el cliente, país e idioma, oferta, fondo de las tomas de mecanismo (cuadrícula azul o estudio claro)]
producto_en_pantalla: Paso 4 · Subida: el producto aparece con su etiqueta real y se ve qué hace; vuelve en el paso 5 junto a la toma real
cierre: Paso 5 obligatorio (mínimo 5 s): el cierre corta el estilo del video y muestra el producto real con la oferta en texto grande; la voz dice la oferta y el llamado a la acción
riesgos: [dato curioso inventado, sujetos flotando sin sombra, fondo de cuadrícula que se oscurece, cambiar de fondo en cada toma, parecido con canales o creadores conocidos]
modelo_imagen: Nano Banana Pro o GPT Image para las escenas; Nano Banana o Seedream para los pares de fotograma inicial y final
modelo_video: Veo o Kling con fotograma inicial y final en el mecanismo
modelo_voz: ElevenLabs para la narración
modelo_musica: en edición; la skill no fija herramienta
duracion_clip: una toma por línea; hasta 8–10 s
audio_del_clip: sin audio; la voz va aparte
fuentes: [skills del colega · anuncios-zack-d-films, método §3.2, base §1]
---

## Qué es

Explicación animada en 3D con narrador rápido, casi atropellado, y subtítulos que saltan palabra por palabra [colega: explicativo 3D]. Combina dos aspectos:

- **Escenas de vida:** personajes cálidos y expresivos, luz de cine, en lugares reales.
- **Tomas de mecanismo:** 3D más frío y simple, de superficies suaves y sin detalle fino, sobre una cuadrícula azul uniforme o un estudio claro.

Es primo de `animacion-3d`: mismos capítulos, pero aquí el mecanismo se saca del mundo cálido y se muestra en limpio.

## Cuándo usarlo

- Productos con un mecanismo o un dato curioso que se pueda explicar en segundos [colega: explicativo 3D].
- Ángulos de mito contra realidad, cifra que sorprende o relato de descubrimiento [colega: explicativo 3D].

## Cuándo no

- Si el dato no lo confirma el cliente: no se inventa [base §1].
- Si se quiere que hable el producto o que todo se mantenga cálido [colega: explicativo 3D].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–4 s | Impacto | Una pregunta rara, con la persona en su situación | [colega: explicativo 3D][método §3.2] |
| 4–12 s | Bajada | La revelación: lo que casi nadie sabe | [colega: explicativo 3D] |
| 12–22 s | Refuerzo | El mecanismo en limpio, con cambio de estado | [colega: explicativo 3D] |
| 22–32 s | Subida | El producto y qué le hace a ese mecanismo | [colega: explicativo 3D] |
| 32–40 s | CTA | Giro final, resultado en la vida real y oferta. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [colega: explicativo 3D][base §1][regla de Reditus] |

## Reglas visuales

- El fondo de las tomas de mecanismo se elige una sola vez para todo el video [colega: explicativo 3D].
- La cuadrícula es de un azul parejo, sin degradado oscuro [colega: explicativo 3D].
- El mecanismo usa fotograma inicial y final idénticos salvo el estado; el sujeto va apoyado y con sombra de contacto [colega: explicativo 3D].
- Normalmente no hay personaje fijo; si se repite, su ficha va palabra por palabra [colega: explicativo 3D].
- El texto real de la etiqueta se conserva; cualquier otro texto se pone en edición [colega: explicativo 3D].
- Un B-roll por toma [colega: explicativo 3D].
- El estilo se describe con rasgos, sin nombrar canales ni creadores [regla de Reditus].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus]. En este formato el cierre tiende a diluirse: se corta el estilo y se pasa a la toma real.

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Explicativo 3D 9:16 | DURACIÓN: 40 s | CLIENTE: {{cliente}}
VOZ: narración en off, muy rápida · FONDO DEL MECANISMO: [cuadrícula azul / estudio claro]

PASO 1 · IMPACTO (0–4 s): "¿Sabías por qué {{dolor}}?"
PASO 2 · BAJADA (4–12 s): "[La revelación: el dato que confirmó el cliente]."
PASO 3 · REFUERZO (12–22 s): "[Cómo funciona, paso a paso]."
PASO 4 · SUBIDA (22–32 s): "Por eso existe {{producto}}: [qué hace sobre ese mecanismo]. {{beneficio}}."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (32–40 s): "[Giro final]. {{oferta}}."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

TOMAS: una por línea · PARES INICIO/FIN: en el mecanismo
```

## Prompts para modelo de video

### Toma de vida

```text
Formato vertical 9:16.
IMAGEN: personaje original de animación 3D, [quién es, rasgos de {{pais}}], en [lugar real], [qué hace], luz de cine, profundidad de campo.
MOVIMIENTO: una acción corta.
DURACIÓN: 4 s · sin audio.
```

### Toma de mecanismo (par inicio/fin)

```text
Formato vertical 9:16.
FOTOGRAMA INICIAL: [la parte del cuerpo o el objeto] en 3D simple de superficies suaves, apoyado, con sombra de contacto, sobre [cuadrícula azul uniforme / estudio claro], en estado de problema.
FOTOGRAMA FINAL: la misma imagen, solo cambia [el estado]. Cámara quieta.
DURACIÓN: 6 s · sin audio.
```

### Toma del producto

```text
REFERENCIA: {{producto}} (foto real del envase, etiqueta sin alterar).
IMAGEN: el producto apoyado sobre una superficie limpia, con su texto real legible; a su lado [lo que resuelve].
MOVIMIENTO: giro corto del producto.
DURACIÓN: 4 s · 9:16 · sin audio.
```

### Toma real de cierre

```text
IMAGEN: {{producto}} (foto real, tamaño proporcional) en una mano, en [contexto de uso].
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
