import { createClient } from "@/lib/supabase/server";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canSeeIngresos = (INGRESOS_ROLES as string[]).includes(profile.role);

  const today = new Date().toISOString().slice(0, 10);

  const [ingresosHoy, requerimientosAbiertos] = await Promise.all([
    canSeeIngresos
      ? supabase
          .from("ingresos")
          .select("precio_final_descuento", { count: "exact" })
          .eq("fecha", today)
      : Promise.resolve({ data: [], count: 0 }),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .not("estado", "in", '("ENTREGADO","Terminado")'),
  ]);

  const totalHoy =
    (ingresosHoy.data ?? []).reduce(
      (sum, r) => sum + Number(r.precio_final_descuento ?? 0),
      0,
    ) || 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Hola, {profile.name.split(" ")[0]}
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canSeeIngresos && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ingresos de hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {totalHoy.toLocaleString("es-CO", { style: "currency", currency: "USD" })}
              </p>
              <p className="text-sm text-muted-foreground">
                {ingresosHoy.count ?? 0} pedido(s) registrados hoy
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Requerimientos abiertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{requerimientosAbiertos.count ?? 0}</p>
            <p className="text-sm text-muted-foreground">En video + landing</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
