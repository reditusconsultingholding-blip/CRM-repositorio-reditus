# Trabajador de prospección de Reditus (versión 2)

Proceso de Node que vive en el servidor y no para nunca. Hace cuatro cosas, todas gobernadas desde el CRM (**Prospectos → Automático**):

1. **Busca** cada 6 horas tiendas que anuncian en Meta (España primero), lee su página pública (¿es Shopify?, ¿vende en el país?, producto estrella, correo de contacto) y se las entrega al CRM, que las califica y descarta las repetidas.
2. **Envía**, de uno en uno y con pausas, los correos que el CRM autoriza: primer correo, recordatorio al que no respondió, respuestas que una persona aprobó, entrega del video y sus tres seguimientos.
3. **Lee** las bandejas de Gmail y le reporta al CRM respuestas, rebotes y respuestas automáticas. El CRM clasifica: acepta el video / pregunta / no le interesa / fuera de oficina / rebote.
4. **Late**: cada minuto le avisa al CRM que sigue vivo, y cada 15 minutos le pide sincronizar la hoja de prospectos.

Hay una cuenta de Gmail por línea: **video** y **landing / CRO**. El reloj de todo es interno (no depende de tareas programadas de Windows): la tarea de Windows solo lo levanta al encender y lo relanza si se cae.

El trabajador no decide nada: **solo envía lo que el CRM le entrega**. Las reglas viven en el CRM (`src/lib/prospeccion-correo.ts`):

| Regla | Valor |
|---|---|
| Nada sale sin autorización | Una campaña solo envía si la **activó** el CEO o el gerente comercial. La entrega de un video solo sale si la pieza está terminada, el mensaje redactado y alguien de esos dos roles pulsó «Aprobar video y enviar por correo» en la ficha |
| Tope diario por cuenta (calentamiento) | 15 al día la 1.ª semana, 30 la 2.ª, 50 la 3.ª, 65 de la 4.ª en adelante. La semana 1 empieza el día del primer envío real de esa cuenta. Todo correo cuenta (también entregas, seguimientos y respuestas) |
| Correos nuevos por día | Lo que diga el panel (25 por defecto), nunca por encima del calentamiento: con 25, la cuenta envía 15 al día la primera semana y 25 desde el día 8 |
| Búsqueda | Cada 6 horas (panel). El CRM lleva ese reloj y el tope de costo por búsqueda y por día; el trabajador nunca pide más anuncios que los que el CRM autoriza |
| Recordatorio en frío | Al que no respondió el primer correo: uno a los 4 días (y, si se configura, otro a los 9), en el mismo hilo |
| Preguntas | Nunca se responden solas: el CRM deja un borrador y una persona lo aprueba en el panel |
| Pie legal | Todo correo sale con remitente, dirección, motivo y enlace de baja en un clic; además lleva las cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post` |
| Horario | Lunes a viernes, 9:00 a 18:00 **del país del lead** (si el país no se reconoce, hora de Colombia). No conoce festivos |
| Ritmo | Un correo, luego una pausa al azar de 2,5 a 5 minutos por cuenta (`config.json`) |
| Mismo destinatario | Nunca dos correos el mismo día a la misma dirección |
| Seguimientos | 2, 5 y 9 días después de la entrega. Se cortan si la persona responde, agenda en Calendly, pide no recibir más, rebota, o alguien pulsa «Detener seguimientos» |
| No volver a escribir | Quien responde «no», quien rebota y lo que esté en la lista de exclusión del CRM |
| Freno de emergencia | Botón **«Pausa total de emergencia»** en el CRM (Prospectos → Automático): desde ese momento no sale ningún correo ni se busca. La bandeja se sigue leyendo (las bajas no esperan) |

## 1. Lo que hace el dueño en cada cuenta de Gmail (una sola vez)

Esto lo hace Sebastian en persona; nadie más escribe contraseñas.

1. Entra a la cuenta de Gmail de la línea (`reditusconsultingagency@gmail.com` para video; la de landing hay que crearla).
2. Activa la **verificación en dos pasos**: https://myaccount.google.com/security → «Verificación en dos pasos».
3. Crea una **contraseña de aplicación**: https://myaccount.google.com/apppasswords → nombre «Servidor Reditus» → Google muestra 16 letras.
4. Pega esas 16 letras en el `.env` del servidor, en `GMAIL_VIDEO_APP_PASSWORD` (o `GMAIL_LANDING_APP_PASSWORD`). Se pueden pegar con o sin espacios.
5. Repite con la otra cuenta.

Una cuenta nueva (la de landing) conviene usarla a mano unos días antes de ponerla a enviar.

## 2. Instalar en el servidor

1. **Node.js 20 o superior** (`node -v`).
2. En esta carpeta: `npm install --omit=dev` (instala `nodemailer`, `imapflow` y `mailparser`).
3. Copia `.env.ejemplo` como `.env` y llénalo:

| Variable | Para qué |
|---|---|
| `CRM_URL` | Dirección del CRM, sin barra final |
| `SERVIDOR_SECRET` | El mismo secreto del CRM en Vercel (el que ya usa el trabajador de videos) |
| `MODO` | Correo: `simulacion` (no envía nada) o `real` |
| `MODO_BUSQUEDA` | Búsqueda: `simulacion` (tiendas inventadas, no gasta) o `real`. Es independiente de `MODO` |
| `APIFY_TOKEN` | Llave de Apify para leer la biblioteca de anuncios (cuesta por anuncio leído). La pega el dueño |
| `META_AD_LIBRARY_TOKEN` | Opcional. API oficial de Meta: gratis, solo sirve para España (Unión Europea). Si está, España no gasta en Apify |
| `GMAIL_VIDEO_USER`, `GMAIL_VIDEO_APP_PASSWORD` | Cuenta de la línea video |
| `GMAIL_LANDING_USER`, `GMAIL_LANDING_APP_PASSWORD` | Cuenta de la línea landing. Vacías = esa línea no envía ni lee |
| `NOMBRE_REMITENTE`, `NOMBRE_SERVIDOR`, `CARPETA_DATOS`, `APIFY_ACTOR_ANUNCIOS` | Opcionales |

4. En el CRM (Vercel) debe existir `SERVIDOR_SECRET` con el mismo valor; si no, la API responde 503. Para que la IA redacte y clasifique hace falta además `ANTHROPIC_API_KEY`; sin ella todo funciona con la plantilla y con reglas fijas.

## 3. Probar sin enviar nada

```powershell
powershell -ExecutionPolicy Bypass -File .\probar.ps1           # pruebas locales, sin CRM ni Gmail
powershell -ExecutionPolicy Bypass -File .\probar.ps1 -Acceso   # revisa .env, CRM y que Gmail acepte las cuentas (no envía)
powershell -ExecutionPolicy Bypass -File .\probar.ps1 -ConCrm   # 3 vueltas en simulación contra el CRM
```

Con `MODO=simulacion` no se abre ninguna conexión con Gmail: cada correo que «saldría» queda como archivo en `datos\simulacion\enviados\`, y la bandeja son los `.eml` que pongas en `datos\simulacion\bandeja\video\` (o `landing\`). Ojo: en simulación el CRM igual marca esos correos como enviados, así que usa una campaña de prueba.

## 4. Pasar a real y dejarlo arrancando con Windows

1. Cambia `MODO=real` en el `.env`.
2. `.\probar.ps1 -Acceso` debe decir «acceso correcto» en SMTP e IMAP de cada cuenta.
3. PowerShell **como administrador**:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar-servicio.ps1
powershell -ExecutionPolicy Bypass -File .\instalar-servicio.ps1 -Quitar   # para quitarlo
```

Crea la tarea «Reditus - Trabajador de prospeccion» (arranca al encender, cuenta SYSTEM, se relanza si se cae; un segundo proceso se cierra solo).

4. **Primera vez**: activa una campaña con tu propio correo como único lead, espera el horario, y mira que llegue, que al responder «sí» aparezca el prospecto en el CRM, y que el correo quede en «Enviados» de Gmail.

## 5. Cómo funciona por dentro

Con su propio reloj: **latido** al CRM cada minuto (se lleva las órdenes del panel; cada 5 minutos le pide además preparar las entregas de videos ya aprobados), **búsqueda** cuando el CRM dice que toca (pregunta cada 10 minutos; el CRM contesta que sí cada 6 horas y si queda presupuesto), **hoja** cada 15 minutos y una **tarea diaria** a las 6:00 (limpieza y comprobación de Gmail). La búsqueda y la hoja corren al lado: no frenan los envíos.

Una búsqueda: lee los anuncios de las frases que entrega el CRM (sin pasar del tope), junta los anuncios por tienda, le pregunta al CRM cuáles no conoce y solo esas las visita, de una en una y con pausa (Shopify bloquea si se le pide rápido). De cada una saca: plataforma, país por la moneda, producto que más empujan sus anuncios (o el más vendido), precio, antigüedad y el correo de contacto (portada, contacto o aviso legal). El teléfono solo se toma de un enlace `tel:` o de WhatsApp. Lo que no sirve se reporta con su motivo para no volver a mirarlo.

Además, cada 20 segundos da una vuelta de correo:

1. Entrega al CRM los reportes guardados (envíos, respuestas, rebotes). Si quedan reportes sin entregar, **no pide correos nuevos**.
2. Por cada cuenta cuya pausa ya pasó: confirma que Gmail acepta la cuenta, le pide al CRM **un** correo (primero entregas y seguimientos, después campañas), lo envía por SMTP y lo reporta con su `Message-ID`.
3. Cada 3 minutos lee la bandeja de entrada por IMAP: solo mensajes nuevos (por UID), en **solo lectura** (no marca como leído, no mueve, no borra). Cada mensaje se reconoce como respuesta, respuesta automática (cabeceras `Auto-Submitted`, `X-Autoreply`…) o rebote (mailer-daemon / `multipart/report`), y se reporta. Los boletines (`List-Unsubscribe`, `List-Id`) y el correo propio se ignoran. La relación con lo enviado la hace el CRM por `In-Reply-To` / `References` y, si no, por la dirección del remitente. Lo que no corresponde a ningún lead o prospecto el CRM lo descarta sin guardarlo.

Cuando algo falla:

- **CRM caído o sin red**: los reportes quedan en `datos\estado.json` y se entregan cuando vuelva. No se pierde nada.
- **Gmail rechaza la cuenta** (contraseña de aplicación revocada, etc.): esa cuenta descansa 15 minutos y reintenta; queda en el registro como ERROR. No le gasta intentos a ningún lead.
- **Gmail rechaza un correo**: vuelve a la cola del CRM; al tercer intento queda en «No se pudo enviar».
- **El proceso se cae a mitad de un envío**: al arrancar lo reporta como «incierto» y **no lo repite solo**. En el CRM aparece como «sin confirmar»: mira «Enviados» en Gmail y decide si lo devuelves a la cola.
- **Reinicio**: retoma con el estado guardado y respeta la pausa que faltaba desde el último correo.

Registro: `datos\registro\trabajador.log` (rota a los 5 MB, guarda 5). No se escribe el texto de ningún correo ni ninguna clave; las direcciones salen tapadas (`a***@tienda.com`).

`datos\estado.json` guarda la marca de lectura de cada bandeja y los reportes pendientes (estos sí llevan el texto de la respuesta hasta que se entregan). Si se borra, la próxima lectura mira los últimos 2 días de la bandeja; el CRM no duplica respuestas ya registradas.

## 6. Qué se verificó de Gmail y qué no

Revisado el 12-oct-2026 contra la ayuda oficial de Google, **sin iniciar sesión en ninguna cuenta ni enviar nada**:

| Punto | Estado | Fuente |
|---|---|---|
| Las contraseñas de aplicación exigen verificación en dos pasos | Confirmado | support.google.com/accounts/answer/185833 |
| No aparece la opción si la cuenta usa solo llaves de seguridad, es de trabajo/escuela (lo decide el administrador) o tiene Protección avanzada | Confirmado | misma página |
| Cambiar la contraseña de la cuenta de Google **revoca** las contraseñas de aplicación (hay que crear otra y actualizar el `.env`) | Confirmado | misma página |
| IMAP está siempre activo en Gmail; desde enero de 2025 ya no existe el interruptor para activarlo | Confirmado | support.google.com/mail/answer/7126229 |
| Servidores: `imap.gmail.com:993` con SSL; `smtp.gmail.com` puerto 465 (SSL) o 587 (TLS) | Confirmado | developers.google.com/workspace/gmail/imap/imap-smtp |
| Una sesión IMAP dura como máximo ~24 horas (el trabajador abre una conexión corta en cada lectura, no le afecta) | Confirmado | misma página |
| Límite de envío de una cuenta personal: 500 correos al día / 500 destinatarios por mensaje; al pasarse, el envío se suspende de 1 a 24 horas | Confirmado | support.google.com/mail/answer/22839 |
| Muchos rebotes también pueden bloquear el envío por 24 horas | Confirmado | misma página |
| Google recomienda «Acceder con Google» (OAuth) y dice que las contraseñas de aplicación «no se recomiendan» | Confirmado: es una advertencia, no una prohibición. Si algún día las retira habrá que pasar a OAuth | support.google.com/mail/answer/7126229 |
| Si el límite de 500 aplica igual al envío por SMTP con contraseña de aplicación | **Sin confirmar**: la página no distingue. El tope del CRM (65) queda muy por debajo | — |
| Que Gmail conserve el `Message-ID` que pone el trabajador y guarde copia en «Enviados» al enviar por SMTP | **Sin confirmar** con una cuenta real. Si lo cambiara, las respuestas igual se ligan por la dirección del remitente | — |
| Que las respuestas que Gmail mande a Spam se lean | **No se leen**: el trabajador solo mira la bandeja de entrada. Revisa Spam a mano de vez en cuando | — |
| Umbral exacto a partir del cual Gmail marca una cuenta nueva por correo en frío | **No existe un número oficial**. El calentamiento 15 → 30 → 50 → 65 es prudencia, no una garantía | — |

**La búsqueda real tampoco se ha estrenado:** ni Apify ni la API de Meta se han llamado desde este trabajador (solo la versión simulada). Los nombres de campo del actor de Apify cambian entre versiones; `lib/buscar.js` acepta las variantes conocidas, pero la primera corrida real hay que mirarla en el registro (`[búsqueda]`) con un tope pequeño. El precio por anuncio que usa el panel (5 USD por 1.000) es una referencia sin verificar; si Apify informa el costo real de la corrida, se usa ese.

**Nunca se ha ejecutado contra una cuenta real de Gmail.** Lo probado es el recorrido completo en simulación contra el CRM. El primer envío real es código sin estrenar en ese tramo (inicio de sesión SMTP/IMAP): hazlo con tu propio correo como lead.

## 7. Archivos

- `trabajador.js` — el ciclo y los relojes internos. `--comprobar`, `--ciclos N`.
- `lib/buscar.js` — búsqueda de anuncios (Apify, API oficial de Meta o simulada) y agrupación por tienda.
- `lib/tienda.js` — lectura de la página pública de una tienda.
- `simulacion/` — tiendas y anuncios inventados (dominios example.com) para `MODO_BUSQUEDA=simulacion`.
- `lib/correo.js` — SMTP e IMAP reales, y su versión simulada.
- `lib/analizar.js` — reconoce respuesta / automática / rebote.
- `lib/crm.js` — llamadas a `/api/servidor/prospeccion/**`. El contrato está en el CRM: `src/app/api/servidor/prospeccion/pendientes-envio/route.ts`.
- `lib/entorno.js`, `lib/registro.js`, `config.json`, `pruebas/pruebas.js`.
