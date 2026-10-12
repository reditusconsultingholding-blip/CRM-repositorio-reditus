import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacidad · Reditus CRM" };

// Página pública: Google la pide para mostrar «Continuar con Google» a cualquier
// cuenta. Describe solo lo que el CRM hace de verdad con los datos de Google.
export default function PrivacidadPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-16 text-sm leading-relaxed">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Reditus Consulting</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Política de privacidad del CRM</h1>
      </div>
      <p>
        Reditus CRM es la herramienta interna del equipo de Reditus Consulting. Solo la usan personas del equipo que el
        administrador acepta una por una.
      </p>
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Qué datos recibimos de Google</h2>
        <p>
          Al tocar «Continuar con Google» recibimos tu correo y tu nombre, únicamente para comprobar quién eres. No
          pedimos acceso a tu Gmail, a tu Drive, a tus contactos ni a ningún otro dato de tu cuenta de Google.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Para qué los usamos</h2>
        <p>
          Para crear tu usuario dentro del CRM, mostrar tu nombre a tus compañeros y dejarte entrar sin contraseña. No
          vendemos ni compartimos estos datos con terceros, y no los usamos para publicidad.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Cómo pedir que los borremos</h2>
        <p>
          Escribe a{" "}
          <a className="underline" href="mailto:reditusconsultingholding@gmail.com">
            reditusconsultingholding@gmail.com
          </a>{" "}
          y eliminamos tu usuario y tus datos de acceso.
        </p>
      </section>
      <Link href="/login" className="text-muted-foreground underline">
        Volver al ingreso
      </Link>
    </main>
  );
}
