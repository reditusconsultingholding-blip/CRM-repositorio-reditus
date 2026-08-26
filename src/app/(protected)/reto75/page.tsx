import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reto75Grid, type Reto75Dia } from "@/components/reto75/reto75-grid";
import { StartReto75Button } from "@/components/reto75/start-reto75-button";
import { Reto75DashboardButton } from "@/components/reto75/reto75-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveSync } from "@/components/live-sync";
import { Flame } from "lucide-react";

const REGLAS = [
  "Sigue una dieta a tu elección — sin comidas trampa, sin alcohol.",
  "Dos entrenamientos de 45 minutos — uno debe ser al aire libre.",
  "Toma un galón de agua (≈3.7 litros).",
  "Lee 10 páginas de un libro (no ficción / desarrollo personal, nada de audiolibros).",
  "Toma una foto de tu progreso.",
];

export default async function Reto75Page() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("reto75_runs")
    .select("id, numero_intento, fecha_inicio, estado")
    .eq("user_id", profile.id)
    .eq("estado", "activo")
    .maybeSingle();

  const { data: dias } = run
    ? await supabase
        .from("reto75_dias")
        .select(
          "id, dia_numero, fecha, dieta, entreno1, entreno2_outdoor, agua, lectura, foto_url, dieta_at, entreno1_at, entreno2_outdoor_at, agua_at, lectura_at",
        )
        .eq("run_id", run.id)
        .order("dia_numero", { ascending: true })
        .returns<Reto75Dia[]>()
    : { data: null };

  const { data: historial } = await supabase
    .from("reto75_runs")
    .select("id, numero_intento, fecha_inicio, estado")
    .eq("user_id", profile.id)
    .neq("estado", "activo")
    .order("numero_intento", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-tight">
            <Flame className="size-6 text-orange-500" />
            Reto 75 Hard
          </h1>
          <p className="text-sm text-muted-foreground">75 días, sin excepciones — si falla un día, se reinicia.</p>
        </div>
        <div className="flex items-center gap-3">
          {run && <Reto75DashboardButton dias={dias ?? []} />}
          <LiveSync tables={["reto75_dias", "reto75_runs"]} />
        </div>
      </div>

      {!run ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Las 5 reglas, todos los días durante 75 días</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ol className="flex flex-col gap-1.5 text-sm">
              {REGLAS.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-muted-foreground">{i + 1}.</span>
                  {r}
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              Si te saltas cualquiera de las 5 en un día, el intento se reinicia desde el día 1 — así es la
              regla original del reto.
            </p>
            <div>
              <StartReto75Button />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Reto75Grid run={run} dias={dias ?? []} userId={profile.id} reglas={REGLAS} />
      )}

      {historial && historial.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Intentos anteriores</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {historial.map((h) => (
              <div key={h.id} className="flex items-center justify-between border-b py-1.5 last:border-b-0">
                <span>
                  Intento #{h.numero_intento} — empezó el{" "}
                  {new Date(`${h.fecha_inicio}T12:00:00`).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                </span>
                <span
                  className={
                    h.estado === "completado"
                      ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900"
                      : "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900"
                  }
                >
                  {h.estado === "completado" ? "Completado" : "Reiniciado"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
