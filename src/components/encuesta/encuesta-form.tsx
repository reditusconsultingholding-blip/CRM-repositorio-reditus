"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { submitEncuesta } from "@/app/encuesta/[token]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function EncuestaForm({ token }: { token: string }) {
  const [puntuacion, setPuntuacion] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState("");
  const [quiereTestimonio, setQuiereTestimonio] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (puntuacion === 0) {
      toast.error("Selecciona una puntuación de 1 a 5.");
      return;
    }
    startTransition(async () => {
      const result = await submitEncuesta(token, puntuacion, comentario, quiereTestimonio);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setDone(true);
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-2xl">🙏</p>
        <p className="text-lg font-semibold">¡Gracias por tu respuesta!</p>
        <p className="text-sm text-muted-foreground">
          {quiereTestimonio
            ? "Te contactaremos pronto para coordinar tu testimonio en video y tu descuento del 15%."
            : "Tu opinión nos ayuda a mejorar."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium">¿Qué tan satisfecho quedaste con el servicio?</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPuntuacion(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-1"
            >
              <Star
                className={cn(
                  "size-8 transition-colors",
                  (hover || puntuacion) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <Textarea
        placeholder="¿Algo que quieras contarnos? (opcional)"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        rows={3}
      />

      <label className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <input
          type="checkbox"
          checked={quiereTestimonio}
          onChange={(e) => setQuiereTestimonio(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Quiero dejar un <strong>testimonio en video</strong> contando mi experiencia — a cambio recibes{" "}
          <strong>15% de descuento</strong> en tu próxima compra.
        </span>
      </label>

      <Button onClick={handleSubmit} disabled={pending} className="w-full">
        {pending ? "Enviando…" : "Enviar respuesta"}
      </Button>
    </div>
  );
}
