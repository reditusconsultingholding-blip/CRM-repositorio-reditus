import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { updateRequerimientoEstado } from "../actions";
import { EstadoSelect } from "@/components/estado-select";
import { AssignSelect } from "@/components/requerimientos/assign-select";
import { ProgramadorSelect } from "@/components/requerimientos/programador-select";
import { NextPhaseButton } from "@/components/requerimientos/next-phase-button";
import { CommentForm } from "@/components/requerimientos/comment-form";
import { SeguimientoRecompra } from "@/components/requerimientos/seguimiento-recompra";
import {
  REQUERIMIENTO_ESTADOS,
  REQUERIMIENTO_ESTADO_COLORS,
  REQUERIMIENTO_TERMINADOS,
  getNextEstado,
  type RequerimientoEstado,
} from "@/lib/statuses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author: { name: string } | null;
  mentioned: { name: string } | null;
};

export default async function RequerimientoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: requerimiento }, { data: users }, { data: programadores }, { data: comments }] =
    await Promise.all([
      supabase.from("requerimientos").select("*").eq("id", id).single(),
      supabase.from("users").select("id, name").eq("active", true).order("name"),
      supabase
        .from("users")
        .select("id, name")
        .eq("active", true)
        .eq("role", "programador")
        .order("name"),
      supabase
        .from("requerimiento_comments")
        .select(
          "id, body, created_at, author:users!requerimiento_comments_author_id_fkey(name), mentioned:users!requerimiento_comments_mentioned_user_id_fkey(name)",
        )
        .eq("requerimiento_id", id)
        .order("created_at", { ascending: true })
        .returns<CommentRow[]>(),
    ]);

  if (!requerimiento) notFound();

  const nextEstado = getNextEstado(
    requerimiento.pipeline as "video" | "landing",
    requerimiento.estado as RequerimientoEstado,
  );

  const mostrarSeguimiento = requerimiento.ingreso_id && REQUERIMIENTO_TERMINADOS.includes(requerimiento.estado as RequerimientoEstado);
  let encuestaInfo = null;
  let cicloCerrado = false;
  if (mostrarSeguimiento) {
    const [{ data: encuesta }, { data: ingreso }] = await Promise.all([
      supabase
        .from("encuestas_calidad")
        .select("token, puntuacion, comentario, quiere_testimonio, respondido_at")
        .eq("ingreso_id", requerimiento.ingreso_id)
        .maybeSingle(),
      supabase.from("ingresos").select("ciclo_cerrado").eq("id", requerimiento.ingreso_id).single(),
    ]);
    encuestaInfo = encuesta;
    cicloCerrado = ingreso?.ciclo_cerrado ?? false;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{requerimiento.nombre_producto}</CardTitle>
          <EstadoSelect
            value={requerimiento.estado as RequerimientoEstado}
            estados={REQUERIMIENTO_ESTADOS}
            colors={REQUERIMIENTO_ESTADO_COLORS}
            onChange={updateRequerimientoEstado.bind(null, id)}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Requerimiento</p>
            <p>{requerimiento.requerimiento_texto || "Sin descripción."}</p>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">País (acento/voz)</p>
              <p>{requerimiento.pais_acento ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Entrega prometida</p>
              <p>{requerimiento.f_entrega_prometida ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Carpeta de Drive</p>
              {requerimiento.carpeta_drive_url ? (
                <a
                  href={requerimiento.carpeta_drive_url}
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  Abrir carpeta
                </a>
              ) : (
                <p>—</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Documento de información</p>
              {requerimiento.documento_inf_url ? (
                <a
                  href={requerimiento.documento_inf_url}
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  Abrir documento
                </a>
              ) : (
                <p>—</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Encargado</p>
              <AssignSelect
                requerimientoId={id}
                currentEncargadoId={requerimiento.encargado_id}
                people={users ?? []}
              />
            </div>
            {requerimiento.pipeline === "landing" && (
              <div>
                <p className="text-xs text-muted-foreground">Programador (publica)</p>
                <ProgramadorSelect
                  requerimientoId={id}
                  currentProgramadorId={requerimiento.programador_id ?? null}
                  people={programadores ?? []}
                />
              </div>
            )}
          </div>

          {nextEstado && (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Cuando termines tu parte, marca la tarea como completada — avanza sola a &quot;{nextEstado}&quot;.
                </p>
                <NextPhaseButton requerimientoId={id} nextEstado={nextEstado} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chat interno</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
            {(comments ?? []).map((c) => (
              <div key={c.id} className="rounded-md border p-2 text-sm">
                <p className="text-xs font-medium">
                  {c.author?.name ?? "Usuario eliminado"}
                  {c.mentioned?.name && (
                    <span className="text-primary"> @{c.mentioned.name}</span>
                  )}
                </p>
                <p>{c.body}</p>
              </div>
            ))}
            {(comments ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Sin mensajes todavía.</p>
            )}
          </div>
          <CommentForm requerimientoId={id} people={users ?? []} />
        </CardContent>
      </Card>

      {mostrarSeguimiento && (
        <div className="lg:col-span-3">
          <SeguimientoRecompra
            ingresoId={requerimiento.ingreso_id}
            encuesta={encuestaInfo}
            cicloCerrado={cicloCerrado}
            canManage={(INGRESOS_ROLES as string[]).includes(profile.role)}
          />
        </div>
      )}
    </div>
  );
}
