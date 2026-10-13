import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { ES_COLA_DE_PRUEBA, RAIZ_COLA } from "@/lib/cola-raiz";
import { BUCKET_TRABAJOS } from "@/lib/trabajos-video";
import { CONFIG_VIDEOS_BASE, leerConfigVideos, type ConfigVideos } from "@/lib/videos-config";

// La configuración de «Crear video» vive en el bucket privado `trabajos`
// (`config/videos.json`): no hay tabla. Se recuerda unos segundos por proceso
// porque se consulta en cada paso de cada proyecto.

type Admin = ReturnType<typeof createAdminClient>;

const RUTA = ES_COLA_DE_PRUEBA ? `${RAIZ_COLA}-config/videos.json` : "config/videos.json";
const VIGENCIA_MS = 20_000;
let recordada: { valor: ConfigVideos; hasta: number } | null = null;

export async function leerConfig(admin: Admin): Promise<ConfigVideos> {
  void admin;
  if (recordada && recordada.hasta > Date.now()) return recordada.valor;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let valor = CONFIG_VIDEOS_BASE;
  if (base && llave) {
    try {
      const res = await fetch(`${base}/storage/v1/object/${BUCKET_TRABAJOS}/${RUTA}?sinCache=${Date.now()}`, {
        headers: { authorization: `Bearer ${llave}`, apikey: llave },
        cache: "no-store",
      });
      if (res.ok) valor = leerConfigVideos(await res.json());
    } catch {
      /* sin configuración guardada valen los valores por defecto */
    }
  }
  recordada = { valor, hasta: Date.now() + VIGENCIA_MS };
  return valor;
}

export async function escribirConfig(admin: Admin, c: ConfigVideos): Promise<{ error?: string }> {
  const { data } = await admin.storage.getBucket(BUCKET_TRABAJOS);
  if (!data) {
    const { error: e } = await admin.storage.createBucket(BUCKET_TRABAJOS, { public: false });
    if (e && !/already exists|duplicate/i.test(e.message)) return { error: `No se pudo preparar el almacenamiento: ${e.message}` };
  }
  const { error } = await admin.storage.from(BUCKET_TRABAJOS).upload(RUTA, JSON.stringify(c, null, 1), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) return { error: `No se pudo guardar la configuración: ${error.message}` };
  recordada = { valor: c, hasta: Date.now() + VIGENCIA_MS };
  return {};
}
