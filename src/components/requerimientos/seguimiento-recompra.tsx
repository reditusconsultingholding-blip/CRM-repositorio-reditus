"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Star, Send } from "lucide-react";
import { generarMensajeRecompra, confirmarRecompraEnviada } from "@/app/(protected)/requerimientos/recompra-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export type EncuestaInfo = {
  token: string;
  puntuacion: number | null;
  comentario: string | null;
  quiere_testimonio: boolean;
  respondido_at: string | null;
} | null;

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(label);
}

export function SeguimientoRecompra({
  ingresoId,
  encuesta,
  cicloCerrado,
  canManage,
}: {
  ingresoId: string;
  encuesta: EncuestaInfo;
  cicloCerrado: boolean;
  canManage: boolean;
}) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendingGen, startGen] = useTransition();
  const [pendingConfirm, startConfirm] = useTransition();
  const [confirmed, setConfirmed] = useState(cicloCerrado);

  const encuestaUrl = encuesta
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/encuesta/${encuesta.token}`
    : null;

  function handleGenerar() {
    startGen(async () => {
      const result = await generarMensajeRecompra(ingresoId);
      if (result.error) {
        toast.error(result.error);
      } else if (result.mensaje) {
        setMensaje(result.mensaje);
      }
    });
  }

  function handleConfirmar() {
    if (!confirm("¿Confirmas que ya enviaste el mensaje de recompra al cliente? Esto da por finalizado el servicio.")) return;
    startConfirm(async () => {
      const result = await confirmarRecompraEnviada(ingresoId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Servicio finalizado");
        setConfirmed(true);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Seguimiento y recompra</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Encuesta de calidad</p>
          {!encuesta ? (
            <p className="text-muted-foreground">
              Se genera sola apenas todas las piezas de este pedido queden terminadas.
            </p>
          ) : !encuesta.respondido_at ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{encuestaUrl}</code>
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => copy(encuestaUrl!, "Link copiado")}>
                <Copy className="size-3.5" /> Copiar
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={
                      (encuesta.puntuacion ?? 0) >= n ? "size-4 fill-amber-400 text-amber-400" : "size-4 text-muted-foreground"
                    }
                  />
                ))}
                {(encuesta.puntuacion ?? 0) <= 2 && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
                    EN CRISIS
                  </span>
                )}
              </div>
              {encuesta.comentario && <p className="text-muted-foreground">&quot;{encuesta.comentario}&quot;</p>}
              {encuesta.quiere_testimonio && (
                <p className="text-xs font-medium text-primary">🎬 Quiere dejar testimonio en video (15% descuento)</p>
              )}
            </div>
          )}
        </div>

        {encuesta?.respondido_at && (
          <>
            <Separator />
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Recompra</p>
              {confirmed ? (
                <p className="font-medium text-green-700">✅ Servicio finalizado — mensaje de recompra enviado.</p>
              ) : !canManage ? (
                <p className="text-muted-foreground">Gerente Comercial gestiona esta parte.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {!mensaje ? (
                    <Button type="button" size="sm" variant="outline" onClick={handleGenerar} disabled={pendingGen}>
                      {pendingGen ? "Generando…" : "Generar mensaje de recompra"}
                    </Button>
                  ) : (
                    <>
                      <p className="rounded-md border bg-muted/40 p-2.5 text-sm">{mensaje}</p>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => copy(mensaje, "Mensaje copiado")}>
                          <Copy className="size-3.5" /> Copiar
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={handleGenerar} disabled={pendingGen}>
                          Regenerar
                        </Button>
                        <Button type="button" size="sm" className="gap-1.5" onClick={handleConfirmar} disabled={pendingConfirm}>
                          <Send className="size-3.5" /> {pendingConfirm ? "Confirmando…" : "Ya lo envié"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
