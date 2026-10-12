"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { BotonCifras, Cifra, useCifrasOcultas } from "@/components/cifra-privada";

type Data = {
  rentabilidadSemana: number;
  ingresosSemanaUsd: number;
  rentabilidadMes: number;
  ingresosMesUsd: number;
} | null;

const REFRESH_MS = 5 * 60 * 1000;

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function RentabilidadWidget() {
  const [data, setData] = useState<Data>(null);
  const [failed, setFailed] = useState(false);
  // Modo privado: con las cifras ocultas ni siquiera se piden al servidor.
  const ocultas = useCifrasOcultas();

  async function fetchData() {
    try {
      const res = await fetch("/api/ceo/rentabilidad");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    if (ocultas) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    const interval = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(interval);
  }, [ocultas]);

  const color = (n: number) => (n >= 0 ? "text-green-600" : "text-red-600");

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-muted/40 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <Link href="/ceo" className="flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
          <TrendingUp className="size-3" />
          Rentabilidad
        </Link>
        <BotonCifras />
      </div>
      {ocultas || data ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Semana</span>
            <Cifra
              valor={ocultas || !data ? null : fmtUsd(data.rentabilidadSemana)}
              className="font-semibold"
              claseVisible={data ? color(data.rentabilidadSemana) : undefined}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Mes</span>
            <Cifra
              valor={ocultas || !data ? null : fmtUsd(data.rentabilidadMes)}
              className="font-semibold"
              claseVisible={data ? color(data.rentabilidadMes) : undefined}
            />
          </div>
        </>
      ) : failed ? (
        <span className="text-muted-foreground">No disponible</span>
      ) : (
        <span className="text-muted-foreground">Cargando…</span>
      )}
    </div>
  );
}
