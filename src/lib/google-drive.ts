import "server-only";
import { google } from "googleapis";

// Reditus CRM — automatización de carpetas de Drive por cliente.
//
// Requiere una Service Account de Google Cloud (no tu cuenta personal de
// Gmail) compartida con permiso de Editor sobre la carpeta "Clientes
// Reditus" — así el servidor puede crear carpetas sin que nadie tenga que
// hacer login. Variables de entorno necesarias:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  (con los \n literales, tal como
//     vienen en el JSON que descarga Google Cloud — este archivo los
//     convierte a saltos de línea reales)
//   GOOGLE_DRIVE_PARENT_FOLDER_ID  (opcional — por defecto la carpeta
//     "Clientes Reditus" que Sebastián ya compartió)
//
// Si las credenciales no están configuradas, todas las funciones de aquí
// devuelven null en vez de lanzar — crear un ingreso nunca debe fallar
// por culpa de Drive.

const DEFAULT_PARENT_FOLDER_ID = "1BAT8MqwQVMQMFBAunlNGJK4Gaiww-KvF"; // "Clientes Reditus"

const PREGUNTAS_AGENDAMIENTO = `PREGUNTAS CLAVE PARA REALIZAR UN EXCELENTE AGENDAMIENTO

Nombre comercial del producto:

Recomendaciones de ángulos de venta:

Precios del producto (Valor x1 - Valor x2 - Valor x3). Si tiene obsequios, añadirlos.

Si cuenta con alguna oferta (2x1, envío contra entrega, envío gratis u obsequios que incluya el pedido):

Métodos de pago vigentes actualmente:

Identidad Gráfica o redes sociales:
`;

const ESTRUCTURA_TECNICA = `ESTRUCTURA TÉCNICA

Información del producto/servicio
¿Qué producto o servicio vendes? Descríbelo brevemente.
¿Qué presentaciones, versiones o planes ofreces (y precios de cada uno)?
¿Qué incluye cada presentación/plan (envío, bonos, extras)?
¿Cuáles son los beneficios o características principales de tu producto/servicio?
¿Tiene algún respaldo, certificación o registro oficial (ej. INVIMA, ISO, garantías legales)?

Uso / experiencia del cliente
¿Cómo se usa, se aplica o se consume tu producto/servicio?
¿Para quién es (y para quién NO es)?
¿Hay alguna condición, restricción o cuidado especial que el cliente deba conocer antes de comprar?
¿Con qué frecuencia se usa o se repite la compra?

Logística
¿Cuáles son tus políticas de envío (cobertura, tiempos, costos)?
¿Cómo se conserva, almacena o mantiene el producto (si aplica)?
¿Cuál es tu política de garantía, cambios o devoluciones?

Preguntas frecuentes y objeciones
¿Cuáles son las 5-10 preguntas que más te hacen los clientes antes de comprar?
¿Cuáles son las objeciones o dudas más comunes que frenan la compra (precio, confianza, comparación con competencia, etc.)?
¿Qué comparaciones hacen los clientes con otras marcas o alternativas del mercado?
`;

function driveCredentialsConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

function getDriveClient() {
  if (!driveCredentialsConfigured()) return null;
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function findChildFolder(drive: ReturnType<typeof google.drive>, parentId: string, name: string) {
  const escaped = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 1,
  });
  return res.data.files?.[0] ?? null;
}

async function createFolder(drive: ReturnType<typeof google.drive>, parentId: string, name: string) {
  const res = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id, webViewLink",
  });
  return res.data;
}

async function createDoc(drive: ReturnType<typeof google.drive>, parentId: string, name: string, textContent: string) {
  await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.document", parents: [parentId] },
    media: { mimeType: "text/plain", body: textContent },
    fields: "id",
  });
}

/** Encuentra (o crea si no existe) la carpeta "Reditus x {cliente}" dentro
 * de la carpeta padre de Drive, con su subcarpeta "Recursos Gráficos" y
 * los 2 documentos plantilla — y dentro de esa carpeta, crea el siguiente
 * "Proyecto #N" consecutivo para este pedido. Devuelve los links listos
 * para pegarle al cliente, o null si Drive no está configurado o algo
 * falla (nunca debe tumbar la creación del ingreso). */
export async function getOrCreateClienteDriveFolders(
  clientName: string,
): Promise<{ clienteFolderUrl: string; proyectoFolderUrl: string } | null> {
  const drive = getDriveClient();
  if (!drive) return null;

  try {
    const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || DEFAULT_PARENT_FOLDER_ID;
    const folderName = `Reditus x ${clientName}`;

    const clienteFolder = await findChildFolder(drive, parentId, folderName);
    let clienteFolderId: string;

    if (clienteFolder?.id) {
      clienteFolderId = clienteFolder.id;
    } else {
      const created = await createFolder(drive, parentId, folderName);
      clienteFolderId = created.id!;
      await createFolder(drive, clienteFolderId, "Recursos Gráficos");
      await createDoc(drive, clienteFolderId, "Preguntas clave para realizar un excelente agendamiento", PREGUNTAS_AGENDAMIENTO);
      await createDoc(drive, clienteFolderId, "Estructura Técnica", ESTRUCTURA_TECNICA);
    }

    // Consecutivo "Proyecto #N" — busca los que ya existen y crea el siguiente.
    const existingRes = await drive.files.list({
      q: `'${clienteFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains 'Proyecto #' and trashed = false`,
      fields: "files(name)",
      pageSize: 100,
    });
    const nums = (existingRes.data.files ?? [])
      .map((f) => Number(f.name?.match(/Proyecto #(\d+)/)?.[1]))
      .filter((n) => !Number.isNaN(n));
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const proyectoFolder = await createFolder(drive, clienteFolderId, `Proyecto #${nextNum}`);

    return {
      clienteFolderUrl: `https://drive.google.com/drive/folders/${clienteFolderId}`,
      proyectoFolderUrl: `https://drive.google.com/drive/folders/${proyectoFolder.id}`,
    };
  } catch (err) {
    console.error("[google-drive] no se pudo crear la carpeta del cliente:", err);
    return null;
  }
}
