import { createClient } from "@/lib/supabase/server";
import { updateIngresoEstado } from "./actions";
import { IngresoFormDialog } from "@/components/ingresos/ingreso-form-dialog";
import { EstadoSelect } from "@/components/estado-select";
import { INGRESO_ESTADOS, INGRESO_ESTADO_COLORS, type IngresoEstado } from "@/lib/statuses";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type IngresoRow = {
  id: string;
  tracking_id: string;
  fecha: string;
  estado: IngresoEstado;
  servicio: string | null;
  pais: string | null;
  producto: string | null;
  precio_total: number | null;
  precio_final_descuento: number | null;
  estado_pago: string | null;
  client: { name: string; whatsapp_number: string } | null;
  responsable: { name: string } | null;
};

export default async function IngresosPage() {
  const supabase = await createClient();

  const [{ data: ingresos }, { data: users }] = await Promise.all([
    supabase
      .from("ingresos")
      .select(
        "id, tracking_id, fecha, estado, servicio, pais, producto, precio_total, precio_final_descuento, estado_pago, client:clients(name, whatsapp_number), responsable:users(name)",
      )
      .order("created_at", { ascending: false })
      .returns<IngresoRow[]>(),
    supabase.from("users").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Ingresos</h1>
        <IngresoFormDialog responsables={users ?? []} />
      </div>

      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>País</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Precio final</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(ingresos ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.tracking_id}</TableCell>
                <TableCell>{row.fecha}</TableCell>
                <TableCell>{row.client?.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.client?.whatsapp_number}
                </TableCell>
                <TableCell>{row.pais}</TableCell>
                <TableCell>{row.producto}</TableCell>
                <TableCell>
                  {row.precio_final_descuento != null
                    ? Number(row.precio_final_descuento).toLocaleString("es-CO", {
                        style: "currency",
                        currency: "USD",
                      })
                    : "—"}
                </TableCell>
                <TableCell>{row.estado_pago ?? "—"}</TableCell>
                <TableCell>{row.responsable?.name ?? "—"}</TableCell>
                <TableCell>
                  <EstadoSelect
                    value={row.estado as IngresoEstado}
                    estados={INGRESO_ESTADOS}
                    colors={INGRESO_ESTADO_COLORS}
                    onChange={updateIngresoEstado.bind(null, row.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {(ingresos ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  Todavía no hay ingresos registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
