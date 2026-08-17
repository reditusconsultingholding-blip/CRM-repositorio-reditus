import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { updateRequerimientoEstado, updatePruebaSocial, updateRequerimientoPagado } from "./actions";
import { RequerimientoFormDialog } from "@/components/requerimientos/requerimiento-form-dialog";
import { AssignSelect } from "@/components/requerimientos/assign-select";
import { ProgramadorSelect } from "@/components/requerimientos/programador-select";
import { EstadoSelect } from "@/components/estado-select";
import { LiveSync } from "@/components/live-sync";
import {
  REQUERIMIENTO_ESTADOS,
  REQUERIMIENTO_ESTADO_COLORS,
  REQUERIMIENTO_PAGADO_ESTADOS,
  REQUERIMIENTO_PAGADO_COLORS,
  PRUEBA_SOCIAL_ESTADOS,
  PRUEBA_SOCIAL_COLORS,
  PIPELINES,
  type RequerimientoEstado,
  type RequerimientoPagadoEstado,
  type PruebaSocialEstado,
  type Pipeline,
} from "@/lib/statuses";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RequerimientoRow = {
  id: string;
  pipeline: Pipeline;
  estado: RequerimientoEstado;
  pagado: RequerimientoPagadoEstado;
  prueba_social: PruebaSocialEstado;
  nombre_producto: string | null;
  pais_acento: string | null;
  f_entrega_prometida: string | null;
  encargado_id: string | null;
  programador_id: string | null;
  encargado: { name: string } | null;
  programador: { name: string } | null;
  ingreso: { tracking_id: string } | null;
};

const TERMINADOS: RequerimientoEstado[] = ["Terminado", "ENTREGADO", "SUBIDA"];

export default async function RequerimientosPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManageDinero = (INGRESOS_ROLES as string[]).includes(profile.role);

  const [{ data: requerimientos }, { data: users }, { data: programadores }] = await Promise.all([
    supabase
      .from("requerimientos")
      .select(
        "id, pipeline, estado, pagado, prueba_social, nombre_producto, pais_acento, f_entrega_prometida, encargado_id, programador_id, encargado:users!requerimientos_encargado_id_fkey(name), programador:users!requerimientos_programador_id_fkey(name), ingreso:ingresos(tracking_id)",
      )
      .order("created_at", { ascending: false })
      .returns<RequerimientoRow[]>(),
    supabase.from("users").select("id, name").eq("active", true).order("name"),
    supabase.from("users").select("id, name").eq("active", true).eq("role", "programador").order("name"),
  ]);

  // Cola del Programador: landing pages listas para publicar o ya con
  // programador asignado — no es un pipeline nuevo en la base de datos,
  // es una vista filtrada del pipeline "landing" para ese rol específico.
  const programadorRows = (requerimientos ?? []).filter(
    (r) => r.pipeline === "landing" && (r.estado === "POR SUBIR" || r.programador_id != null),
  );

  function renderRow(row: RequerimientoRow, withProgramador: boolean) {
    return (
      <TableRow key={row.id}>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {row.ingreso?.tracking_id ?? "—"}
        </TableCell>
        <TableCell className="max-w-48 truncate">{row.nombre_producto}</TableCell>
        {!withProgramador && <TableCell>{row.pais_acento ?? "—"}</TableCell>}
        {!withProgramador && <TableCell>{row.f_entrega_prometida ?? "—"}</TableCell>}
        <TableCell>
          <AssignSelect
            requerimientoId={row.id}
            currentEncargadoId={row.encargado_id}
            people={users ?? []}
          />
        </TableCell>
        {withProgramador && (
          <TableCell>
            <ProgramadorSelect
              requerimientoId={row.id}
              currentProgramadorId={row.programador_id}
              people={programadores ?? []}
            />
          </TableCell>
        )}
        <TableCell>
          <EstadoSelect
            value={row.estado}
            estados={REQUERIMIENTO_ESTADOS}
            colors={REQUERIMIENTO_ESTADO_COLORS}
            onChange={updateRequerimientoEstado.bind(null, row.id)}
          />
        </TableCell>
        <TableCell>
          {canManageDinero ? (
            <EstadoSelect
              value={row.pagado}
              estados={REQUERIMIENTO_PAGADO_ESTADOS}
              colors={REQUERIMIENTO_PAGADO_COLORS}
              onChange={updateRequerimientoPagado.bind(null, row.id)}
            />
          ) : (
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${REQUERIMIENTO_PAGADO_COLORS[row.pagado]}`}>
              {row.pagado}
            </span>
          )}
        </TableCell>
        <TableCell>
          {TERMINADOS.includes(row.estado) && canManageDinero ? (
            <EstadoSelect
              value={row.prueba_social}
              estados={PRUEBA_SOCIAL_ESTADOS}
              colors={PRUEBA_SOCIAL_COLORS}
              onChange={updatePruebaSocial.bind(null, row.id)}
            />
          ) : TERMINADOS.includes(row.estado) ? (
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${PRUEBA_SOCIAL_COLORS[row.prueba_social]}`}>
              {row.prueba_social}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <Link href={`/requerimientos/${row.id}`} className="text-sm font-medium text-primary hover:underline">
            Ver
          </Link>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Requerimientos</h1>
        <LiveSync tables={["requerimientos"]} />
      </div>

      <Tabs defaultValue="video">
        <TabsList>
          {PIPELINES.map((p) => (
            <TabsTrigger key={p.value} value={p.value}>
              {p.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="programador">Programador</TabsTrigger>
        </TabsList>

        {PIPELINES.map((p) => {
          const rows = (requerimientos ?? []).filter((r) => r.pipeline === p.value);
          return (
            <TabsContent key={p.value} value={p.value} className="flex flex-col gap-3">
              <div className="flex justify-end">
                <RequerimientoFormDialog pipeline={p.value as Pipeline} encargados={users ?? []} />
              </div>
              <div className="overflow-x-auto rounded-md border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>País (acento)</TableHead>
                      <TableHead>Entrega prometida</TableHead>
                      <TableHead>A cargo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Pagado</TableHead>
                      <TableHead>Prueba social</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => renderRow(row, false))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          Sin requerimientos todavía.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          );
        })}

        <TabsContent value="programador" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Landing pages en &quot;POR SUBIR&quot; o ya asignadas a un programador.
            </p>
            <RequerimientoFormDialog pipeline="landing" encargados={users ?? []} />
          </div>
          <div className="overflow-x-auto rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>A cargo</TableHead>
                  <TableHead>Programador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pagado</TableHead>
                  <TableHead>Prueba social</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {programadorRows.map((row) => renderRow(row, true))}
                {programadorRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Nada pendiente de publicar por ahora.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
