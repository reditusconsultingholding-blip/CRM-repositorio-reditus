"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { LogIn, LogOut as ClockOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clockIn, clockOut } from "@/app/(protected)/attendance-actions";

type AttendanceRow = { id: string; clock_in: string; clock_out: string | null } | null;

/** Reloj fijo (hora Colombia) + botón de marcar entrada/salida. Vive en el
 * Sidebar así que aparece igual en todas las páginas protegidas. */
export function ClockWidget({ initial }: { initial: AttendanceRow }) {
  const [now, setNow] = useState(() => new Date());
  const [record, setRecord] = useState<AttendanceRow>(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = now.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  function handleToggle() {
    startTransition(async () => {
      try {
        if (!record || record.clock_out) {
          const r = await clockIn();
          setRecord(r);
          toast.success("Entrada marcada");
        } else {
          const r = await clockOut(record.id);
          setRecord(r);
          toast.success("Salida marcada");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo marcar");
      }
    });
  }

  const clockedIn = record && !record.clock_out;

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-2.5 py-2 text-xs">
      <div className="leading-tight">
        <p className="font-mono text-sm font-semibold tabular-nums">{timeStr}</p>
        <p className="text-[10px] text-muted-foreground">Hora Colombia</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={clockedIn ? "outline" : "default"}
        disabled={pending}
        onClick={handleToggle}
        className="h-7 gap-1 px-2 text-[11px]"
      >
        {clockedIn ? <ClockOutIcon className="size-3" /> : <LogIn className="size-3" />}
        {clockedIn ? "Salida" : "Entrada"}
      </Button>
    </div>
  );
}
