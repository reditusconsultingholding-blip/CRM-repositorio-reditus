"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { avisarNavegacion } from "@/components/cargador-seccion";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { crearProspectoManualProspeccion } from "@/app/(protected)/prospectos/prospeccion-actions";
import { CANALES, CANAL_LABELS, SERVICIOS, SERVICIO_LABELS, type Canal, type Servicio } from "@/lib/prospeccion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Segmento } from "./piezas";

const CONTACTO: Record<Canal, { etiqueta: string; ejemplo: string }> = {
  correo: { etiqueta: "Correo del prospecto", ejemplo: "dueno@tienda.com" },
  instagram: { etiqueta: "Usuario de Instagram", ejemplo: "@tienda" },
  whatsapp: { etiqueta: "Número de WhatsApp", ejemplo: "+57 300 000 0000" },
};

/** Formulario para registrar a mano un lead que respondió que sí. Usa la
 * misma función del servidor que el endpoint externo. */
export function ProspeccionFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [servicio, setServicio] = useState<Servicio>("video");
  const [canal, setCanal] = useState<Canal>("correo");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const r = await crearProspectoManualProspeccion(formData);
      if (r.error || !r.id) {
        toast.error(r.error ?? "No se pudo crear el prospecto.");
        return;
      }
      if (r.aviso) toast.warning(`Prospecto creado, pero sin guion. ${r.aviso}`, { duration: 9000 });
      else toast.success("Prospecto creado con su guion");
      setOpen(false);
      avisarNavegacion(`/prospectos/${r.id}`);
      router.push(`/prospectos/${r.id}`);
    });
  }

  const esVideo = servicio === "video";

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogTrigger render={<Button />}>
        <Plus /> Nuevo prospecto
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lead que dijo que sí</DialogTitle>
          <DialogDescription>
            Regístralo con lo que ya se analizó. Al guardar, la IA escribe el guion y el prospecto queda en «Falta
            enviar video».
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>¿Qué se le ofreció?</Label>
            <Segmento name="servicio" value={servicio} onChange={setServicio} opciones={SERVICIOS} etiquetas={SERVICIO_LABELS} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pp-nombre">Nombre o marca *</Label>
              <Input id="pp-nombre" name="nombre" required maxLength={160} placeholder="Marca o dueño" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pp-tienda">Tienda (URL) *</Label>
              <Input id="pp-tienda" name="tienda" required maxLength={300} placeholder="https://tienda.com" inputMode="url" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pp-producto">{esVideo ? "Producto del video *" : "Producto o página a mejorar *"}</Label>
              <Input
                id="pp-producto"
                name="producto"
                required
                maxLength={240}
                placeholder="El que más venden o pautan"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pp-pais">País</Label>
              <Input id="pp-pais" name="pais" maxLength={60} placeholder="Colombia, México, España…" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pp-falencia">Falencia detectada</Label>
            <Textarea
              id="pp-falencia"
              name="falencia"
              rows={2}
              maxLength={2000}
              placeholder={
                esVideo
                  ? "Ej.: solo pautan fotos de catálogo, ningún video muestra el producto en uso."
                  : "Ej.: mucho tráfico pero la página no muestra precio ni prueba antes del botón."
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pp-ads">Biblioteca de anuncios (enlace)</Label>
            <Input id="pp-ads" name="ads_library" maxLength={500} placeholder="https://www.facebook.com/ads/library/…" inputMode="url" />
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex flex-col gap-2">
              <Label>¿Por dónde respondió?</Label>
              <Segmento name="canal" value={canal} onChange={setCanal} opciones={CANALES} etiquetas={CANAL_LABELS} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pp-contacto">{CONTACTO[canal].etiqueta}</Label>
              <Input id="pp-contacto" name="contacto" maxLength={200} placeholder={CONTACTO[canal].ejemplo} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pp-respuesta">Lo que respondió, tal cual</Label>
              <Textarea id="pp-respuesta" name="respuesta" rows={3} maxLength={4000} placeholder="Pega aquí su mensaje." />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pp-notas">Notas internas</Label>
            <Textarea id="pp-notas" name="notas" rows={2} maxLength={2000} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando y escribiendo el guion…" : "Crear prospecto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
