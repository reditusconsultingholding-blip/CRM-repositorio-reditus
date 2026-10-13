---
slug: usos-del-producto
nombre: Usos del producto
estado: por confirmar
confianza: media. Lo pidió el CEO en la reunión del 12-oct-2026 («un formato que se llame usos del producto, que solo el producto sea el protagonista»). La estructura y los prompts son una interpretación de trabajo sobre la montaña rusa de Antonio; falta que él los valide.
para_que_sirve: Solo el producto en pantalla, sin personas a cámara. Muestra uno tras otro los usos reales del producto, con voz narrada o solo texto. Sirve cuando el producto se explica viéndolo funcionar.
duracion: 20–30 s
relacion_aspecto: "9:16"
etapa_embudo: MOFU y BOFU
necesita: [fotos reales del producto (2 a 4 ángulos), lista de 3 usos que confirme el cliente, voz narradora con acento del país (opcional), oferta local]
producto_en_pantalla: Todo el video. El producto real es el protagonista desde el paso 1; en el paso 4 se ven sus usos uno por uno
cierre: Paso 5 obligatorio (mínimo 5 s): producto real en pantalla; la oferta se dice y se escribe en grande; termina con el llamado a la acción
riesgos: [producto o etiqueta deformados entre escenas, usos inventados que el cliente no confirmó, manos o personas que le roban el protagonismo, video plano sin un estímulo cada 3 s, tamaño del producto que cambia de una escena a otra]
modelo_imagen: GPT Image 2.5 desde la foto real del producto (propuesta de Reditus)
modelo_video: Gemini Omni Flash de imagen a video (propuesta de Reditus)
modelo_voz: ElevenLabs para la narración · opcional (propuesta de Reditus)
modelo_musica: en edición
duracion_clip: escenas de 4 s
audio_del_clip: sin audio; la voz va aparte
fuentes: [reunión 12-oct-2026, método §3.2, método §5.4, método §7, base §1]
---

## Qué es

Video de producto puro: no hay presentador, entrevistado ni personaje. La cámara se queda con el producto real y lo muestra en uso, un uso por escena, con cortes rápidos [reunión 12-oct-2026]. Puede llevar voz narrada o ir solo con texto en pantalla y música. Cada escena se genera a partir de la foto real, para no inventar el envase [método §5.4].

## Cuándo usarlo

- El producto se entiende viéndolo funcionar: utensilios, accesorios, belleza, hogar [propuesta].
- Tiene varios usos o beneficios que se pueden mostrar, y el cliente los confirma [propuesta].
- Cuando no hay rostro ni se quiere usar avatar, o el cliente pide que no aparezcan personas [propuesta].
- Público tibio o caliente que ya conoce el problema y quiere ver el producto de cerca [propuesta].

## Cuándo no

- Si el beneficio no se ve (suplementos cuyo efecto es interno): mejor objeto parlante, podcast o historia [propuesta].
- Si el cliente no tiene fotos reales del producto: sin ellas el envase se inventa y se nota [base §3.1, errores típicos].
- Público frío que todavía no reconoce el problema: ahí va una historia [método §3.1].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–3 s | Impacto | El producto en primer plano haciendo su uso más llamativo, con un rótulo corto | [método §3.2][propuesta] |
| 3–7 s | Bajada | La situación incómoda que resuelve, vista sin personas: el objeto o el lugar del problema | [método §3.2][propuesta] |
| 7–11 s | Refuerzo | Lo que se usa normalmente y no sirve, al lado del producto | [método §3.2][propuesta] |
| 11–23 s | Subida | Tres usos del producto, uno por escena de 4 s, con el nombre de cada uso en pantalla | [método §5.4][propuesta] |
| 23–28 s | CTA | El producto quieto, de frente, con la oferta local. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [base §1][método §9.1][regla de Reditus] |

Los segundos son una propuesta; el orden sale de la montaña rusa [método §3.2].

## Reglas visuales

- Solo el producto: sin rostros ni personas a cámara. Si un uso necesita una mano, entra solo la mano y no tapa la etiqueta [propuesta].
- Toda escena parte de la foto real del producto; tamaño proporcional y coherente entre escenas, etiqueta sin alterar [método §5.4].
- Un estímulo cada 3 s como máximo: cambio de uso, de ángulo o de rótulo [método §7].
- Zoom in lento o giro corto, enfocando el producto en todo momento [método §7].
- Fondo del contexto real de uso (cocina, baño, bolso), no fondo de estudio vacío [propuesta].
- Texto en pantalla: el nombre de cada uso, máximo 4 palabras [propuesta].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus].

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Usos del producto 9:16 | DURACIÓN: 28 s | CLIENTE: {{cliente}}

PASO 1 · IMPACTO (0–3 s) · solo el producto: "[El uso más llamativo de {{producto}}, en una frase]"
   PRODUCTO EN PANTALLA: {{producto}} real, en primer plano, desde este paso y durante todo el video
PASO 2 · BAJADA (3–7 s): "Porque {{dolor}} pasa todos los días."
PASO 3 · REFUERZO (7–11 s): "Y [lo que se usa normalmente] no lo resuelve."
PASO 4 · SUBIDA (11–23 s) · un uso por escena: "Uso 1: [uso confirmado por el cliente]. Uso 2: [uso confirmado]. Uso 3: [uso confirmado]. {{beneficio}}."
PASO 5 · CTA (23–28 s) · producto de frente: "{{oferta}}. Pídelo en el enlace."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

TEXTO EN PANTALLA: el nombre de cada uso, máximo 4 palabras
MÚSICA: ritmo constante, con golpe en cada cambio de uso
PERSONAS: ninguna a cámara; solo manos si el uso lo exige
```

## Prompts para modelo de video

### Escena 1 · Impacto

```text
IMAGEN: {{producto}} (foto real) en primer plano sobre [superficie del contexto de uso], haciendo [su uso más llamativo], tamaño proporcional y coherente, etiqueta sin alterar.
MOVIMIENTO: zoom in lento, enfocando el producto en todo momento.
SIN PERSONAS A CÁMARA. SIN DIÁLOGO: la voz es narración aparte.
FORMATO: 9:16, 4 s
```

### Escena 2 · Bajada

```text
IMAGEN: [el objeto o el lugar donde ocurre el problema], sin personas, luz natural, mismo ambiente de la escena 1.
MOVIMIENTO: cámara de izquierda a derecha, lento.
SIN DIÁLOGO.
FORMATO: 9:16, 4 s
```

### Escena 3 · Refuerzo

```text
IMAGEN: [lo que se usa normalmente y no sirve] a un lado y {{producto}} (foto real) al otro, misma superficie, etiqueta sin alterar.
MOVIMIENTO: la cámara pasa de la alternativa al producto.
SIN PERSONAS A CÁMARA. SIN DIÁLOGO.
FORMATO: 9:16, 4 s
```

### Escena 4 · Subida (repetir por cada uso)

```text
IMAGEN: {{producto}} (foto real) en uso: [uso confirmado por el cliente], en [contexto real de ese uso]. Si hace falta, entra solo una mano, sin tapar la etiqueta. Tamaño proporcional y coherente.
MOVIMIENTO: fotograma inicial con el producto quieto, fotograma final con el uso completo; mismo fondo en ambos.
SIN ROSTROS. SIN DIÁLOGO.
FORMATO: 9:16, 4 s. Espacio libre arriba para el nombre del uso.
```

### Escena 5 · CTA

```text
IMAGEN: {{producto}} (foto real) de frente, centrado, en [contexto de uso], luz de día.
MOVIMIENTO: zoom out lento, enfocando el producto en todo momento.
FORMATO: 9:16, 5 s. Espacio libre abajo para el rótulo de la oferta.
```

### Voz narradora (opcional)

```text
VOZ: [mujer/hombre de N años], tono cercano, [gentilicio y ciudad de {{pais}}].
TEXTO: el guion completo, con comas en lugar de puntos.
```

### Cierre · oferta y llamado a la acción

```text
IMAGEN: {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) [en una mano / sobre una superficie limpia], fondo sencillo, con el tercio superior libre para el rótulo.
MOVIMIENTO: acercamiento lento; el producto queda quieto al final.
RÓTULO FINAL (lo pone el editor o el servidor, no el modelo de video): {{oferta}} · {{llamado}}
VOZ: "[la oferta y el llamado a la acción, con las palabras que dio el cliente]"
DURACIÓN: mínimo 5 s · 9:16
```
