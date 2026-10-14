# Tipografías del trabajador de videos

Las usan los subtítulos y la tarjeta de cierre. Todas tienen **licencia libre SIL Open Font License 1.1** (se pueden usar en anuncios y redistribuir con el programa; no se pueden vender solas). Texto de la licencia: https://openfontlicense.org

| Archivo | Tipografía | Dónde se usa | Autores |
|---|---|---|---|
| `Montserrat-Black.ttf` | Montserrat Black | subtítulos «impacto» | The Montserrat Project Authors |
| `Montserrat-ExtraBold.ttf` | Montserrat ExtraBold | subtítulos «karaoke», titular del cierre | The Montserrat Project Authors |
| `Montserrat-Bold.ttf` | Montserrat Bold | botón y etiqueta del cierre | The Montserrat Project Authors |
| `Montserrat-SemiBold.ttf` | Montserrat SemiBold | detalle del cierre | The Montserrat Project Authors |
| `Manrope-Bold.ttf` | Manrope Bold | subtítulos «limpio» | The Manrope Project Authors |
| `BarlowSemiCondensed-ExtraBold.ttf` | Barlow Semi Condensed ExtraBold | subtítulos «titular» | The Barlow Project Authors |
| `SpaceMono-Bold.ttf` | Space Mono Bold | subtítulos «maquina» | The Space Mono Project Authors (Colophon Foundry) |

No hay que instalarlas en Windows: el trabajador se las pasa a ffmpeg desde esta carpeta. Si falta alguna, ese texto sale con una tipografía del sistema (se ve, pero distinto).

Para cambiar una: pon aquí el archivo `.ttf` nuevo y cambia el nombre de la familia en `lib\subtitulos.js` o `lib\rotulo.js`.
