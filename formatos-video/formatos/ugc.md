---
slug: ugc
nombre: UGC
estado: confirmado
confianza: alta. Coinciden la base de Reditus y las skills del colega; la versión por bloques es la vigente.
para_que_sirve: Una persona común recomienda el producto a cámara con el celular, con su propia voz y cortes secos como si ella lo hubiera editado. Es la base de todos los demás formatos.
duracion: 30–40 s
relacion_aspecto: "9:16"
etapa_embudo: MOFU y BOFU
necesita: [foto del envase solo de frente y legible, modo de uso o dosis que confirme el cliente, prueba social real, país e idioma, cómo compra el cliente (contraentrega · tienda · WhatsApp)]
producto_en_pantalla: Paso 4 · Subida: producto real en mano con la etiqueta de frente y en uso; sigue en mano en el paso 5
cierre: Paso 5 obligatorio (mínimo 5 s): producto real en pantalla; la oferta se dice y se escribe en grande; termina con el llamado a la acción
riesgos: [look de estudio en vez de celular, usar la foto del personaje como primer fotograma, pedir «sin texto» y borrar la etiqueta, prueba social o dosis inventadas, bloque hablado con más palabras de las que caben]
modelo_imagen: GPT Image 2.5 para el personaje neutro (alternativas Nano Banana y Seedream)
modelo_video: Gemini Omni Flash con imágenes de referencia de personaje · producto · lugar (alternativas Veo · Kling · Seedance)
modelo_voz: la del propio clip (audio nativo con labios sincronizados); sin voz aparte
modelo_musica: se agrega en edición muy por debajo de la voz; el clip se pide sin música
duracion_clip: bloques de 10 s (también 8 o 6 s) con 3 a 5 planos internos
audio_del_clip: con audio
fuentes: [skills del colega · anuncios-ugc-new, skills del colega · anuncios-ugc, base §3.1, método §4.1, método §6]
---

## Qué es

Alguien del país del comprador habla a cámara todo el video, grabado como con el celular, y recorre dos o tres lugares de su día [base §3.1][colega: anuncios-ugc-new]. Se produce por **bloques**: cada bloque es una sola generación de 6 a 10 s que ya trae varios cambios de plano y la voz del personaje [colega: anuncios-ugc-new].

Variante anterior, todavía válida cuando el generador no acepta varias referencias: **escenas encadenadas** de hasta 8 s con un solo plano, donde el último fotograma de una escena es el primero de la siguiente, más un B-roll corto por escena [colega: anuncios-ugc].

Diferencia con la base de Antonio: él parte el guion en clips de 8 s con unas 20–24 palabras y agrega B-roll cada 3 s [método §3.3, §7]; la versión por bloques sube a unas 3 palabras por segundo y cambia el B-roll por cortes internos. Para este formato manda la versión por bloques, que es la más detallada.

## Cuándo usarlo

- Producto físico, suplemento, curso, app o servicio que alguien pueda recomendar con naturalidad [colega: anuncios-ugc-new].
- Cuando ya hay un guion ganador: se reparte en bloques sin cambiarle palabras [colega: anuncios-ugc-new].
- Es el formato por defecto cuando el cliente pide «un anuncio con IA» sin más [colega: anuncios-ugc].

## Cuándo no

- Si lo que se quiere es voz en off, conversación de dos o animación: hay formatos propios [colega: anuncios-ugc-new].
- Si no hay foto limpia del envase: el producto inventado se nota [base §3.1].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–3 s | Impacto | Primer tramo del bloque 1: situación real o pregunta de dolor, ya en movimiento | [método §3.2][colega: anuncios-ugc-new] |
| 3–10 s | Bajada | Resto del bloque 1: la consecuencia, con dos o tres cambios de plano | [método §3.2] |
| 10–18 s | Refuerzo | Bloque 2 en otro lugar: lo que probó y no sirvió | [método §3.2] |
| 18–30 s | Subida | Bloque 3: toma el producto, etiqueta de frente, lo usa y cuenta qué notó | [base §3.1][colega: anuncios-ugc-new] |
| 30–36 s | CTA | Último bloque: línea corta dicha a cámara con un gesto quieto. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [método §9.1][colega: anuncios-ugc-new][regla de Reditus] |

## Reglas visuales

- La imagen del personaje es neutra (pared lisa, manos vacías): fija la identidad y nunca se usa como primer fotograma [colega: anuncios-ugc-new].
- Las descripciones de personaje, voz y producto se repiten idénticas en todos los bloques [colega: anuncios-ugc-new].
- Unas 3 palabras por segundo hablado: cerca de 28 en un bloque de 10 s, 22 en 8 s y 16 en 6 s [colega: anuncios-ugc-new].
- Máximo un tramo sin voz por bloque, y nunca el primero ni el último [colega: anuncios-ugc-new].
- Celular en mano, luz natural, piel con textura; nada de vocabulario de cine [método §4.1][colega: anuncios-ugc].
- Un solo envase en cuadro y con luz de frente; no pedir «sin texto» de forma general porque borra la etiqueta [colega: anuncios-ugc-new].
- Subtítulos y música van en edición [método §8].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus].

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: UGC por bloques 9:16 | DURACIÓN: 36 s | CLIENTE: {{cliente}}

PASO 1 · IMPACTO (0–3 s) · bloque 1, a cámara: "¿A ti también te pasa que {{dolor}}?"
PASO 2 · BAJADA (3–10 s) · bloque 1: "Yo llevaba [tiempo] así, y lo peor era [consecuencia en el día a día]."
PASO 3 · REFUERZO (10–18 s) · bloque 2, otro lugar: "Probé [solución que falló] y nada."
PASO 4 · SUBIDA (18–30 s) · bloque 3, producto en mano: "Hasta que conocí {{producto}}. [Cómo se usa]. Lo que noté es que {{beneficio}}."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (30–36 s) · bloque 4, a cámara: "{{oferta}}."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

GANCHOS ALTERNATIVOS DEL BLOQUE 1: [dos más]
PALABRAS POR BLOQUE: [contarlas: unas 3 por segundo hablado]
```

## Prompts para modelo de video

### Imagen del personaje (solo identidad)

```text
[Mujer/hombre] de [edad] años con rasgos de {{pais}}, de frente, pared lisa clara, manos vacías, ropa cotidiana, luz natural, piel con microporos y microvellos sin suavizado, foto de celular, formato 9:16.
Uso: referencia de identidad. No es el primer fotograma de ningún bloque.
```

### Bloque 1 · Impacto y bajada

```text
REFERENCIAS: 1) personaje.
DURACIÓN: 10 s · 9:16 · con audio, sin música.
PERSONAJE: [descripción completa, idéntica en todos los bloques]. VOZ: [edad, timbre], acento [gentilicio y ciudad de {{pais}}].
LUGAR: [dónde está], grabado con celular en mano.
TRAMOS: 0–3 s plano cercano, dice "[hook]" · 3–6 s plano medio, dice "[…]" · 6–10 s otro ángulo, dice "[…]" y termina con un gesto quieto.
```

### Bloque 2 · Refuerzo

```text
REFERENCIAS: 1) personaje.
DURACIÓN: 8 s · 9:16 · con audio, sin música.
PERSONAJE y VOZ: idénticos al bloque 1.
LUGAR: [otro lugar de su día].
TRAMOS: [3 tramos con lo que dice en cada uno].
```

### Bloque 3 · Subida con producto en mano

```text
REFERENCIAS: 1) personaje, 2) {{producto}} (foto real del envase).
DURACIÓN: 10 s · 9:16 · con audio, sin música.
PRODUCTO: [descripción fija del envase], un solo envase, etiqueta de frente y completa, tamaño proporcional, luz de frente.
TRAMOS: toma el producto · lo muestra a cámara · lo usa como indicó el cliente · dice qué notó.
```

### Bloque 4 · CTA

```text
REFERENCIAS: 1) personaje, 2) {{producto}} (foto real), 3) captura del lugar del bloque 3.
DURACIÓN: 6 s · 9:16 · con audio.
TRAMOS: a cámara dice "[CTA con {{oferta}}]" · gesto quieto con el producto en la mano.
```

### Cierre · oferta y llamado a la acción

```text
IMAGEN: {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) [en una mano / sobre una superficie limpia], fondo sencillo, con el tercio superior libre para el rótulo.
MOVIMIENTO: acercamiento lento; el producto queda quieto al final.
RÓTULO FINAL (lo pone el editor o el servidor, no el modelo de video): {{oferta}} · {{llamado}}
VOZ: "[la oferta y el llamado a la acción, con las palabras que dio el cliente]"
DURACIÓN: mínimo 5 s · 9:16
```
