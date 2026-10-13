---
slug: esqueleto
nombre: Esqueleto
estado: confirmado
confianza: alta. Confirmado con la skill del colega; no está en la base de Antonio. La interpretación anterior («qué pasa por dentro») era solo una de sus variantes.
para_que_sirve: Un esqueleto simpático vive una progresión contada en segunda persona («Día 1… Día 7… Día 30») hasta un triunfo o un desastre. Muestra lo que se acumula con el tiempo.
duracion: 30–60 s
relacion_aspecto: "9:16"
etapa_embudo: TOFU y MOFU
necesita: [foto real del envase, dolor y beneficio principal, plazos reales que confirme el cliente, país e idioma, oferta]
producto_en_pantalla: Paso 4 · Subida: el giro hacia el producto real, que el esqueleto usa en escena; se cierra con el producto en mano en el paso 5
cierre: Paso 5 obligatorio (mínimo 5 s): el cierre corta el estilo del video y muestra el producto real con la oferta en texto grande; la voz dice la oferta y el llamado a la acción
riesgos: [empezar en «Día 1» sin gancho, plazos irreales, afirmaciones abstractas, cambiar el diseño del esqueleto entre tomas, claims de salud sin el aviso legal]
modelo_imagen: Nano Banana o GPT Image con una imagen maestra de cuerpo entero como referencia
modelo_video: Kling (clips de 5 o 10 s); alternativas Seedance y Veo
modelo_voz: ElevenLabs con una sola voz
modelo_musica: cama tensa que sube al final; la skill no fija herramienta
duracion_clip: 5 o 10 s; una toma por línea
audio_del_clip: sin diálogo en el clip; la voz va aparte
fuentes: [skills del colega · anuncios-skeleton-ads, método §3.2, método §8, base §1]
---

## Qué es

Un esqueleto 3D de proporciones adultas, hueso color marfil y ojos grandes y expresivos, simpático y nunca tétrico, dentro de escenarios 3D cálidos de aspecto realista [colega: anuncios-skeleton-ads]. Una voz le habla al espectador de «tú» y marca etapas de tiempo, cantidad o nivel.

Variantes del personaje [colega: anuncios-skeleton-ads]: desnudo (por defecto), vestido (moda o época), cuerpo translúcido con órganos iluminados (suplementos y salud), versión caricaturesca (solo marcas juguetonas), cristal y resina ámbar (belleza y lujo).

## Cuándo usarlo

- Beneficios que se acumulan con el uso, o problemas que empeoran si no se hace nada [colega: anuncios-skeleton-ads].
- Formas viejas de resolver algo que ya no dan más, o escenarios de «¿qué pasaría si…?» [colega: anuncios-skeleton-ads].

## Cuándo no

- Si el cliente no puede confirmar plazos: no se inventan [base §1].
- Promesas de curar o tratar: el gancho es una pregunta y sin credenciales [método §8].

## Estructura escena por escena

| Tiempo | Escena | Qué pasa | Fuente |
|---|---|---|---|
| 0–4 s | Impacto | Siempre una pregunta gancho, antes de cualquier «Día 1» | [colega: anuncios-skeleton-ads][método §3.2] |
| 4–14 s | Bajada | Primeras etapas: una imagen física por momento | [colega: anuncios-skeleton-ads] |
| 14–24 s | Refuerzo | La escalada: sube lo que está en juego, con una pequeña intriga entre momentos | [colega: anuncios-skeleton-ads] |
| 24–36 s | Subida | El giro: entra el producto y la progresión cambia de rumbo | [colega: anuncios-skeleton-ads] |
| 36–44 s | CTA | Cierre en triunfo (o en lo que pasa sin el producto) y oferta, sin gritar. Cierre obligatorio: oferta dicha y escrita en grande, llamado a la acción y producto real en pantalla | [colega: anuncios-skeleton-ads][regla de Reditus] |

## Reglas visuales

- Entre 5 y 7 momentos y de 110 a 160 palabras; en presente y en segunda persona [colega: anuncios-skeleton-ads].
- Consistencia en tres capas: ficha fija en cada prompt, una imagen maestra de cuerpo entero dentro del mundo del anuncio, y cada toma referenciada a esa maestra, no a la toma anterior [colega: anuncios-skeleton-ads].
- La imagen maestra nunca va sobre fondo blanco [colega: anuncios-skeleton-ads].
- Se varían los planos; no se repite el mismo encuadre [colega: anuncios-skeleton-ads].
- B-roll de mecanismo como animación semitransparente sobre fondo oscuro [colega: anuncios-skeleton-ads].
- El diálogo no va en el prompt de video; los subtítulos se ponen en edición, de dos o tres palabras [colega: anuncios-skeleton-ads].
- En suplementos, aviso legal en pantalla [colega: anuncios-skeleton-ads].
- El cierre es obligatorio y dura al menos 5 s: producto real en pantalla, oferta dicha y escrita en grande (solo lo que dio el cliente) y llamado a la acción con un verbo y el lugar donde se actúa [regla de Reditus]. En este formato el cierre tiende a diluirse: se corta el estilo y se pasa a la toma real.

## Plantilla de guion

```text
PRODUCTO: {{producto}} | PAÍS/ACENTO: {{pais}} | FORMATO: Esqueleto 9:16 | DURACIÓN: 44 s | CLIENTE: {{cliente}}
VARIANTE DEL PERSONAJE: [desnudo / vestido / translúcido / cristal / ámbar] · VOZ: narración en off, de «tú»

PASO 1 · IMPACTO (0–4 s): "¿Qué le pasa a tu cuerpo si {{dolor}} durante [plazo]?"
PASO 2 · BAJADA (4–14 s): "[Etapa 1]: [imagen física]. [Etapa 2]: [imagen física]."
PASO 3 · REFUERZO (14–24 s): "[Etapa 3]: [lo que empeora]. Y todavía falta lo peor."
PASO 4 · SUBIDA (24–36 s): "Ahora mira qué cambia con {{producto}}. [Etapa]: {{beneficio}}."
   PRODUCTO EN PANTALLA: {{producto}} real, [en mano / demostración de uso], durante este paso
PASO 5 · CTA (36–44 s): "[Etapa final que confirme el cliente]. {{oferta}}."
   OFERTA EN VOZ Y EN PANTALLA: {{oferta}}
   LLAMADO A LA ACCIÓN: {{llamado}}
   CIERRE: {{producto}} real en pantalla con la oferta en texto grande, mínimo 5 s

MARCADORES: [días / cantidades / niveles reales]
```

## Prompts para modelo de video

### Imagen maestra

```text
Esqueleto 3D de proporciones adultas, hueso color marfil, ojos grandes y expresivos, gesto amable, cuerpo entero, de pie en [lugar sencillo del mundo del anuncio], luz cálida con volumen, poca profundidad de campo, formato 9:16.
Evitar: aspecto de terror, sangre, fondo blanco, texto, logos, parecido con personajes conocidos.
```

### Toma de etapa

```text
REFERENCIA: imagen maestra.
IMAGEN: [ficha del esqueleto, completa] en [lugar], [la imagen física de esta etapa], plano [distinto al anterior].
MOVIMIENTO: una acción corta y clara.
DURACIÓN: 5 s · 9:16 · sin diálogo.
```

### Toma del giro con el producto

```text
REFERENCIAS: imagen maestra y {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional).
IMAGEN: [ficha del esqueleto, completa] toma el producto y lo usa como indicó el cliente.
MOVIMIENTO: lo levanta, lo usa, cambia de postura.
DURACIÓN: 5 s · 9:16 · sin diálogo.
```

### Toma previa al cierre

```text
REFERENCIAS: imagen maestra y {{producto}} (foto real).
IMAGEN: [ficha del esqueleto, completa] erguido, con el producto en la mano, luz más clara.
MOVIMIENTO: acercamiento lento. Espacio libre abajo para el rótulo de la oferta.
DURACIÓN: 5 s · 9:16 · sin diálogo.
```

### Cierre · oferta y llamado a la acción

```text
IMAGEN: {{producto}} (foto real, etiqueta sin alterar, tamaño proporcional) [en una mano / sobre una superficie limpia], fondo sencillo, con el tercio superior libre para el rótulo.
MOVIMIENTO: acercamiento lento; el producto queda quieto al final.
RÓTULO FINAL (lo pone el editor o el servidor, no el modelo de video): {{oferta}} · {{llamado}}
VOZ: "[la oferta y el llamado a la acción, con las palabras que dio el cliente]"
DURACIÓN: mínimo 5 s · 9:16
```
