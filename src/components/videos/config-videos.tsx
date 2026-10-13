"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Save } from "lucide-react";
import { configVideos, guardarConfigVideos, type EstadoConfig } from "@/app/(protected)/videos/proyecto-actions";
import { EXIGENCIAS, EXIGENCIA_LABELS, sinLimiteDeGasto, type ConfigVideos, type Exigencia } from "@/lib/videos-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, Segmento } from "@/components/prospectos/piezas";

const ETIQ_EXIGENCIA: Record<Exigencia, string> = { estricto: "Estricto", normal: "Normal" };

function Numero({ etiqueta, ayuda, valor, onChange, vacio, disabled }: { etiqueta: string; ayuda?: string; valor: number | null; onChange: (v: number | null) => void; vacio?: string; disabled: boolean }) {
  return (
    <Label className="flex flex-col items-stretch gap-1.5">
      <span>{etiqueta}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        value={valor ?? ""}
        placeholder={vacio}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.trim() === "" ? null : Math.max(0, Math.round(Number(e.target.value) || 0)))}
      />
      {ayuda && <span className="text-xs font-normal text-muted-foreground">{ayuda}</span>}
    </Label>
  );
}

/**
 * «Topes y automatización»: lo usado hoy a la vista de todos, y los valores
 * que solo cambia el CEO (cuánto se automatiza y cuánto se puede gastar).
 * Mientras no haya un máximo de gasto, se avisa en grande.
 */
export function ConfigVideosTarjeta({ esCeo, inicial }: { esCeo: boolean; inicial: EstadoConfig | null }) {
  const [estado, setEstado] = useState<EstadoConfig | null>(inicial);
  const [c, setC] = useState<ConfigVideos | null>(inicial?.config ?? null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (inicial) return;
    let vivo = true;
    void configVideos().then((r) => {
      if (!vivo || "error" in r) return;
      setEstado(r);
      setC(r.config);
    });
    return () => {
      vivo = false;
    };
  }, [inicial]);

  if (!estado || !c) return null;
  const set = <K extends keyof ConfigVideos>(k: K, v: ConfigVideos[K]) => setC((x) => (x ? { ...x, [k]: v } : x));
  const sucio = JSON.stringify(c) !== JSON.stringify(estado.config);
  const quieto = !esCeo || guardando;

  async function guardar() {
    setGuardando(true);
    const r = await guardarConfigVideos(c);
    setGuardando(false);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    setEstado(r);
    setC(r.config);
    toast.success("Topes y automatización guardados");
  }

  return (
    <Card id="config-videos">
      <CardHeader>
        <CardTitle>Topes y automatización</CardTitle>
        <CardDescription>
          {esCeo ? "Cuánto avanza solo cada video y cuánto se puede gastar. Aplica a los proyectos nuevos; los topes, a todos desde ya." : "Los define el CEO. Aquí ves lo que queda hoy."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5" role="status">
          <Chip tono={estado.tope.usados >= estado.tope.max ? "ambar" : "neutro"}>
            Hoy: {estado.tope.usados} de {estado.tope.max} videos
          </Chip>
          <Chip tono={estado.tope.variaciones.usados >= estado.tope.variaciones.max ? "ambar" : "neutro"}>
            {estado.tope.variaciones.usados} de {estado.tope.variaciones.max} variaciones
          </Chip>
          <Chip tono={estado.config.creditosPorDia !== null && estado.creditosHoy >= estado.config.creditosPorDia ? "rojo" : "neutro"}>
            {estado.creditosHoy.toLocaleString("es-CO")} créditos gastados hoy{estado.config.creditosPorDia !== null ? ` de ${estado.config.creditosPorDia.toLocaleString("es-CO")}` : ""}
          </Chip>
        </div>
        {sinLimiteDeGasto(estado.config) && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-medium">No hay límite de gasto configurado.</strong> Con el modo directo y los lotes, lo único que frena el gasto hoy son los topes de cantidad (videos por día e intentos por escena).{" "}
              {esCeo ? "Pon abajo un máximo de créditos por proyecto y por día." : "Pídele al CEO que ponga un máximo de créditos."}
            </span>
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={c.autoImagenes} disabled={quieto} onChange={(e) => set("autoImagenes", e.target.checked)} />
            <span>
              Aprobación automática de imágenes
              <span className="block text-xs text-muted-foreground">La IA compara cada imagen con las fotos reales. Lo dudoso va a una persona.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={c.armarAlTerminarClips} disabled={quieto} onChange={(e) => set("armarAlTerminarClips", e.target.checked)} />
            <span>
              Armar en cuanto terminen los clips
              <span className="block text-xs text-muted-foreground">Se revisa el video armado, no clip por clip. El video final siempre lo aprueba una persona.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={c.aprobarProspectos} disabled={quieto} onChange={(e) => set("aprobarProspectos", e.target.checked)} />
            <span>
              Pedir mi aprobación antes de cada video de prospecto
              <span className="block text-xs text-muted-foreground">Apagado, cada prospecto nuevo se agenda solo hasta el tope diario. El video final lo sigue aprobando una persona.</span>
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm leading-none font-medium">Exigencia de la revisión</span>
            <Segmento value={c.exigencia} onChange={(v) => set("exigencia", v)} opciones={EXIGENCIAS} etiquetas={ETIQ_EXIGENCIA} disabled={quieto} />
            <span className="text-xs text-muted-foreground">{EXIGENCIA_LABELS[c.exigencia]}.</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Numero etiqueta="Videos nuevos por día" valor={c.videosPorDia} onChange={(v) => set("videosPorDia", v ?? 1)} disabled={quieto} />
          <Numero etiqueta="Variaciones por día" valor={c.variacionesPorDia} onChange={(v) => set("variacionesPorDia", v ?? 0)} disabled={quieto} />
          <Numero etiqueta="Intentos por escena" ayuda="Por imagen y por clip." valor={c.intentosPorEscena} onChange={(v) => set("intentosPorEscena", v ?? 3)} disabled={quieto} />
          <Numero etiqueta="Créditos máx. por proyecto" vacio="Sin límite" valor={c.creditosPorProyecto} onChange={(v) => set("creditosPorProyecto", v || null)} disabled={quieto} />
          <Numero etiqueta="Créditos máx. por día" vacio="Sin límite" valor={c.creditosPorDia} onChange={(v) => set("creditosPorDia", v || null)} disabled={quieto} />
        </div>
        <p className="text-xs text-muted-foreground">
          Al llegar a un máximo de gasto no se genera nada más (armar sigue siendo gratis) y el proyecto queda detenido con el aviso. Imágenes base y armados no cuentan para «videos por día».
          {estado.config.actualizadoPor ? ` Último cambio: ${estado.config.actualizadoPor}.` : ""}
        </p>
        {esCeo && (
          <div>
            <Button disabled={!sucio || guardando} onClick={() => void guardar()}>
              <Save /> {guardando ? "Guardando…" : sucio ? "Guardar" : "Guardado"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
