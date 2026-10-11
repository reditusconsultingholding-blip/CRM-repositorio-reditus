import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Destino del enlace del correo de recuperación. Supabase puede mandar un
// `code` (flujo PKCE) o un `token_hash` (si la plantilla del correo se
// cambió a ese formato); se aceptan los dos. Con la sesión abierta, la
// persona pasa a escribir su contraseña nueva.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "recovery") as EmailOtpType;

  const destino = url.clone();
  destino.search = "";

  const supabase = await createClient();
  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }

  if (ok) {
    destino.pathname = "/login/nueva";
    return NextResponse.redirect(destino);
  }
  destino.pathname = "/login";
  destino.searchParams.set("aviso", "enlace");
  return NextResponse.redirect(destino);
}
