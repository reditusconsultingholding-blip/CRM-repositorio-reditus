"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Indicador de sincronización en vivo: re-consulta los datos del servidor
 * cada 5 segundos como máximo, y de inmediato apenas cambia algo en las
 * tablas indicadas (vía Supabase Realtime) — lo que llegue primero. Se
 * coloca junto al título de cada página con datos que deben verse al
 * instante. */
export function LiveSync({ tables = [] }: { tables?: string[] }) {
  const router = useRouter();
  const [lastSync, setLastSync] = useState<Date | null>(() => new Date());
  const [pulsing, setPulsing] = useState(false);
  const supabase = createClient();
  const timeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function doRefresh() {
      setPulsing(true);
      router.refresh();
      setLastSync(new Date());
      setTimeout(() => setPulsing(false), 700);
    }

    timeRef.current = setInterval(doRefresh, 5000);

    const channel = supabase.channel(`live-sync:${tables.join(",") || "none"}`);
    for (const t of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table: t }, doRefresh);
    }
    if (tables.length) channel.subscribe();

    return () => {
      if (timeRef.current) clearInterval(timeRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(",")]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Los datos se actualizan solos, cada 5 segundos como máximo">
      <span className={`size-1.5 rounded-full bg-green-500 ${pulsing ? "animate-ping" : ""}`} />
      Sync
      {lastSync && (
        <span className="font-mono">
          {lastSync.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      )}
    </span>
  );
}
