import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateProspectoEstado } from "./actions";
import { ProspectoFormDialog } from "@/components/prospectos/prospecto-form-dialog";
import { ProspeccionFormDialog } from "@/components/prospectos/prospeccion-form-dialog";
import { TableroProspeccion, type TarjetaProspecto } from "@/components/prospectos/tablero-prospeccion";
import { ORIGEN_PROSPECCION, etapaEfectiva, leerProspeccion, produccion } from "@/lib/prospeccion";
import { EstadoSelect } from "@/components/estado-select";
import { PROSPECTO_ESTADOS, PROSPECTO_ESTADO_COLORS, type ProspectoEstado } from "@/lib/statuses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveSync } from "@/components/live-sync";
import { PestanasProspectos } from "@/components/prospectos/pestanas";
import { VideosProspectos } from "@/components/prospectos/videos-prospectos";
import { videosDeProspectos } from "./video-actions";

// Las etapas del video de un prospecto llaman a la IA varias veces seguidas.
export const maxDuration = 300;
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
  // Calendly guarda aquí un arreglo de preguntas; el embudo de prospección,
  // un objeto con la clave `prospeccion`.
  respuestas_calificacion: unknown;
  fecha_reunion: string | null;
  link_reunion: string | null;
  notas: string | null;
  created_at: string;
};

function hace(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return dias <= 0 ? "hoy" : dias === 1 ? "1 día" : `${dias} días`;
}

function preguntas(raw: unknown): QA[] {
  return Array.isArray(raw) ? (raw as QA[]).filter((q) => q && typeof q.question === "string") : [];
}

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

  const todos = prospectos ?? [];
  const delEmbudo = todos.flatMap((p) => {
    const pros = p.origen === ORIGEN_PROSPECCION ? leerProspeccion(p.respuestas_calificacion) : null;
    return pros ? [{ p, pros }] : [];
  });
  const idsEmbudo = new Set(delEmbudo.map((x) => x.p.id));
  const otros = todos.filter((p) => !idsEmbudo.has(p.id));

  const idsEncargados = [...new Set(delEmbudo.map((x) => x.pros.editor_id).filter((v): v is string => !!v))];
  const { data: encargados } = idsEncargados.length
    ? await supabase.from("users").select("id, name").in("id", idsEncargados)
    : { data: [] as { id: string; name: string }[] };
  const nombreDe = new Map((encargados ?? []).map((u) => [u.id as string, u.name as string]));

  const tarjetas: TarjetaProspecto[] = delEmbudo.map(({ p, pros }) => ({
    id: p.id,
    nombre: p.nombre,
    servicio: pros.servicio,
    etapa: etapaEfectiva(p.estado, pros),
    producto: pros.producto,
    canal: pros.canal,
    produccion: produccion(pros),
    encargado: pros.editor_id ? (nombreDe.get(pros.editor_id) ?? "Asignado") : null,
    hace: hace(p.created_at),
  }));

  // Video gratis automático: candidatos y su estado (decide solo el CEO).
  const videos = await videosDeProspectos();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Prospectos</h1>
            <LiveSync tables={["prospectos"]} />
          </div>
          <p className="text-sm text-muted-foreground">
            Embudo «video gratis»: del lead que dijo que sí al cliente. Abre un prospecto para ver su guion, asignar
            la edición y copiar el mensaje de entrega.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/prospectos/mis-videos"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:border-ring/60"
          >
            Piezas asignadas
          </Link>
          <ProspeccionFormDialog />
        </div>
      </div>
      {!("error" in videos) && <VideosProspectos filas={videos.filas} esCeo={profile.role === "ceo"} pideAprobacion={videos.pideAprobacion} />}

      <PestanasProspectos activa="embudo" />

      <TableroProspeccion tarjetas={tarjetas} />

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">Otros prospectos</h2>
          <p className="text-sm text-muted-foreground">
            Reuniones agendadas por Calendly, leads de WhatsApp y los que se agregan a mano fuera del embudo.
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
            {otros.map((p) => (
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
            {otros.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Todavía no hay prospectos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {otros
        .filter((p) => preguntas(p.respuestas_calificacion).length)
        .map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="text-sm">Respuestas de calificación — {p.nombre}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {preguntas(p.respuestas_calificacion).map((qa, i) => (
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
