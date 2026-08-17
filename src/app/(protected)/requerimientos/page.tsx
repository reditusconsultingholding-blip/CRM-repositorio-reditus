import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updateRequerimientoEstado } from "./actions";
import { RequerimientoFormDialog } from "@/components/requerimientos/requerimiento-form-dialog";
import { EstadoSelect } from "@/components/estado-select";
import { LiveSync } from "@/components/live-sync";
import {
  REQUERIMIENTO_ESTADOS,
  REQUERIMIENTO_ESTADO_COLORS,
  PIPELINES,
  type RequerimientoEstado,
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
  nombre_producto: string | null;
  pais_acento: string | null;
  f_entrega_prometida: string | null;
  programador_id: string | null;
  encargado: { name: string } | null;
  programador: { name: string } | null;
};

export default async function RequerimientosPage() {
  const supabase = await createClient();

  const [{ data: requerimientos }, { data: users }] = await Promise.all([
    supabase
      .from("requerimientos")
      .select(
        "id, pipeline, estado, nombre_producto, pais_acento, f_entrega_prometida, programador_id, encargado:users!requerimientos_encargado_id_fkey(name), programador:users!requerimientos_programador_id_fkey(name)",
      )
      .order("created_at", { ascending: false })
      .returns<RequerimientoRow[]>(),
    supabase.from("users").select("id, name").eq("active", true).order("name"),
  ]);

  // Cola del Programador: landing pages listas para publicar o ya con
  // programador asignado — no es un pipeline nuevo en la base de datos,
  // es una vista filtrada del pipeline "landing" para ese rol específico.
  const programadorRows = (requerimientos ?? []).filter(
    (r) => r.pipeline === "landing" && (r.estado === "Por subir" || r.programador_id != null),
  );

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
                      <TableHead>Producto</TableHead>
                      <TableHead>País (acento)</TableHead>
                      <TableHead>Entrega prometida</TableHead>
                      <TableHead>Encargado</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.nombre_producto}</TableCell>
                        <TableCell>{row.pais_acento ?? "—"}</TableCell>
                        <TableCell>{row.f_entrega_prometida ?? "—"}</TableCell>
                        <TableCell>{row.encargado?.name ?? "Sin asignar"}</TableCell>
                        <TableCell>
                          <EstadoSelect
                            value={row.estado as RequerimientoEstado}
                            estados={REQUERIMIENTO_ESTADOS}
                            colors={REQUERIMIENTO_ESTADO_COLORS}
                            onChange={updateRequerimientoEstado.bind(null, row.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/requerimientos/${row.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            Ver
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
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
              Landing pages en &quot;Por subir&quot; o ya asignadas a un programador.
            </p>
            <RequerimientoFormDialog pipeline="landing" encargados={users ?? []} />
          </div>
          <div className="overflow-x-auto rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Diseñadora</TableHead>
                  <TableHead>Programador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {programadorRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.nombre_producto}</TableCell>
                    <TableCell>{row.encargado?.name ?? "—"}</TableCell>
                    <TableCell>{row.programador?.name ?? "Sin asignar"}</TableCell>
                    <TableCell>
                      <EstadoSelect
                        value={row.estado as RequerimientoEstado}
                        estados={REQUERIMIENTO_ESTADOS}
                        colors={REQUERIMIENTO_ESTADO_COLORS}
                        onChange={updateRequerimientoEstado.bind(null, row.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/requerimientos/${row.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Ver
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {programadorRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
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
