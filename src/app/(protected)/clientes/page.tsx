import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getUsdCopRate } from "@/lib/ceo-report";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtCop(n: number) {
  return `${Math.round(n).toLocaleString("es-CO")} COP`;
}

export default async function ClientesPage() {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: clients }, { data: ingresos }, { data: historicos }, usdCop] = await Promise.all([
    supabase.from("clients").select("id, name, whatsapp_number, country, tax_id").order("name"),
    supabase.from("ingresos").select("client_id, precio_final_descuento"),
    // Puede no existir todavía si la migración 0002b/histórica no se ha corrido —
    // se maneja con gracia en vez de romper la página.
    supabase.from("historical_ingresos").select("client_id, precio_usd_aprox"),
    getUsdCopRate(),
  ]);

  const rateCop = usdCop ?? 4000;

  const actualByClient = new Map<string, { total: number; count: number }>();
  for (const r of ingresos ?? []) {
    if (!r.client_id) continue;
    const cur = actualByClient.get(r.client_id) ?? { total: 0, count: 0 };
    cur.total += Number(r.precio_final_descuento ?? 0);
    cur.count += 1;
    actualByClient.set(r.client_id, cur);
  }

  const historicoByClient = new Map<string, { total: number; count: number }>();
  for (const r of historicos ?? []) {
    if (!r.client_id) continue;
    const cur = historicoByClient.get(r.client_id) ?? { total: 0, count: 0 };
    cur.total += Number(r.precio_usd_aprox ?? 0);
    cur.count += 1;
    historicoByClient.set(r.client_id, cur);
  }

  const rows = (clients ?? [])
    .map((c) => {
      const actual = actualByClient.get(c.id) ?? { total: 0, count: 0 };
      const historico = historicoByClient.get(c.id) ?? { total: 0, count: 0 };
      return {
        ...c,
        pedidosActuales: actual.count,
        gastoActual: actual.total,
        pedidosHistoricos: historico.count,
        gastoHistorico: historico.total,
        gastoTotal: actual.total + historico.total,
        pedidosTotal: actual.count + historico.count,
      };
    })
    .sort((a, b) => b.gastoTotal - a.gastoTotal);

  const granTotal = rows.reduce((s, r) => s + r.gastoTotal, 0);
  const historicoDisponible = historicos != null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Base de datos de clientes</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} clientes · {fmtUsd(granTotal)} · {fmtCop(granTotal * rateCop)} en gasto total (actual +
          histórico)
        </p>
      </div>

      {!historicoDisponible && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          El histórico 2024-2026 todavía no se ha importado — esta vista solo muestra los ingresos
          registrados directamente en la app.
        </p>
      )}

      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>País</TableHead>
              <TableHead>Pedidos (app)</TableHead>
              <TableHead>Gasto (app)</TableHead>
              <TableHead>Pedidos históricos</TableHead>
              <TableHead>Gasto histórico</TableHead>
              <TableHead>Gasto total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.whatsapp_number}</TableCell>
                <TableCell>{r.country ?? "—"}</TableCell>
                <TableCell>{r.pedidosActuales}</TableCell>
                <TableCell>{fmtUsd(r.gastoActual)}</TableCell>
                <TableCell>{r.pedidosHistoricos}</TableCell>
                <TableCell>
                  <div>{fmtUsd(r.gastoHistorico)}</div>
                  <div className="text-xs text-muted-foreground">{fmtCop(r.gastoHistorico * rateCop)}</div>
                </TableCell>
                <TableCell className="font-semibold">
                  <div>{fmtUsd(r.gastoTotal)}</div>
                  <div className="text-xs font-normal text-muted-foreground">{fmtCop(r.gastoTotal * rateCop)}</div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Todavía no hay clientes registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
