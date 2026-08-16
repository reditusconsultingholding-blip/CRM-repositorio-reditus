"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";

type Data = { rentabilidadSemana: number; ingresosSemanaUsd: number } | null;

const REFRESH_MS = 5 * 60 * 1000;

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function RentabilidadWidget() {
  const [data, setData] = useState<Data>(null);
  const [failed, setFailed] = useState(false);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    const interval = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const positive = (data?.rentabilidadSemana ?? 0) >= 0;

  return (
    <Link
      href="/ceo"
      className="flex flex-col gap-1 rounded-md border bg-muted/40 p-2.5 text-xs hover:bg-muted/70"
    >
      <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
        <TrendingUp className="size-3" />
        Rentabilidad (semana)
      </span>
      {data ? (
        <span className={`font-mono text-base font-semibold ${positive ? "text-green-600" : "text-red-600"}`}>
          {fmtUsd(data.rentabilidadSemana)}
        </span>
      ) : failed ? (
        <span className="text-muted-foreground">No disponible</span>
      ) : (
        <span className="text-muted-foreground">Cargando…</span>
      )}
    </Link>
  );
}
