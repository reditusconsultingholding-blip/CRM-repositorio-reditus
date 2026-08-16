import "server-only";
import { createClient } from "@supabase/supabase-js";
import { computeCeoReport, formatCeoReportText } from "@/lib/ceo-report";
import { buildExtendedBusinessContext } from "@/lib/ceo-context";
import { CEO_KNOWLEDGE } from "@/lib/ceo-knowledge";
import { notify } from "@/lib/notify";

/** Genera una recomendación semanal corta y accionable para el CEO —
 * cosas que solo él puede ver/decidir (precios, riesgos de cashflow,
 * clientes en riesgo, oportunidades) — y se la manda como notificación +
 * push. Corre desde el cron de los lunes. No hace nada si
 * ANTHROPIC_API_KEY no está configurada. */
export async function sendWeeklyCeoInsight() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: ceos } = await admin.from("users").select("id").eq("role", "ceo").eq("active", true);
  if (!ceos?.length) return;

  const [report, extendedContext] = await Promise.all([computeCeoReport(), buildExtendedBusinessContext()]);
  const context = `${formatCeoReportText(report)}\n\n${extendedContext}\n\n${CEO_KNOWLEDGE}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 300,
      system:
        "Eres el asesor de negocio del CEO de Reditus Consulting. Con los datos de esta semana, da UNA sola " +
        "recomendación concreta y accionable — algo que solo el CEO puede decidir o hacer (precio, riesgo de " +
        "un cliente, una decisión de equipo, una oportunidad). Máximo 2 frases, directo, sin relleno, sin " +
        "saludos. Si todo está sano y no hay nada urgente, dilo así de corto en vez de inventar un problema.",
      messages: [{ role: "user", content: `Datos de esta semana:\n${context}` }],
    }),
  });

  if (!res.ok) return;
  const data = await res.json();
  const insight = data?.content?.find((c: { type: string }) => c.type === "text")?.text;
  if (!insight) return;

  for (const ceo of ceos) {
    await notify(admin, ceo.id, "recomendacion_ceo", `💡 Tu asesor: ${insight}`, "/ceo");
  }
}
