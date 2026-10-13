---
slug: pizza
nombre: Pizza
estado: por confirmar
confianza: baja. «Pizza» no aparece en la base de Reditus ni en las clases de Antonio y no hay certeza de a qué estilo de anuncio se refiere el colega. Lo de abajo es una interpretación de trabajo.
para_que_sirve: (Interpretación) Alguien come pizza frente a la cámara mientras cuenta, como de pasada, lo que le pasó con el producto. Parece un video casual de comida y no un anuncio.
duracion: 25–35 s
relacion_aspecto: "9:16"
etapa_embudo: TOFU
necesita: [fotos reales del producto, voz con acento del país, rostro (avatar generado), comida a cuadro]
producto_en_pantalla: Paso 4 · Subida: deja la porción y toma el producto real en la mano; sigue en mano en el paso 5
cierre: Paso 5 obligatorio (mínimo 5 s): producto real en pantalla; la oferta se dice y se escribe en grande; termina con el llamado a la acción
riesgos: [la interpretación puede no ser la del colega, masticar y hablar generan bocas deformes en IA, la comida distrae del producto, puede chocar con productos de salud o dieta]
modelo_imagen: GPT Image 2.5 (propuesta de Reditus; el formato sigue por confirmar)
modelo_video: Gemini Omni Flash con audio nativo (propuesta de Reditus)
modelo_voz: la del propio clip
modelo_musica: en edición
duracion_clip: clips de 8 s; el mordisco va en un clip aparte de 3 s
audio_del_clip: con audio
fuentes: [método §1, método §6, base §3.1]
---

## Qué es

**Por confirmar con el colega.** No hay fuente que defina «pizza» como formato.

Interpretación elegida para dejar el formato usable: «charla comiendo». Una persona sentada con una pizza delante le da un mordisco y, mientras come, cuenta su problema y cómo lo resolvió. La comida es el gancho visual; el guion es un UGC [base §3.1].

Otras lecturas posibles, que hay que descartar o confirmar:
1. Un personaje de comida que habla (sería una variante de `objeto-parlante`).
2. Un video «satisfactorio» de preparar o cortar pizza con el mensaje encima, tipo ASMR [método §6 solo menciona ASMR por nombre].
3. Una analogía: el problema explicado con porciones de pizza.

Cuando lleguen los repositorios del colega, este archivo se reemplaza y el estado pasa a `confirmado`.

## Cuándo usarlo

- Como prueba de hook visual en un lote: algo que no parece anuncio en el primer segundo [propuesta; coherente con «lo natural vende más» de método §1].
- Productos de uso cotidiano que se cuentan como anécdota [propuesta].

## Cuándo no

- Productos de dieta, digestión o salud donde la pizza contradice el mensaje, salvo que sea justo el ángulo («me encanta la pizza, pero después…») [propuesta].
- Como única pieza de un lote: no está validado [propuesta].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–3 s | Impacto | Levanta una porción, estira el queso y suelta la frase del hook | [propuesta] sobre [método §3.2] |
| 3–10 s | Bajada | Entre bocados cuenta la consecuencia del problema | [método §3.2] |
| 10–16 s | Refuerzo | Lo que probó y no sirvió | [método §3.2] |
| 16–25 s | Subida | Deja la porción, toma el producto y cuenta cómo lo usa | [base §3.1] |
| 25–31 s | CTA | Oferta local mirando a cámara. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [método §9.1][regla de Reditus] |

## Reglas visuales

- Todas las reglas del UGC: celular, luz natural, piel real, mirada al frente [base §3.1][método §4.1].
- Nunca hablar con la boca llena en el clip generado: mordisco en un clip sin diálogo, frase en otro [propuesta, por el riesgo de bocas deformes de método §9.1].
- B-roll incompleto: cortar antes del mordisco para dejar la curiosidad [método §7].
- El producto no comparte plano con la comida de forma que se confundan [propuesta].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus].

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Pizza (charla comiendo) 9:16 | DURACIÓN: 31 s | CLIENTE: {{cliente}}
ESTADO DEL FORMATO: por confirmar

PASO 1 · IMPACTO (0–3 s) · levanta la porción: "Les cuento algo mientras como, porque {{dolor}}."
PASO 2 · BAJADA (3–10 s): "Yo estaba [situación], y cada [momento] era lo mismo, [consecuencia]."
PASO 3 · REFUERZO (10–16 s): "Probé [solución que falló] y nada."
PASO 4 · SUBIDA (16–25 s) · deja la porción y toma el producto: "Hasta que probé {{producto}}. [Cómo se usa]. {{beneficio}}."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (25–31 s) · a cámara: "{{oferta}}."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

TEXTO EN PANTALLA: [frase del hook, máximo 6 palabras]
MÚSICA: ligera, de fondo
```

## Prompts para modelo de video

### Imagen base

```text
[Mujer/hombre] de [edad] años con rasgos de {{pais}}, sentado a la mesa de [su casa / una pizzería sencilla], una pizza delante, sostiene una porción cerca de la boca, grabado con un iPhone 17 Pro Max, luz natural, piel con microporos y microvellos sin suavizado, mirando al frente, formato 9:16.
Evitar: logos de marcas de comida, texto, look de comercial de restaurante.
```

### Escena 1 · Impacto (sin diálogo)

```text
IMAGEN: la imagen base aprobada.
MOVIMIENTO: levanta la porción y el queso se estira; se corta antes del mordisco.
SIN DIÁLOGO.
FORMATO: 9:16, 3 s
```

### Escena 2 · Hook y bajada

```text
IMAGEN: la imagen base con la porción en la mano, boca vacía.
GUION: "[hook y bajada, 20–24 palabras, con comas]"
ACENTO: [gentilicio y ciudad] · VOZ: [edad y timbre]
FORMATO: 9:16, 8 s
```

### Escena 3 · Refuerzo

```text
IMAGEN: la misma.
GUION: "[refuerzo, 20–24 palabras]"
ACCIÓN DURANTE: gesticula con la porción en la mano, no come mientras habla.
FORMATO: 9:16, 8 s
```

### Escena 4 · Subida y CTA

```text
IMAGEN: la persona de la imagen base sostiene {{producto}} (foto real, tamaño proporcional, etiqueta sin alterar); la pizza queda al fondo.
GUION: "[subida y CTA con {{oferta}}]"
ACCIÓN DURANTE: mira a la cámara al decir la oferta.
FORMATO: 9:16, 8 s
```

### Cierre · oferta y llamado a la acción

```text
IMAGEN: {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) [en una mano / sobre una superficie limpia], fondo sencillo, con el tercio superior libre para el rótulo.
MOVIMIENTO: acercamiento lento; el producto queda quieto al final.
RÓTULO FINAL (lo pone el editor o el servidor, no el modelo de video): {{oferta}} · {{llamado}}
VOZ: "[la oferta y el llamado a la acción, con las palabras que dio el cliente]"
DURACIÓN: mínimo 5 s · 9:16
```
