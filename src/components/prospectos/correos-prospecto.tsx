"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CornerDownLeft, Mail, MailCheck, MailX, PauseCircle, PlayCircle, ShieldCheck } from "lucide-react";
import {
  aprobarEnvioCorreo,
  detenerSeguimientosCorreo,
  reanudarSeguimientosCorreo,
  retirarAprobacionCorreo,
  soltarEnvioCorreo,
} from "@/app/(protected)/prospectos/campanas-actions";
import {
  CLASIFICACION_LABELS,
  DIAS_SEGUIMIENTO,
  ESTADO_SEGUIMIENTO_LABELS,
  PASO_LABELS,
  TIPO_EVENTO_LABELS,
  proximoSeguimiento,
  type CorreosProspecto as Correos,
  type EventoCorreo,
} from "@/lib/prospeccion-correo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip, ETIQUETA } from "./piezas";

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
}
function dia(aaaammdd: string) {
  return new Date(`${aaaammdd}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const ENTRANTES = ["respuesta", "automatica", "rebote", "baja"];

function Evento({ e }: { e: EventoCorreo }) {
  const entrante = ENTRANTES.includes(e.tipo);
  const Icono = e.tipo === "rebote" || e.tipo === "baja" ? MailX : entrante ? CornerDownLeft : MailCheck;
  return (
    <li className="flex gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
          e.tipo === "rebote" || e.tipo === "baja"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : entrante
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-primary/30 bg-primary/10 text-primary",
        )}
      >
        <Icono className="size-3.5" />
      </span>
      <details className="min-w-0 flex-1">
        <summary className="cursor-pointer list-none text-sm">
          <span className="font-medium">{TIPO_EVENTO_LABELS[e.tipo]}</span>
          {e.clasificacion && e.tipo !== "rebote" && (
            <Chip className="ml-1.5" tono={e.clasificacion === "interesado" ? "verde" : e.clasificacion === "no_interesado" ? "rojo" : "ambar"}>
              {CLASIFICACION_LABELS[e.clasificacion]}
            </Chip>
          )}
          <span className="block text-xs text-muted-foreground">
            {fecha(e.fecha)}
            {e.asunto ? ` · ${e.asunto}` : ""}
          </span>
        </summary>
        {e.texto && (
          <p className="mt-1.5 rounded-lg border border-border bg-muted/30 p-2.5 text-xs leading-relaxed break-words whitespace-pre-wrap">
            {entrante && e.tipo !== "rebote" ? `«${e.texto}»` : e.texto}
          </p>
        )}
      </details>
    </li>
  );
}

/** Bloque «Correos» de la ficha: aprobación del envío, línea de tiempo y estado de los seguimientos. */
export function CorreosProspecto({
  id,
  correos,
  pais,
  falta,
  sinConfirmar,
  puedeAutorizar,
}: {
  id: string;
  correos: Correos;
  pais: string;
  /** Por qué aún no se puede aprobar el envío; null si está todo listo. */
  falta: string | null;
  /** El servidor tomó un envío y lleva más de 30 minutos sin confirmarlo. */
  sinConfirmar: boolean;
  puedeAutorizar: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const entregado = correos.eventos.some((e) => e.tipo === "entrega");
  const seg = correos.seguimientos;
  const proximo = proximoSeguimiento(correos, pais);
  const hechos = correos.eventos.filter((e) => e.tipo.startsWith("seguimiento_")).length;

  function correr(fn: () => Promise<{ error?: string; aviso?: string }>, exito: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error, { duration: 9000 });
      else toast.success(r.aviso ? `${exito}. ${r.aviso}` : exito);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-primary" /> Correos
        </CardTitle>
        <CardDescription>
          El servidor envía la entrega y tres seguimientos (a los {DIAS_SEGUIMIENTO.join(", ")} días), en horario laboral del
          país del prospecto. Se detienen solos si responde, agenda o pide no recibir más.
        </CardDescription>
        <CardAction>
          <Chip tono={seg.estado === "activos" ? "verde" : seg.estado === "cortados" ? "ambar" : "neutro"}>
            Seguimientos: {ESTADO_SEGUIMIENTO_LABELS[seg.estado].toLowerCase()}
          </Chip>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!entregado && (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3">
            {correos.aprobado ? (
              <>
                <p className="flex items-center gap-1.5 text-sm">
                  <ShieldCheck className="size-4 text-emerald-600" />
                  Envío aprobado por {correos.aprobado.por} el {fecha(correos.aprobado.fecha)}.
                </p>
                <p className="text-xs text-muted-foreground">
                  {correos.enEnvio
                    ? "El servidor lo está enviando."
                    : "Sale en el próximo horario laboral, respetando el tope del día de la cuenta."}
                </p>
                {!correos.enEnvio && (
                  <Button variant="ghost" size="sm" className="w-fit" disabled={pending} onClick={() => correr(() => retirarAprobacionCorreo(id), "Aprobación retirada")}>
                    Retirar aprobación
                  </Button>
                )}
              </>
            ) : (
              <>
                <p className="text-sm">
                  {falta ?? "La pieza y el mensaje están listos. Falta la aprobación para que el servidor lo envíe por correo."}
                </p>
                <Button
                  className="w-fit"
                  disabled={pending || !!falta || !puedeAutorizar}
                  onClick={() => correr(() => aprobarEnvioCorreo(id), "Envío aprobado")}
                  title={puedeAutorizar ? undefined : "Solo el CEO o el gerente comercial pueden aprobar el envío"}
                >
                  <ShieldCheck /> Aprobar video y enviar por correo
                </Button>
                {!puedeAutorizar && !falta && (
                  <p className="text-xs text-muted-foreground">Solo el CEO o el gerente comercial pueden aprobar el envío.</p>
                )}
              </>
            )}
          </div>
        )}

        {correos.enEnvio && sinConfirmar && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            <span>
              «{PASO_LABELS[correos.enEnvio.paso]}» quedó sin confirmar desde el {fecha(correos.enEnvio.desde)}. Revisa en Gmail
              si salió antes de reintentar: podría duplicarse.
            </span>
            {puedeAutorizar && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => correr(() => soltarEnvioCorreo(id), "Se volverá a intentar")}>
                Reintentar
              </Button>
            )}
          </div>
        )}

        {correos.eventos.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {correos.eventos.map((e, i) => (
              <Evento key={`${e.fecha}-${i}`} e={e} />
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground">Todavía no hay correos con este prospecto.</p>
        )}

        {entregado && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="min-w-0 text-xs text-muted-foreground">
              <span className={ETIQUETA}>Seguimientos</span>
              <p className="mt-1">
                {hechos} de {DIAS_SEGUIMIENTO.length} enviados.{" "}
                {seg.estado === "activos" && proximo && `El ${proximo.n}.º sale desde el ${dia(proximo.dia)}.`}
                {seg.estado === "cortados" && (seg.motivo || "Detenidos.")}
                {seg.estado === "completos" && "Ya salieron los tres."}
              </p>
            </div>
            {seg.estado === "activos" && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => correr(() => detenerSeguimientosCorreo(id), "Seguimientos detenidos")}>
                <PauseCircle /> Detener seguimientos
              </Button>
            )}
            {seg.estado === "cortados" && puedeAutorizar && hechos < DIAS_SEGUIMIENTO.length && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => correr(() => reanudarSeguimientosCorreo(id), "Seguimientos reanudados")}>
                <PlayCircle /> Reanudar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
