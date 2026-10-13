"use client";

import { useMemo, useState } from "react";
import { CopyPlus, Plus, Trash2 } from "lucide-react";
import type { ProyectoVideo } from "@/lib/proyecto-video";
import { costoDeVariaciones, ganchosDeInvestigacion, type PedidoVariacion } from "@/lib/proyecto-video-plan";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA } from "@/components/prospectos/piezas";

type Fila = { clave: number; gancho: string; oferta: string; llamado: string };

type Props = {
  proyecto: ProyectoVideo;
  /** El análisis de la investigación: de ahí salen los ganchos propuestos. */
  analisis: string;
  ocupado: boolean;
  onCerrar: () => void;
  onCrear: (pedidos: PedidoVariacion[]) => Promise<boolean>;
};

/**
 * «Crear variaciones»: versiones que cambian SOLO el gancho (escena 1) y/o
 * el cierre, y reutilizan todas las demás escenas ya aprobadas. Antes de
 * crear se ve exactamente qué se paga.
 */
export function CrearVariaciones({ proyecto, analisis, ocupado, onCerrar, onCrear }: Props) {
  const propuestos = useMemo(() => ganchosDeInvestigacion(analisis), [analisis]);
  const primera = proyecto.escenas[0];
  const [filas, setFilas] = useState<Fila[]>(() => (propuestos.length ? propuestos.slice(0, 3) : [""]).map((gancho, i) => ({ clave: i, gancho, oferta: "", llamado: "" })));
  const [siguiente, setSiguiente] = useState(10);
  const [regenerar, setRegenerar] = useState(false);
  const [nota, setNota] = useState("");
  const generable = primera?.tipo === "generada";

  const pedidos: PedidoVariacion[] = filas.map((f) => ({ gancho: f.gancho, regenerarGancho: regenerar && generable, notaGancho: nota, oferta: f.oferta, llamado: f.llamado }));
  const utiles = pedidos.filter((v) => v.gancho.trim() || v.oferta.trim() || v.llamado.trim() || v.regenerarGancho);
  const costo = costoDeVariaciones(proyecto, utiles);
  const cambiar = (clave: number, c: Partial<Fila>) => setFilas((l) => l.map((f) => (f.clave === clave ? { ...f, ...c } : f)));

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="gap-3 sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <DialogTitle>Crear variaciones</DialogTitle>
          <DialogDescription>Cada una cambia solo el gancho (escena 1) y/o el cierre. Las demás escenas ya aprobadas se reutilizan: no se vuelven a pagar.</DialogDescription>
        </DialogHeader>

        {propuestos.length > 0 ? (
          <p className="text-xs text-muted-foreground">Los ganchos vienen de la investigación de este producto. Edítalos, quita los que no quieras o agrega otros.</p>
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-300">La investigación de este guion no trae ganchos propuestos (la IA no estaba disponible): escríbelos a mano.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Hoy la escena 1 dice: «{primera?.voz || "sin voz"}». Cierre actual: «{proyecto.contexto.cierre.oferta}» · «{proyecto.contexto.cierre.llamadoALaAccion}».
        </p>

        <ol className="flex flex-col gap-2">
          {filas.map((f, i) => (
            <li key={f.clave} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-2">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary">{i + 1}</span>
                <Textarea value={f.gancho} maxLength={400} rows={2} placeholder="Gancho nuevo (lo que se dice en la escena 1). Vacío = el mismo gancho." aria-label={`Gancho de la variación ${i + 1}`} onChange={(e) => cambiar(f.clave, { gancho: e.target.value })} />
                <Button variant="ghost" size="icon-sm" aria-label={`Quitar la variación ${i + 1}`} disabled={filas.length === 1} onClick={() => setFilas((l) => l.filter((x) => x.clave !== f.clave))}>
                  <Trash2 />
                </Button>
              </div>
              <div className="grid gap-2 pl-8 sm:grid-cols-2">
                <Input value={f.oferta} maxLength={400} placeholder="Otra oferta (vacío = la misma)" aria-label={`Oferta de la variación ${i + 1}`} onChange={(e) => cambiar(f.clave, { oferta: e.target.value })} />
                <Input value={f.llamado} maxLength={200} placeholder="Otro llamado a la acción (vacío = el mismo)" aria-label={`Llamado de la variación ${i + 1}`} onChange={(e) => cambiar(f.clave, { llamado: e.target.value })} />
              </div>
            </li>
          ))}
        </ol>
        <Button
          variant="outline"
          className="self-start"
          disabled={filas.length >= 10}
          onClick={() => {
            setFilas((l) => [...l, { clave: siguiente, gancho: "", oferta: "", llamado: "" }]);
            setSiguiente((x) => x + 1);
          }}
        >
          <Plus /> Agregar variación
        </Button>

        {generable ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={regenerar} onChange={(e) => setRegenerar(e.target.checked)} />
              <span>
                Generar también una imagen y un clip nuevos para el gancho
                <span className="block text-xs text-muted-foreground">
                  {proyecto.contexto.voz.motor === "clip"
                    ? "Sin esto se conserva la imagen del gancho y se genera solo su clip (la voz la dice el clip). Con esto, también la imagen."
                    : "Sin esto solo cambia el texto (voz y subtítulo) sobre el mismo clip: no cuesta nada."}
                </span>
              </span>
            </label>
            {regenerar && <Input value={nota} maxLength={400} placeholder="Qué debe verse en el gancho nuevo (opcional)" aria-label="Qué debe verse en el gancho nuevo" onChange={(e) => setNota(e.target.value)} />}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">La escena 1 es de foto real: el gancho cambia solo en el texto, sin costo.</p>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-2" aria-live="polite">
          <span className={ETIQUETA}>Costo estimado</span>
          <Chip tono={costo.clips ? "ambar" : "verde"}>{utiles.length ? costo.texto : "Todavía no hay cambios"}</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={ocupado || !utiles.length || utiles.length !== filas.length} onClick={() => void onCrear(utiles)}>
            <CopyPlus /> {ocupado ? "Creando…" : `Crear ${utiles.length || ""} ${utiles.length === 1 ? "variación" : "variaciones"}`}
          </Button>
          {utiles.length !== filas.length && <span className="self-center text-xs text-amber-700 dark:text-amber-300">Hay variaciones sin ningún cambio: llénalas o quítalas.</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
