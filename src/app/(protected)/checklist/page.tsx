import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";
import { ChecklistToday } from "@/components/checklist/checklist-today";
import { ChecklistAdmin } from "@/components/checklist/checklist-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks } from "lucide-react";

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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Administrar checklist por rol</CardTitle>
          </CardHeader>
          <CardContent>
            <ChecklistAdmin itemsPorRol={itemsPorRol} roles={roles} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
