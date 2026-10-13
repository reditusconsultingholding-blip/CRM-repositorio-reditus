import { cargarMaestria, requireMaestria } from "@/lib/negociacion-server";
import { Card, CardContent } from "@/components/ui/card";
import { Maestria } from "@/components/maestria/maestria";

export const dynamic = "force-dynamic";
export const metadata = { title: "Maestría en negociación · Reditus" };
// Calificar una sesión larga puede tardar más que una petición normal.
export const maxDuration = 120;

// Sección privada: no está en el menú lateral. Se abre desde Configuración
// (/perfil) y solo la ve el CEO.
export default async function MaestriaPage() {
  const profile = await requireMaestria();
  const datos = await cargarMaestria(profile.id);
  const iaActiva = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Maestría en negociación</h1>
        <p className="mt-1 text-sm text-muted-foreground">Visible solo para ti. Primero la explicación, después la práctica, y al final la nota.</p>
      </div>

      {!iaActiva && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
          La IA no está activada en este entorno: falta ANTHROPIC_API_KEY. Puedes leer las lecciones, pero no practicar.
        </p>
      )}

      {datos ? (
        <Maestria nombre={profile.name} progreso={datos.progreso} sesiones={datos.sesiones} iaActiva={iaActiva} />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="font-medium">Falta un paso para estrenar esta sección.</p>
            <p className="text-sm text-muted-foreground">
              Hay que crear sus tablas en la base de datos: abre Supabase → SQL Editor, pega el contenido del archivo
              supabase/migrations/0064_maestria_negociacion.sql y pulsa Run. Después recarga esta página.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
