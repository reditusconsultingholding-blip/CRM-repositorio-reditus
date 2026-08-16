import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateProspectoEstado } from "./actions";
import { ProspectoFormDialog } from "@/components/prospectos/prospecto-form-dialog";
import { EstadoSelect } from "@/components/estado-select";
import { PROSPECTO_ESTADOS, PROSPECTO_ESTADO_COLORS, type ProspectoEstado } from "@/lib/statuses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveSync } from "@/components/live-sync";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type QA = { question: string; answer: string };

type ProspectoRow = {
  id: string;
  nombre: string;
  whatsapp_number: string | null;
  email: string | null;
  estado: ProspectoEstado;
  origen: string;
  respuestas_calificacion: QA[] | null;
  fecha_reunion: string | null;
  link_reunion: string | null;
  notas: string | null;
  created_at: string;
};

export default async function ProspectosPage() {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: prospectos } = await supabase
    .from("prospectos")
    .select(
      "id, nombre, whatsapp_number, email, estado, origen, respuestas_calificacion, fecha_reunion, link_reunion, notas, created_at",
    )
    .order("created_at", { ascending: false })
    .returns<ProspectoRow[]>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Prospectos</h1>
            <LiveSync tables={["prospectos"]} />
          </div>
          <p className="text-sm text-muted-foreground">
            Leads de WhatsApp (próximamente) y reuniones agendadas por Calendly, sincronizadas
            automáticamente.
          </p>
        </div>
        <ProspectoFormDialog />
      </div>

      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Reunión</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(prospectos ?? []).map((p) => (
              <TableRow key={p.id} className="align-top">
                <TableCell className="font-medium">{p.nombre}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.whatsapp_number ?? p.email ?? "—"}
                </TableCell>
                <TableCell className="text-xs capitalize">{p.origen}</TableCell>
                <TableCell className="text-xs">
                  {p.fecha_reunion ? (
                    <>
                      {new Date(p.fecha_reunion).toLocaleString("es-CO")}
                      {p.link_reunion && (
                        <>
                          {" · "}
                          <a href={p.link_reunion} target="_blank" className="text-primary hover:underline">
                            Unirse
                          </a>
                        </>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <EstadoSelect
                    value={p.estado}
                    estados={PROSPECTO_ESTADOS}
                    colors={PROSPECTO_ESTADO_COLORS}
                    onChange={updateProspectoEstado.bind(null, p.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {(prospectos ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Todavía no hay prospectos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {(prospectos ?? [])
        .filter((p) => p.respuestas_calificacion?.length)
        .map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="text-sm">Respuestas de calificación — {p.nombre}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {p.respuestas_calificacion!.map((qa, i) => (
                <div key={i}>
                  <p className="text-xs font-medium text-muted-foreground">{qa.question}</p>
                  <p>{qa.answer}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
