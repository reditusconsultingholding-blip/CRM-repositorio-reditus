import { createClient } from "@supabase/supabase-js";
import { EncuestaForm } from "@/components/encuesta/encuesta-form";

export default async function EncuestaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: encuesta } = await admin
    .from("encuestas_calidad")
    .select("respondido_at, client:clients(name)")
    .eq("token", token)
    .maybeSingle<{ respondido_at: string | null; client: { name: string } | { name: string }[] | null }>();

  const clientName = encuesta ? (Array.isArray(encuesta.client) ? encuesta.client[0]?.name : encuesta.client?.name) : null;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-sm">
        <div className="mb-4 text-center">
          <p className="font-heading text-lg font-semibold" style={{ color: "#0449ae" }}>
            Reditus Consulting
          </p>
          {clientName && <p className="text-sm text-muted-foreground">Hola, {clientName} 👋</p>}
        </div>

        {!encuesta ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Este link no es válido o ya expiró. Si crees que es un error, contáctanos por WhatsApp.
          </p>
        ) : encuesta.respondido_at ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-2xl">✅</p>
            <p className="text-lg font-semibold">Ya recibimos tu respuesta</p>
            <p className="text-sm text-muted-foreground">¡Gracias por tu tiempo!</p>
          </div>
        ) : (
          <EncuestaForm token={token} />
        )}
      </div>
    </div>
  );
}
