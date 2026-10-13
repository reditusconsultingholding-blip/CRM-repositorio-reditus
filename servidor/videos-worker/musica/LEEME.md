# Música de fondo de los videos

Aquí van las pistas que el trabajador mezcla debajo de la voz. **Las pone el dueño**: en el repositorio no viene ninguna.

## Cómo se usa

1. Crea una carpeta por **tono**. El nombre es libre; estos son los que conoce el CRM hoy: `suspenso`, `energia`, `emotivo`, `neutro`.
2. Mete en cada una **una o varias pistas** (MP3, M4A, WAV, OGG o FLAC). Con varias, cada proyecto usa siempre la misma (se elige por su guion), y proyectos distintos se reparten entre ellas.
3. No hay que reiniciar nada: el siguiente armado ya las ve.

```
musica\
  suspenso\   tension-01.mp3   tension-02.mp3
  energia\    pop-alegre.mp3
  emotivo\    piano-suave.mp3
  neutro\     fondo-liviano.mp3
```

## Qué pista sale

- El trabajo dice el tono (`opciones.tonoMusica`). Si no lo dice, se usa `musica.tonoPorDefecto` de `config.json` (`neutro`).
- Si no hay pistas de ese tono, se usa una de `neutro` y el video lo avisa.
- Si tampoco hay, **el video sale sin música y lo avisa**. Nunca falla por esto.
- Si el trabajo trae su propia pista (un enlace en `opciones.musica`), manda esa.

## Qué pistas sirven

- Instrumentales, sin voz cantada (compite con la persona que habla).
- De 20 s o más. Si la pista es más corta que el video, se repite; si es más larga, se corta con un fundido al final.
- El volumen no importa: el trabajador las nivela solo, por debajo de la voz, y las baja más mientras alguien habla.
- **Con licencia para usarlas en anuncios pagados.** Música de un artista conocido, de una red social o bajada de YouTube no sirve: tumban el anuncio y la cuenta.

## Al actualizar el trabajador

Esta carpeta **no se reemplaza** (igual que `.env` y `datos\`). Si se pierde, los videos salen sin música hasta volver a llenarla.

Los archivos `kie-….mp3` que aparezcan aquí los generó Kie (solo si en `config.json` se encendió `musica.generarConKie`); se pueden escuchar y borrar los que no gusten.
