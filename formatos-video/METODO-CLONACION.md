# Método de clonación de un anuncio ganador

Resumen propio del método que trae la skill `clonacion-manual` del colega. Se leyó sin ejecutar nada. La idea: no se copia el anuncio, se copia **cómo está construido** (qué función cumple cada frase, cuánto dura, qué se ve) y se vuelve a construir para otro producto.

En el CRM esto existe en versión simple: **Crear video → «Clonar un anuncio ganador»** (se pega la transcripción o la descripción del anuncio y el guion nuevo sigue su estructura bloque a bloque). El análisis automático del video es el punto de extensión `analizarAnuncioReferencia()` en `src/lib/videos-server.ts`.

## Los cinco pasos

### 1. Analizar el anuncio

Se mide el video original: duración, cortes de plano, transcripción palabra por palabra con tiempos, pausas de la voz, intensidad con que se dice cada frase, si hay música o ambiente, y los textos que aparecen en pantalla. Con eso y con capturas del video, una persona (o el agente) escribe la ficha del anuncio:

- quién aparece (rol, edad aproximada, aspecto) y dónde;
- cada toma: de cuándo a cuándo, si es persona hablando o apoyo visual, qué se ve, encuadre, movimiento de cámara;
- cada frase: quién la dice, cuándo, **qué función cumple** (gancho, dolor, mecanismo, prueba, oferta…) y cómo se dice;
- los **cortes seguros**: instantes donde nadie habla y ninguna acción queda a medias.

### 2. Partir en bloques

El video se divide solo por cortes seguros, en bloques que quepan en una generación del modelo (10 s por defecto). Se busca, en este orden: menos bloques, menos segundos sobrantes y bloques parejos. Cada frase pertenece al bloque donde empieza. Si entre dos cortes seguros hay más tiempo del que admite el modelo, hay que encontrar otro corte: no se parte una frase.

### 3. Adaptar al producto

Se escribe el texto nuevo frase por frase, conservando la **función** de cada una, no sus palabras. Para cada frase se guarda cómo se escribe y cómo se pronuncia (los números, en letras). Las tomas de apoyo se replantean enteras para el producto nuevo: qué se ve, qué hace el producto, qué resultado se nota.

El texto tiene que caber en el tiempo del original. Se controla contando sílabas: en español, cerca de 7 sílabas por segundo hablado en el total y hasta 8,5 en un bloque. Si no cabe, **se acorta el texto**; nunca se pide más tiempo.

### 4. Generar por bloques

Un prompt por bloque, con todo lo que el modelo necesita: duración, formato 9:16, imágenes adjuntas (personajes, producto, y el último cuadro del bloque anterior cuando hay continuidad), reglas fijas (idioma y labios sincronizados, nada sobreimpreso, personajes idénticos, cada frase dicha solo por quien le toca), y las tomas con sus tiempos dentro del bloque, lo que se ve, la cámara y lo que se dice. Los prompts no se corrigen a mano: se corrige la ficha y se vuelven a armar.

Modelo de referencia: video con voz nativa en clips de 4, 6, 8 o 10 s a 720p (ver `MODELOS-KIE.md`).

### 5. Armar

Los clips se ponen en orden y se recortan en los silencios; si sobra, se acelera muy poco (hasta un 6 %). Subtítulos corregidos contra el guion, textos en pantalla rehechos con los datos nuevos, una sola pista de música por debajo de la voz y exportación en 1080×1920.

## Reglas de Reditus para clonar

- **No se copia texto ni marca.** Ni frases del anuncio original, ni su nombre comercial, ni sus textos en pantalla. Se toma la estructura, el ritmo y el tipo de toma. (La skill también lo exige: la marca original nunca entra al prompt.)
- **No se copia a las personas.** La skill del colega pide personajes muy parecidos a los del original y le indica al agente no detenerse en moderación ni en parecido de caras. **Reditus no sigue esa parte:** se usan personajes nuevos, con el mismo rol y perfil de comprador, sin buscar el parecido con nadie.
- **No se inventa.** Precio, cifras, plazos, testimonios y resultados salen de lo que dio el cliente; lo que falte va entre [corchetes].
- **Los cinco pasos se mantienen.** Cada bloque del anuncio de referencia se rotula con el paso de la estructura de Reditus que cumple, y el producto real se ve donde el original mostraba el suyo.
- **Solo anuncios que de verdad escalan.** La referencia sale de la investigación de mercado (tiempo activo, duplicados), no del gusto.

## Lo que hoy hace una persona y lo que hará el servidor

| Paso | Hoy en el CRM | Con el servidor |
|---|---|---|
| Analizar | La persona pega la transcripción o describe el anuncio | `analizarAnuncioReferencia()`: transcribe, detecta cortes y pausas |
| Partir en bloques | La IA propone los bloques a partir del texto pegado | Cortes seguros medidos sobre el audio |
| Adaptar | La IA escribe el guion nuevo bloque a bloque | Igual, más el control de sílabas por bloque |
| Generar | A mano, con los prompts por escena | Trabajador con el proveedor `kie` |
| Armar | A mano en el editor | Por definir |

## Qué requiere la skill original (no instalada)

Python con ffmpeg, un modelo local de transcripción de varios GB, lectura de texto en imagen y, para borrar texto quemado del video, tarjeta gráfica. Sus instrucciones de instalación modifican el equipo (copian archivos a la carpeta de skills, crean un entorno y descargan modelos): no se ejecutaron. Si algún día se quiere usar tal cual, revisar antes el permiso de uso del material y ese apartado sobre parecido de caras.
