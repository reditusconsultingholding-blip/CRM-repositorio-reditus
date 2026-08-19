import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { INGRESOS_ROLES, ADMIN_ROLES } from "@/lib/roles";

// /api/cron: Vercel Cron llama esta ruta sin sesión de usuario — la
// autenticación real la hace la propia ruta con CRON_SECRET, no el
// middleware. Sin este permiso, el middleware redirigía la petición a
// /login antes de que la ruta pudiera ejecutarse, y el cron nunca corría.
// /encuesta: el cliente abre este link sin haber iniciado sesión.
// /api/health: monitoreo externo (UptimeRobot y similares) sin sesión.
// /api/whatsapp/webhook: Meta llama esta ruta directamente, sin sesión.
const PUBLIC_PATHS = ["/login", "/api/cron", "/encuesta", "/api/health", "/api/whatsapp/webhook"];
// INGRESOS_ROLES/ADMIN_ROLES vienen de lib/roles.ts (antes eran una copia
// hardcodeada aparte, aquí mismo, que se desincronizó — directora_operativa
// ya tenía acceso en el resto de la app pero el middleware seguía
// bloqueándola en silencio antes de que la página llegara a cargar).

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
