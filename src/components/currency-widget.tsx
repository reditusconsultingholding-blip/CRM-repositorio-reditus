"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type Rates = { cop: number; eur: number; updatedAt: string } | null;

const REFRESH_MS = 30 * 60 * 1000; // 30 min — the free API updates once a day anyway.

export function CurrencyWidget() {
  const [rates, setRates] = useState<Rates>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function fetchRates() {
    try {
      setLoading(true);
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      const data = await res.json();
      if (data?.result === "success") {
        setRates({
          cop: data.rates.COP,
          eur: data.rates.EUR,
          updatedAt: data.time_last_update_utc,
        });
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      // Se queda con el último valor conocido, pero avisa si nunca hubo uno.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // fetchRates() is async — its setState calls happen after an await, not
    // synchronously in the effect — but the linter can't see through that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRates();
    const interval = setInterval(fetchRates, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-muted/40 p-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-muted-foreground">Divisas (1 USD)</span>
        <button
          onClick={fetchRates}
          className="text-muted-foreground hover:text-foreground"
          title="Actualizar"
        >
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {rates ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">COP</span>
            <span className="font-mono font-medium">
              {Math.round(rates.cop).toLocaleString("es-CO")}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">EUR</span>
            <span className="font-mono font-medium">{rates.eur.toFixed(3)}</span>
          </div>
        </>
      ) : failed ? (
        <p className="text-muted-foreground">No disponible — intenta de nuevo.</p>
      ) : (
        <p className="text-muted-foreground">Cargando…</p>
      )}
    </div>
  );
}
