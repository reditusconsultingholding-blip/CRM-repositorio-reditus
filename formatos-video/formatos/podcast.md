---
slug: podcast
nombre: Podcast
estado: confirmado
confianza: alta. La base de Antonio y la skill del colega coinciden en lo esencial; la del colega trae la estructura fina.
para_que_sirve: Parece un momento recortado de un podcast real. Dos personas conversan frente a micrófonos y el producto sale como recomendación entre amigos. Sirve para temas sensibles porque todo se dice en primera persona.
duracion: 25–45 s
relacion_aspecto: "9:16"
etapa_embudo: TOFU y MOFU
necesita: [fotos reales del producto para el B-roll, palabras reales con que el público describe su problema, objeción principal, un dato real de prueba, dónde se consigue, cómo son los dos anfitriones]
producto_en_pantalla: Paso 4 · Subida: toma real del producto superpuesta en edición cuando se lo nombra (sin tapar más de un tercio del cuadro). Los anfitriones no lo sostienen
cierre: Paso 5 obligatorio (mínimo 5 s): después del remate de la conversación va una placa con el producto real y la oferta en texto grande; una voz dice la oferta y el llamado a la acción
riesgos: [credenciales inventadas que Meta bloquea, mirar a cámara, repartir la conversación por mitades, recomendar antes de contar la historia, generar un clip por cada línea]
modelo_imagen: GPT Image 2.5 o Nano Banana para la imagen de cada anfitrión
modelo_video: Gemini Omni Flash desde el primer fotograma (la skill no fija modelo; con Omni cada generación es de 10 s como máximo)
modelo_voz: la del propio clip; texto a voz solo para parchar una sílaba
modelo_musica: sin música en los clips
duracion_clip: 5 a 15 s por generación; 4 a 6 de diálogo más 2 de reacciones mudas
audio_del_clip: con audio
fuentes: [skills del colega · anuncios-podcast, base §3.5, método §5.2, método §6, método §8]
---

## Qué es

Clip vertical de dos anfitriones que se miran entre sí, nunca al lente, en un espacio de casa y no en un estudio [colega: anuncios-podcast][base §3.5]. Uno pregunta (A) y el otro cuenta su experiencia (B), que se lleva cerca de dos tercios de las palabras [colega: anuncios-podcast].

Diferencias con la base de Antonio, que para este formato cede ante la versión más detallada:

- Antonio usa un solo especialista y cierra con CTA mirando a cámara [método §6, §9.1]. Aquí son dos voces y el CTA es **indirecto**: A pregunta dónde se consigue, B responde y A decide actuar. Precio y urgencia van en subtítulos o en el texto del anuncio.
- Antonio pone el producto en la mesa o en la mano. Aquí el producto no está en el set: entra como toma real superpuesta. Se mantiene la regla de Reditus de que el producto real se vea en el paso 4.

Se conserva de Antonio: sin logos ni set producido, y nunca «soy el doctor…» [método §6, §8].

## Cuándo usarlo

- Categorías sensibles (peso, salud, dinero) y productos que necesitan explicación [colega: anuncios-podcast][base §3.5].
- Para convertir un guion ganador de otro formato en conversación [colega: anuncios-podcast].

## Cuándo no

- Si el cliente exige CTA directo, precio u oferta dichos en voz [colega: anuncios-podcast].
- Liquidaciones y ofertas de impulso [propuesta].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–4 s | Impacto | A entra en frío, a mitad de conversación, sin saludo | [colega: anuncios-podcast] |
| 4–12 s | Bajada | A sitúa el problema; B se reconoce en él | [colega: anuncios-podcast][método §3.2] |
| 12–18 s | Refuerzo | B cuenta lo que entendió tarde: por qué lo que hacía no servía | [colega: anuncios-podcast] |
| 18–32 s | Subida | B nombra el producto de pasada (nunca antes del segundo 15); A pone la objeción, B la responde con un dato real | [colega: anuncios-podcast] |
| 32–40 s | CTA | A pregunta dónde se consigue, B responde, A dice que lo va a pedir. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [colega: anuncios-podcast][regla de Reditus] |

## Reglas visuales

- Entre 75 y 135 palabras en total; turnos cortos, una sola idea por línea [colega: anuncios-podcast].
- Se genera por anfitrión, no por línea: varias líneas del mismo anfitrión en una generación, y aparte dos clips de reacciones mudas para los cortes [colega: anuncios-podcast].
- La descripción de cada voz (acento, velocidad, cercanía al micrófono, intención) se repite idéntica en cada generación; B habla más grave y pausado [colega: anuncios-podcast][método §5.4].
- Cámara fija; del pecho hacia arriba; anfitriones de edad parecida pero rasgos y ropa claramente distintos [colega: anuncios-podcast].
- Sin saludos, sin hablarle al espectador, sin dos beneficios en la misma línea [colega: anuncios-podcast].
- Subtítulos palabra por palabra y título del gancho, en edición [colega: anuncios-podcast][método §8].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus]. La skill del colega deja precio y urgencia fuera del diálogo; aquí manda la regla de Reditus: van en la placa final, dichos por una voz en off.

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Podcast de dos voces 9:16 | DURACIÓN: 40 s | CLIENTE: {{cliente}}
ANFITRIÓN A (pregunta): [quién es] · ANFITRIÓN B (cuenta): [quién es]

PASO 1 · IMPACTO (0–4 s) · A: "Espera, ¿tú también [situación de {{dolor}}]?"
PASO 2 · BAJADA (4–12 s) · A: "[Sitúa el problema]." · B: "[Se reconoce, con un detalle concreto]."
PASO 3 · REFUERZO (12–18 s) · B: "[Lo que entendió tarde: por qué lo que hacía no servía]."
PASO 4 · SUBIDA (18–32 s) · B: "Empecé con {{producto}}. {{beneficio}}." · A: "[Objeción]." · B: "[Respuesta con un dato real que dio el cliente]."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (32–40 s) · A: "¿Y dónde lo consigo?" · B: "[Dónde]." · A: "Lo pido hoy."   SUBTÍTULO: {{oferta}}
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

REPARTO DE PALABRAS: A cerca de un tercio, B cerca de dos tercios
```

## Prompts para modelo de video

### Imagen de cada anfitrión

```text
[Mujer/hombre] de [edad] años con rasgos de {{pais}}, del pecho hacia arriba, sentado frente a un micrófono de podcast, mirando hacia [la derecha / la izquierda] del cuadro, sala de casa con luz cálida, ropa [distinta a la del otro anfitrión], piel con textura real, formato 9:16.
Evitar: logos, set de televisión, texto, mirada al lente.
```

### Generación de diálogo · anfitrión A

```text
PRIMER FOTOGRAMA: imagen del anfitrión A. Cámara fija.
VOZ: [acento de {{pais}}, velocidad, cerca del micrófono, intención]. Idéntica en todas sus generaciones.
LÍNEAS, con su actuación: "[línea 1]" (se inclina) · "[línea 2]" (se ríe) · "[línea 3]"
DURACIÓN: 10 s · 9:16 · con audio, sin música.
```

### Generación de diálogo · anfitrión B

```text
PRIMER FOTOGRAMA: imagen del anfitrión B. Cámara fija.
VOZ: [más grave y pausada que A]. Idéntica en todas sus generaciones.
LÍNEAS, con su actuación: "[línea 1]" · "[línea 2]" · "[línea 3]"
DURACIÓN: 10 s · 9:16 · con audio, sin música.
```

### Reacciones mudas

```text
PRIMER FOTOGRAMA: imagen del anfitrión [A / B]. Cámara fija.
ACCIÓN: escucha, asiente, levanta las cejas, sonríe. Boca cerrada todo el tiempo.
DURACIÓN: 8 s · 9:16 · sin diálogo.
```

### Toma real del producto (se superpone en el paso 4)

```text
IMAGEN: {{producto}} (foto real, etiqueta sin alterar) en [contexto de uso cotidiano], una mano lo toma.
MOVIMIENTO: acercamiento lento. Sin texto.
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
