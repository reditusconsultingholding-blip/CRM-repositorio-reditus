---
slug: objeto-parlante
nombre: Objeto parlante
estado: confirmado
confianza: alta. La base de Reditus lo registra como «el producto como personaje» y la skill del colega detalla el ángulo y la producción.
para_que_sirve: Objetos con cara hablan a cámara en primera persona. Lo habitual es que las alternativas que el cliente ya probó confiesen por qué fallan, y el producto cierre.
duracion: 30–45 s
relacion_aspecto: "9:16"
etapa_embudo: MOFU y BOFU
necesita: [foto real del envase, qué soluciones probó antes el comprador, dolor y beneficio principal, país e idioma, oferta y garantía]
producto_en_pantalla: Paso 4 · Subida: el producto toma la palabra con su envase real (misma forma y etiqueta; solo se le agrega cara) y entra una toma real del producto en mano; primer plano en el paso 5
cierre: Paso 5 obligatorio (mínimo 5 s): el cierre corta el estilo del video y muestra el producto real con la oferta en texto grande; la voz dice la oferta y el llamado a la acción
riesgos: [envase deformado o etiqueta cambiada, todos los personajes con la misma emoción, narrador externo, tono infantil que no encaja con la marca, parecido con personajes conocidos]
modelo_imagen: GPT Image o Nano Banana; una imagen por personaje
modelo_video: Gemini Omni Flash con la línea exacta en el prompt (audio y labios nativos)
modelo_voz: la del propio clip; se define una vez por personaje
modelo_musica: en edición; la skill no fija herramienta
duracion_clip: una toma por línea; hasta 10 s
audio_del_clip: con audio; el B-roll va mudo
fuentes: [skills del colega · anuncios-talking-object-pixar, base §3.7, método §3.1, método §6]
---

## Qué es

Objetos, ingredientes, partes del cuerpo o el propio envase con ojos grandes, cejas y una boca que articula, en animación 3D familiar de formas redondeadas, colores cálidos y luz de atardecer [colega: objeto parlante]. Hablan ellos: aquí nunca hay narrador. Antonio da el ejemplo del frasco que se presenta en primera persona [método §3.1, §6].

Ángulos [colega: objeto parlante]:

- **Las alternativas confiesan** (por defecto): la crema de farmacia, el colchón barato o el multivitamínico genérico admiten en una o dos líneas por qué no sirven; luego habla el producto.
- **Elenco de ingredientes:** cada ingrediente dice qué aporta.
- **Órgano narrador:** el órgano afectado cuenta lo que le pasa.
- **Objeto único.**

## Cuándo usarlo

- Cuando el comprador ya probó otras cosas y le fallaron [colega: objeto parlante].
- Suplementos con ingredientes reconocibles, o mecanismos de salud contados desde adentro [colega: objeto parlante][base §3.7].

## Cuándo no

- Si se quiere una voz que explique: para eso están la animación 3D y el explicativo 3D [colega: objeto parlante].
- Marcas que piden tono sobrio y nada infantil [propuesta].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–4 s | Impacto | La primera alternativa confiesa, sin saludo | [colega: objeto parlante] |
| 4–12 s | Bajada | Explica lo que le hace de verdad al comprador | [método §3.2] |
| 12–22 s | Refuerzo | Segunda y tercera alternativa: una o dos líneas cada una, con emociones distintas | [colega: objeto parlante] |
| 22–34 s | Subida | El producto toma la palabra: ese es el giro. Dice su mecanismo y su beneficio | [colega: objeto parlante] |
| 34–42 s | CTA | El producto dice oferta y garantía; los demás personajes no venden. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [colega: objeto parlante][regla de Reditus] |

## Reglas visuales

- Ficha por personaje con dos líneas separadas: aspecto (solo para las imágenes) y voz, fijada una vez (solo para los videos) [colega: objeto parlante].
- El objeto sigue siendo reconocible y la boca siempre se ve [colega: objeto parlante].
- Emociones variadas: no todos enojados [colega: objeto parlante].
- El envase conserva forma y etiqueta; lo más seguro es agregarle solo la cara [colega: objeto parlante][base §3.7].
- El prompt de video lleva la línea exacta para que salgan voz y labios [colega: objeto parlante].
- Un B-roll mudo por toma [colega: objeto parlante].
- Personajes originales: ninguno puede parecerse a uno conocido [colega: objeto parlante].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus]. En este formato el cierre tiende a diluirse: se corta el estilo y se pasa a la toma real.

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Objeto parlante 9:16 | DURACIÓN: 42 s | CLIENTE: {{cliente}}
PERSONAJES: [alternativa 1] · [alternativa 2] · [alternativa 3] · {{producto}}

PASO 1 · IMPACTO (0–4 s) · ALTERNATIVA 1: "Soy [lo que usas hoy], y tengo que confesarte algo sobre {{dolor}}."
PASO 2 · BAJADA (4–12 s) · ALTERNATIVA 1: "[Lo que hago de verdad y por qué no te sirve]."
PASO 3 · REFUERZO (12–22 s) · ALTERNATIVA 2: "[Su confesión]." · ALTERNATIVA 3: "[Su confesión]."
PASO 4 · SUBIDA (22–34 s) · {{producto}}: "Yo soy distinto. [Mecanismo en una frase]. {{beneficio}}."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (34–42 s) · {{producto}}: "{{oferta}}."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

EMOCIÓN DE CADA PERSONAJE: [culpable / cansado / presumido / seguro]
```

## Prompts para modelo de video

### Imagen de un personaje

```text
[Objeto] convertido en personaje de animación 3D familiar: ojos grandes, cejas y boca visible, formas redondeadas, expresión de [emoción], apoyado en [lugar coherente], luz cálida de atardecer, colores saturados, formato 9:16.
Evitar: persona disfrazada de objeto, texto inventado, parecido con personajes conocidos.
```

### Imagen del producto como personaje

```text
REFERENCIA: {{producto}} (foto real del envase).
El envase conserva exactamente su forma, sus colores y su etiqueta; solo se le agregan ojos, cejas y boca. Expresión segura y amable, [lugar], luz cálida, formato 9:16.
```

### Toma hablada

```text
PRIMER FOTOGRAMA: imagen del personaje.
VOZ: [la que se fijó para este personaje], acento de {{pais}}.
DICE: "[línea exacta]"
MOVIMIENTO: gesticula; acercamiento suave de cámara.
DURACIÓN: 8 s · 9:16 · con audio.
```

### Toma real del producto en mano (paso 4)

```text
IMAGEN: una mano real sostiene {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) en [contexto de uso].
MOVIMIENTO: lo gira y lo usa; se corta antes de terminar.
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
