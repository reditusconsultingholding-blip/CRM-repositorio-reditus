// One-off seed script: creates one test user per role for verification.
// Run with: node --env-file=.env.local scripts/seed.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const USERS = [
  { name: "Sebastian (CEO)", email: "ceo@reditus.test", role: "ceo" },
  { name: "Gerente Comercial", email: "comercial@reditus.test", role: "gerente_comercial" },
  { name: "Directora Operativa", email: "directora@reditus.test", role: "directora_operativa" },
  { name: "Editor Video", email: "editor.video@reditus.test", role: "editor_video" },
  { name: "Diseñador Landing", email: "disenador.landing@reditus.test", role: "disenador_landing" },
];

const PASSWORD = "Reditus2026!";

for (const u of USERS) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error) {
    console.error(`✗ ${u.email}: ${error.message}`);
    continue;
  }

  const { error: profileError } = await supabase
    .from("users")
    .insert({ id: data.user.id, name: u.name, email: u.email, role: u.role });

  if (profileError) {
    console.error(`✗ profile for ${u.email}: ${profileError.message}`);
    continue;
  }

  console.log(`✓ ${u.role.padEnd(20)} ${u.email}`);
}

console.log(`\nContraseña para todos: ${PASSWORD}`);
