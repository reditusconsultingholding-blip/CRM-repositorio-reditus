import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { updateRequerimientoEstado, updatePruebaSocial, updateRequerimientoPagado } from "./actions";
import { RequerimientoFormDialog } from "@/components/requerimientos/requerimiento-form-dialog";
import { AssignSelect } from "@/components/requerimientos/assign-select";
import { ProgramadorSelect } from "@/components/requerimientos/programador-select";
import { EstadoSelect } from "@/components/estado-select";
import { InlineTextCell } from "@/components/requerimientos/inline-text-cell";
import { DeleteRequerimientoButton } from "@/components/requerimientos/delete-requerimiento-button";
import { LiveSync } from "@/components/live-sync";
import {
  REQUERIMIENTO_ESTADOS,
  REQUERIMIENTO_ESTADO_COLORS,
  REQUERIMIENTO_PAGADO_ESTADOS,
  REQUERIMIENTO_PAGADO_COLORS,
  PRUEBA_SOCIAL_ESTADOS,
  PRUEBA_SOCIAL_COLORS,
  REQUERIMIENTO_TERMINADOS,
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
  cantidad: number;
  requerimiento_texto: string | null;
  pais_acento: string | null;
  f_entrega_prometida: string | null;
  encargado_id: string | null;
  programador_id: string | null;
  carpeta_drive_url: string | null;
  documento_inf_url: string | null;
  psd_url: string | null;
  notas: string | null;
  permisos: string | null;
  plataforma: string | null;
  tienda: string | null;
  oferta_precios: string | null;
  link_producto_imagen: string | null;
  link_pagina_subida: string | null;
  created_at: string;
  encargado: { name: string } | null;
  programador: { name: string } | null;
  ingreso: { tracking_id: string; client: { name: string } | { name: string }[] | null } | null;
};

function clientName(row: RequerimientoRow) {
  const client = row.ingreso?.client;
  return (Array.isArray(client) ? client[0]?.name : client?.name) ?? "—";
}

export default async function RequerimientosPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManageDinero = (INGRESOS_ROLES as string[]).includes(profile.role);

  const [{ data: requerimientos }, { data: users }, { data: programadores }] = await Promise.all([
    supabase
      .from("requerimientos")
      .select(
        "id, pipeline, estado, pagado, prueba_social, nombre_producto, cantidad, requerimiento_texto, pais_acento, f_entrega_prometida, encargado_id, programador_id, carpeta_drive_url, documento_inf_url, psd_url, notas, permisos, plataforma, tienda, oferta_precios, link_producto_imagen, link_pagina_subida, created_at, encargado:users!requerimientos_encargado_id_fkey(name), programador:users!requerimientos_programador_id_fkey(name), ingreso:ingresos(tracking_id, client:clients!ingresos_client_id_fkey(name))",
      )
      .order("created_at", { ascending: true })
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

  function estadoCell(row: RequerimientoRow) {
    return (
      <EstadoSelect
        value={row.estado}
        estados={REQUERIMIENTO_ESTADOS}
        colors={REQUERIMIENTO_ESTADO_COLORS}
        onChange={updateRequerimientoEstado.bind(null, row.id)}
      />
    );
  }

  function pagadoCell(row: RequerimientoRow) {
    return canManageDinero ? (
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
    );
  }

  function pruebaSocialCell(row: RequerimientoRow) {
    if (!REQUERIMIENTO_TERMINADOS.includes(row.estado)) return <span className="text-xs text-muted-foreground">—</span>;
    return canManageDinero ? (
      <EstadoSelect
        value={row.prueba_social}
        estados={PRUEBA_SOCIAL_ESTADOS}
        colors={PRUEBA_SOCIAL_COLORS}
        onChange={updatePruebaSocial.bind(null, row.id)}
      />
    ) : (
      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${PRUEBA_SOCIAL_COLORS[row.prueba_social]}`}>
        {row.prueba_social}
      </span>
    );
  }

  function verCell(row: RequerimientoRow) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Link href={`/requerimientos/${row.id}`} className="text-sm font-medium text-primary hover:underline">
          Ver
        </Link>
        <DeleteRequerimientoButton requerimientoId={row.id} nombre={row.nombre_producto ?? "este requerimiento"} />
      </div>
    );
  }

  function nombreProductoCell(row: RequerimientoRow) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="max-w-40 truncate" title={row.nombre_producto ?? ""}>
          {row.nombre_producto}
        </span>
        {row.cantidad > 1 && (
          <span
            className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            title={`${row.cantidad} unidades — ábrelo para ver el desglose`}
          >
            x{row.cantidad}
          </span>
        )}
      </div>
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
          const esLanding = p.value === "landing";
          return (
            <TabsContent key={p.value} value={p.value} className="flex flex-col gap-3">
              <div className="flex justify-end">
                <RequerimientoFormDialog pipeline={p.value as Pipeline} encargados={users ?? []} />
              </div>
              <div className="overflow-x-auto rounded-md border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="[&>th]:border-r [&>th:last-child]:border-r-0">
                      <TableHead>ID</TableHead>
                      <TableHead>{esLanding ? "Diseñador" : "Encargado"}</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>F Entr</TableHead>
                      <TableHead>Nombre del producto</TableHead>
                      <TableHead>Requerimiento</TableHead>
                      <TableHead>{esLanding ? "País" : "País (voz)"}</TableHead>
                      <TableHead>Carpeta de Drive</TableHead>
                      <TableHead>Documento Inf</TableHead>
                      {esLanding && <TableHead>PSD</TableHead>}
                      <TableHead>Pagado</TableHead>
                      <TableHead>Notas</TableHead>
                      {esLanding && <TableHead>Link PG</TableHead>}
                      <TableHead>Prueba social</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.ingreso?.tracking_id ?? "—"}
                        </TableCell>
                        <TableCell>
                          <AssignSelect requerimientoId={row.id} currentEncargadoId={row.encargado_id} people={users ?? []} />
                        </TableCell>
                        <TableCell>{estadoCell(row)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.f_entrega_prometida ?? "—"}</TableCell>
                        <TableCell>{nombreProductoCell(row)}</TableCell>
                        <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={row.requerimiento_texto ?? ""}>
                          {row.requerimiento_texto || "—"}
                        </TableCell>
                        <TableCell className="text-xs">{row.pais_acento ?? "—"}</TableCell>
                        <TableCell>
                          <InlineTextCell requerimientoId={row.id} campo="carpeta_drive_url" valor={row.carpeta_drive_url} placeholder="Link Drive" isLink />
                        </TableCell>
                        <TableCell>
                          <InlineTextCell requerimientoId={row.id} campo="documento_inf_url" valor={row.documento_inf_url} placeholder="Link doc" isLink />
                        </TableCell>
                        {esLanding && (
                          <TableCell>
                            <InlineTextCell requerimientoId={row.id} campo="psd_url" valor={row.psd_url} placeholder="Link PSD" isLink />
                          </TableCell>
                        )}
                        <TableCell>{pagadoCell(row)}</TableCell>
                        <TableCell>
                          <InlineTextCell requerimientoId={row.id} campo="notas" valor={row.notas} placeholder="Notas…" />
                        </TableCell>
                        {esLanding && (
                          <TableCell>
                            <InlineTextCell requerimientoId={row.id} campo="link_pagina_subida" valor={row.link_pagina_subida} placeholder="Link página" isLink />
                          </TableCell>
                        )}
                        <TableCell>{pruebaSocialCell(row)}</TableCell>
                        <TableCell>{verCell(row)}</TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={esLanding ? 15 : 12} className="text-center text-muted-foreground">
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
                <TableRow className="[&>th]:border-r [&>th:last-child]:border-r-0">
                  <TableHead>ID</TableHead>
                  <TableHead>Encargado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha asig.</TableHead>
                  <TableHead>Permisos</TableHead>
                  <TableHead>Plataforma</TableHead>
                  <TableHead>Tienda</TableHead>
                  <TableHead>Nombre del producto</TableHead>
                  <TableHead>País</TableHead>
                  <TableHead>Oferta y precios</TableHead>
                  <TableHead>Link producto/imagen</TableHead>
                  <TableHead>Link de la página subida</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {programadorRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.ingreso?.tracking_id ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ProgramadorSelect requerimientoId={row.id} currentProgramadorId={row.programador_id} people={programadores ?? []} />
                    </TableCell>
                    <TableCell>{estadoCell(row)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleDateString("es-CO")}
                    </TableCell>
                    <TableCell>
                      <InlineTextCell requerimientoId={row.id} campo="permisos" valor={row.permisos} placeholder="Permisos…" />
                    </TableCell>
                    <TableCell>
                      <InlineTextCell requerimientoId={row.id} campo="plataforma" valor={row.plataforma} placeholder="Shopify…" />
                    </TableCell>
                    <TableCell>
                      <InlineTextCell requerimientoId={row.id} campo="tienda" valor={row.tienda} placeholder="Tienda…" />
                    </TableCell>
                    <TableCell>{nombreProductoCell(row)}</TableCell>
                    <TableCell className="text-xs">{row.pais_acento ?? "—"}</TableCell>
                    <TableCell>
                      <InlineTextCell requerimientoId={row.id} campo="oferta_precios" valor={row.oferta_precios} placeholder="Oferta y precios…" />
                    </TableCell>
                    <TableCell>
                      <InlineTextCell requerimientoId={row.id} campo="link_producto_imagen" valor={row.link_producto_imagen} placeholder="Link producto/imagen" isLink />
                    </TableCell>
                    <TableCell>
                      <InlineTextCell requerimientoId={row.id} campo="link_pagina_subida" valor={row.link_pagina_subida} placeholder="Link página subida" isLink />
                    </TableCell>
                    <TableCell className="text-xs">{clientName(row)}</TableCell>
                    <TableCell>{verCell(row)}</TableCell>
                  </TableRow>
                ))}
                {programadorRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center text-muted-foreground">
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
