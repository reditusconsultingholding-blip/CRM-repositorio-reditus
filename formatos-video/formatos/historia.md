---
slug: historia
nombre: Historia
estado: confirmado
confianza: media-alta. La base documenta el video «tipo historia» (TOFU) y el B-roll con narrador; el nombre exacto que usa el colega puede cubrir otra variante.
para_que_sirve: Cuenta la historia de una persona con el problema, de principio a fin, con voz narrada y escenas. Atrae público frío que todavía no busca el producto.
duracion: 35–50 s
relacion_aspecto: "9:16"
etapa_embudo: TOFU
necesita: [fotos reales del producto, voz narradora con acento del país, personaje consistente (imagen ancla), 6 a 8 escenas]
producto_en_pantalla: Paso 4 · Subida: el personaje recibe el producto real y lo usa por primera vez; producto solo en el paso 5
cierre: Paso 5 obligatorio (mínimo 5 s): el cierre corta el estilo del video y muestra el producto real con la oferta en texto grande; la voz dice la oferta y el llamado a la acción
riesgos: [personaje que cambia de cara entre escenas, historia larga sin estímulo cada 3 s, testimonio inventado presentado como real, producto que aparece demasiado tarde para BOFU]
modelo_imagen: GPT Image 2.5 con una imagen ancla del personaje (propuesta de Reditus)
modelo_video: Gemini Omni Flash de imagen a video; una escena por frase (propuesta de Reditus)
modelo_voz: ElevenLabs para la narración (propuesta de Reditus)
modelo_musica: en edición; triste al inicio y alegre desde la subida
duracion_clip: escenas de 4 s
audio_del_clip: sin audio; la voz va aparte
fuentes: [método §3.1, método §3.2, método §6, base §3.2, base §3.9]
---

## Qué es

Relato en primera o tercera persona («Ella llevaba meses sin dormir…») ilustrado con escenas generadas, una por frase. El producto puede no aparecer en buena parte del video [método §3.1]. Antonio lo arma como «B-roll con narrador»: el guion pasa por un prompt de director creativo que devuelve las escenas [método §6].

## Cuándo usarlo

- Público frío: el objetivo es que se reconozca en la historia [método §3.1].
- Problemas con carga emocional: sueño, pareja, cansancio, autoestima [método §3.2, por los ejemplos de hook].
- Cuando el lote necesita piezas de arriba del embudo: se hacen muchas TOFU y pocas BOFU [método §3.1].

## Cuándo no

- Liquidaciones y ofertas con urgencia: ahí va algo corto [método §3.1].
- Si el cliente no autoriza contar un caso: la historia debe presentarse como situación típica, no como testimonio real [propuesta, coherente con base §1].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–3 s | Impacto | La situación real, en una imagen y una frase | [método §3.2] |
| 3–12 s | Bajada | Cómo eso le fue quitando cosas: 3 escenas cortas | [método §3.2] |
| 12–20 s | Refuerzo | Lo que intentó y falló; el punto más bajo («no puedo seguir así») | [método §3.1, §3.2] |
| 20–34 s | Subida | Alguien cercano que ya lo resolvió le muestra el producto; primer uso | [método §3.1] |
| 34–42 s | CTA | Cierre suave con la oferta local. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [método §3.1][base §1][regla de Reditus] |

Segundos: [propuesta].

## Reglas visuales

- Un estímulo cada 3 s como máximo: cada escena ilustra la palabra exacta que se narra [método §7][base §3.9].
- Imagen ancla del personaje, y cada escena se genera desde la original con prompt autónomo [base §3.2][método §5.4].
- Al narrador «pónganselo fácil a la IA»: fondo neutro o pantalla verde, o solo voz [método §6].
- Música triste hasta el punto más bajo y alegre desde la subida, con transición [método §7].
- B-roll incompleto: cortar antes de que termine la acción para generar curiosidad [método §7].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus]. En este formato el cierre tiende a diluirse: se corta el estilo y se pasa a la toma real.

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Historia narrada 9:16 | DURACIÓN: 42 s | CLIENTE: {{cliente}}

PASO 1 · IMPACTO (0–3 s) · NARRADOR: "[Nombre ficticio] llevaba [tiempo] con {{dolor}}."
PASO 2 · BAJADA (3–12 s): "Primero fue [pérdida 1]. Después [pérdida 2]. Y un día [pérdida 3]."
PASO 3 · REFUERZO (12–20 s): "Probó [solución que falló]. Nada. Hasta que dijo: no puedo seguir así."
PASO 4 · SUBIDA (20–34 s): "[Persona cercana] le habló de {{producto}}. [Cómo lo usó]. {{beneficio}}."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (34–42 s): "Si te pasa lo mismo, {{oferta}}."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

TEXTO EN PANTALLA: [frase del hook, máximo 6 palabras]
MÚSICA: triste al inicio, alegre desde la subida
ESCENAS: una por frase, de 2 a 4 s cada una
```

## Prompts para modelo de video

### Imagen ancla del personaje

```text
[Mujer/hombre] de [edad] años con rasgos de {{pais}}, expresión cansada, [lugar de su casa], luz tenue de [hora], ropa cotidiana, piel con microporos y microvellos sin suavizado, plano medio, formato 9:16.
Evitar: belleza editorial, texto, logos, segunda persona.
```

### Escena 1 · Impacto

```text
IMAGEN: [descripción completa del personaje, sin decir «la misma»] en [la situación exacta del hook].
MOVIMIENTO: zoom in lento; el personaje [acción corta que no termina].
SIN DIÁLOGO. La voz es narración aparte.
FORMATO: 9:16, 4 s
```

### Escena 2 · Bajada (repetir por cada pérdida)

```text
IMAGEN: [descripción completa del personaje] en [escena que ilustra la frase exacta].
MOVIMIENTO: cámara de izquierda a derecha, lento.
SIN DIÁLOGO.
FORMATO: 9:16, 4 s
```

### Escena 3 · Refuerzo

```text
IMAGEN: [descripción completa del personaje] frente a [lo que probó y no sirvió], gesto de frustración.
MOVIMIENTO: zoom in lento al rostro.
SIN DIÁLOGO.
FORMATO: 9:16, 4 s
```

### Escena 4 · Subida

```text
IMAGEN: [descripción completa del personaje] recibe {{producto}} (foto real) de [persona cercana], tamaño proporcional y coherente, etiqueta sin alterar, luz más cálida.
MOVIMIENTO: fotograma inicial con el producto en la mesa, fotograma final con el producto en la mano; mismo fondo en ambos.
SIN DIÁLOGO.
FORMATO: 9:16, 4 s
```

### Escena 5 · CTA

```text
IMAGEN: {{producto}} (foto real) en [contexto de uso], luz de día.
MOVIMIENTO: zoom out lento, enfocando el producto en todo momento.
FORMATO: 9:16, 4 s. Espacio libre abajo para el rótulo de la oferta.
```

### Voz narradora

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
