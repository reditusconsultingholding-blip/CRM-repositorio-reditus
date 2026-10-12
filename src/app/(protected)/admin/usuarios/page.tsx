import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";
import { UserRowControls } from "@/components/admin/user-row-controls";
import { SolicitudControls } from "@/components/admin/solicitud-controls";
import { ROLE_LABELS, requireProfile, type UserRole } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function UsuariosPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, role, active")
    .order("name");

  // Quien pidió acceso con Google queda desactivado y con la marca «pendiente»
  // en su cuenta; aquí se separan de los usuarios desactivados a propósito.
  const pendientes = new Set<string>();
  if (profile.role === "ceo" && (users ?? []).some((u) => !u.active)) {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    for (const c of data?.users ?? []) if (c.app_metadata?.solicitud === "pendiente") pendientes.add(c.id);
  }
  const solicitudes = (users ?? []).filter((u) => !u.active && pendientes.has(u.id));
  const equipo = (users ?? []).filter((u) => u.active || !pendientes.has(u.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <CreateUserDialog />
      </div>

      {solicitudes.length > 0 && (
        <section className="flex flex-col gap-3 rounded-md border border-primary/40 bg-primary/5 p-4">
          <div>
            <h2 className="text-base font-semibold">Solicitudes de acceso ({solicitudes.length})</h2>
            <p className="text-sm text-muted-foreground">
              Pidieron entrar con su cuenta de Google. No pueden ver nada hasta que las aceptes.
            </p>
          </div>
          {solicitudes.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
              <div className="min-w-0">
                <p className="font-medium">{u.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {u.email} · pidió: {ROLE_LABELS[u.role as UserRole] ?? u.role}
                </p>
              </div>
              <SolicitudControls userId={u.id} name={u.name} role={u.role as UserRole} />
            </div>
          ))}
        </section>
      )}

      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Rol / acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipo.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.active ? "default" : "secondary"}>
                    {u.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <UserRowControls userId={u.id} name={u.name} role={u.role as UserRole} active={u.active} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Roles disponibles: {Object.values(ROLE_LABELS).join(", ")}. Quien entra con Google sin tener cuenta elige su rol y
        aparece arriba como solicitud.
      </p>
    </div>
  );
}
