// Removes the QA fixtures created during verification.
// Run with: node --env-file=.env.local scripts/cleanup-test-data.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

await supabase.from("requerimientos").delete().eq("nombre_producto", "Video de prueba QA");
await supabase.from("ingresos").delete().eq("producto", "3 Videos creativos");
await supabase.from("clients").delete().eq("whatsapp_number", "+573001112233");

console.log("Datos de prueba eliminados.");
