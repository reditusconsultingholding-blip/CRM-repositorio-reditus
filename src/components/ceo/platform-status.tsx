"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Health = {
  ok: boolean;
  db: boolean;
  dbMs?: number;
  sentry: boolean;
  whatsapp: boolean;
  push: boolean;
  asistenteCeo: boolean;
  vozElevenlabs: boolean;
  calendly: boolean;
  checkedAt: string;
};

const ITEMS: { key: keyof Health; label: string; opcional?: boolean }[] = [
  { key: "db", label: "Base de datos (Supabase)" },
  { key: "sentry", label: "Monitoreo de errores (Sentry)" },
  { key: "asistenteCeo", label: "Asistente CEO (IA)" },
  { key: "whatsapp", label: "WhatsApp Business", opcional: true },
  { key: "push", label: "Notificaciones push", opcional: true },
  { key: "vozElevenlabs", label: "Voz natural (ElevenLabs)", opcional: true },
  { key: "calendly", label: "Calendly", opcional: true },
];

/** Chequeo real de "¿está todo bien?" para alguien no técnico — a
 * diferencia del botón de prueba de Sentry (que lanza un error a
 * propósito y asusta), este solo consulta /api/health y muestra un
 * semáforo por herramienta. */
export function PlatformStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedOnce, setCheckedOnce] = useState(false);

  async function revisar() {
    setLoading(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({
        ok: false,
        db: false,
        sentry: false,
        whatsapp: false,
        push: false,
        asistenteCeo: false,
        vozElevenlabs: false,
        calendly: false,
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
      setCheckedOnce(true);
    }
  }

  const criticos = ITEMS.filter((i) => !i.opcional);
  const criticosOk = health ? criticos.every((i) => health[i.key]) : false;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          Estado de la plataforma
        </CardTitle>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={revisar} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Revisando…" : "Revisar ahora"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!checkedOnce && (
          <p className="text-sm text-muted-foreground">
            Presiona &quot;Revisar ahora&quot; para confirmar que la base de datos y las herramientas
            conectadas están funcionando.
          </p>
        )}

        {health && (
          <>
            <p
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                criticosOk ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"
              }`}
            >
              {criticosOk
                ? "Todo en orden — la plataforma está funcionando bien."
                : "Hay algo importante fallando — revisa lo marcado en rojo abajo."}
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ITEMS.map((item) => {
                const ok = !!health[item.key];
                return (
                  <div key={item.key} className="flex items-center gap-2 text-sm">
                    {ok ? (
                      <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="size-4 shrink-0 text-red-500" />
                    )}
                    <span className={ok ? "" : "text-muted-foreground"}>
                      {item.label}
                      {item.opcional && !ok ? " (no configurado)" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Base de datos respondió en {health.dbMs ?? "—"} ms · revisado{" "}
              {new Date(health.checkedAt).toLocaleTimeString("es-CO")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
