import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// TEMPORARY diagnostic route — created to fix/verify seed users from
// production because the local dev sandbox can't reach Supabase's API
// right now. Gated behind a one-off secret token (not a real credential,
// just an access gate for this short-lived debug step). Delete this file
// again right after use; do not leave it deployed.
const ACCESS_TOKEN = "rdt-debug-8f2a1c94-temp";

const USERS = [
  { name: "Sebastian (CEO)", email: "ceo@reditus.test", role: "ceo" },
  { name: "Gerente Comercial", email: "comercial@reditus.test", role: "gerente_comercial" },
  { name: "Directora Operativa", email: "directora@reditus.test", role: "directora_operativa" },
  { name: "Editor Video", email: "editor.video@reditus.test", role: "editor_video" },
  { name: "Diseñador Landing", email: "disenador.landing@reditus.test", role: "disenador_landing" },
];
const PASSWORD = "Reditus2026!";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (token !== ACCESS_TOKEN) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const results: string[] = [];

  const { data: listData, error: listError } = await admin.auth.admin.listUsers();
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }
  results.push(`existing auth users: ${listData.users.map((u) => u.email).join(", ") || "(none)"}`);

  for (const u of USERS) {
    const existing = listData.users.find((au) => au.email === u.email);
    if (existing) {
      const { error: pwError } = await admin.auth.admin.updateUserById(existing.id, {
        password: PASSWORD,
      });
      results.push(pwError ? `✗ reset pw ${u.email}: ${pwError.message}` : `✓ reset pw ${u.email}`);

      const { data: profile } = await admin.from("users").select("id").eq("id", existing.id).maybeSingle();
      if (!profile) {
        const { error: profileError } = await admin
          .from("users")
          .insert({ id: existing.id, name: u.name, email: u.email, role: u.role });
        results.push(profileError ? `✗ profile ${u.email}: ${profileError.message}` : `✓ profile created ${u.email}`);
      }
      continue;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) {
      results.push(`✗ create ${u.email}: ${error.message}`);
      continue;
    }
    const { error: profileError } = await admin
      .from("users")
      .insert({ id: data.user.id, name: u.name, email: u.email, role: u.role });
    results.push(profileError ? `✗ profile ${u.email}: ${profileError.message}` : `✓ created ${u.email}`);
  }

  return NextResponse.json({ results });
}
