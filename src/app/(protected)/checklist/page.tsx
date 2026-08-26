import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";
import { ChecklistToday } from "@/components/checklist/checklist-today";
import { ChecklistAdmin } from "@/components/checklist/checklist-admin";
import { ChecklistCumplimiento, type CumplimientoRow } from "@/components/checklist/checklist-cumplimiento";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks } from "lucide-react";

function diasAtras(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function ChecklistPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: misItems } = await supabase
    .from("checklist_items")
    .select("id, texto")
    .eq("role", profile.role)
    .eq("activo", true)
    .order("orden", { ascending: true });

  const { data: misMarcas } = await supabase
    .from("checklist_marcas")
    .select("item_id")
    .eq("user_id", profile.id)
    .eq("fecha", today)
    .eq("completado", true);

  let itemsPorRol: Record<string, { id: string; role: string; texto: string; orden: number }[]> = {};
  let cumplimiento: CumplimientoRow[] = [];
  if (profile.role === "ceo") {
    const { data: todos } = await supabase
      .from("checklist_items")
      .select("id, role, texto, orden")
      .eq("activo", true)
      .order("orden", { ascending: true });
    itemsPorRol = {};
    for (const it of todos ?? []) {
      if (!itemsPorRol[it.role]) itemsPorRol[it.role] = [];
      itemsPorRol[it.role].push(it);
    }

    // Cumplimiento por persona — hoy, promedio 7 días, promedio 30 días.
    // Los días sin ninguna marca cuentan como 0%, no se saltan.
    const [{ data: personas }, { data: marcas }] = await Promise.all([
      supabase.from("users").select("id, name, role").eq("active", true).neq("role", "ceo").order("name"),
      supabase
        .from("checklist_marcas")
        .select("user_id, fecha")
        .eq("completado", true)
        .gte("fecha", diasAtras(29)),
    ]);

    const marcasPorUsuarioFecha = new Map<string, number>();
    for (const m of marcas ?? []) {
      const key = `${m.user_id}:${m.fecha}`;
      marcasPorUsuarioFecha.set(key, (marcasPorUsuarioFecha.get(key) ?? 0) + 1);
    }

    function promedioPorcentaje(userId: string, itemCount: number, dias: number) {
      if (itemCount === 0) return null;
      let suma = 0;
      for (let i = 0; i < dias; i++) {
        const fecha = diasAtras(i);
        const hechos = marcasPorUsuarioFecha.get(`${userId}:${fecha}`) ?? 0;
        suma += Math.min(hechos / itemCount, 1);
      }
      return Math.round((suma / dias) * 100);
    }

    cumplimiento = (personas ?? []).map((p) => {
      const itemCount = itemsPorRol[p.role]?.length ?? 0;
      return {
        userId: p.id,
        nombre: p.name,
        role: p.role,
        roleLabel: ROLE_LABELS[p.role as UserRole] ?? p.role,
        hoy: promedioPorcentaje(p.id, itemCount, 1),
        semana: promedioPorcentaje(p.id, itemCount, 7),
        mes: promedioPorcentaje(p.id, itemCount, 30),
      };
    });
  }

  const roles = (Object.keys(ROLE_LABELS) as UserRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-tight">
          <ListChecks className="size-6" />
          Checklist
        </h1>
        <p className="text-sm text-muted-foreground">Tus tareas de todos los días laborales, para que no se te olvide ninguna.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hoy — {ROLE_LABELS[profile.role]}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChecklistToday items={misItems ?? []} marcadosIniciales={(misMarcas ?? []).map((m) => m.item_id)} />
        </CardContent>
      </Card>

      {profile.role === "ceo" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cumplimiento del equipo</CardTitle>
            </CardHeader>
            <CardContent>
              <ChecklistCumplimiento rows={cumplimiento} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Administrar checklist por rol</CardTitle>
            </CardHeader>
            <CardContent>
              <ChecklistAdmin itemsPorRol={itemsPorRol} roles={roles} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
