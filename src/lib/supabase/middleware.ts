import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/cron: Vercel Cron llama esta ruta sin sesión de usuario — la
// autenticación real la hace la propia ruta con CRON_SECRET, no el
// middleware. Sin este permiso, el middleware redirigía la petición a
// /login antes de que la ruta pudiera ejecutarse, y el cron nunca corría.
// /encuesta: el cliente abre este link sin haber iniciado sesión.
const PUBLIC_PATHS = ["/login", "/api/cron", "/encuesta"];
// Roles allowed to see /ingresos. Everyone else with a session is bounced to /requerimientos.
const INGRESOS_ROLES = ["ceo", "gerente_comercial"];
const ADMIN_ROLES = ["ceo"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && (path.startsWith("/ingresos") || path.startsWith("/admin"))) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role;
    const allowed = path.startsWith("/admin")
      ? ADMIN_ROLES.includes(role)
      : INGRESOS_ROLES.includes(role);

    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/requerimientos";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
