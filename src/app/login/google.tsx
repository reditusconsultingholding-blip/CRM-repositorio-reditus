"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { entrarConGoogle } from "./actions";
import { GOOGLE_CLIENT_ID } from "@/lib/google-login";

type RespuestaGoogle = { credential?: string };
type GoogleId = {
  initialize: (o: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  prompt: () => void;
  disableAutoSelect: () => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const GSI = "https://accounts.google.com/gsi/client";

/** Botón «Continuar con Google» + ingreso automático: si la persona ya entró antes con
 * su cuenta de Google en este navegador, Google la reconoce y entra sin tocar nada.
 * Recién cerrada la sesión (?salio=1) no se intenta el ingreso automático. */
export function EntrarGoogle() {
  const salio = useSearchParams().get("salio") === "1";
  const caja = useRef<HTMLDivElement>(null);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    async function recibir(r: RespuestaGoogle) {
      if (!r.credential || !vivo) return;
      setError(null);
      setEntrando(true);
      try {
        const res = await entrarConGoogle(r.credential);
        if (res?.error && vivo) {
          setError(res.error);
          setEntrando(false);
          window.google?.accounts.id.disableAutoSelect();
        }
      } catch {
        // redirect() del servidor: la navegación al panel ya va en camino.
      }
    }

    function montar() {
      const id = window.google?.accounts.id;
      if (!id || !caja.current || !vivo) return;
      id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: recibir,
        auto_select: !salio,
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true,
        itp_support: true,
      });
      id.renderButton(caja.current, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        logo_alignment: "center",
        locale: "es",
        width: Math.min(400, Math.max(240, Math.round(caja.current.offsetWidth))),
      });
      if (salio) id.disableAutoSelect();
      else id.prompt();
    }

    if (window.google?.accounts?.id) montar();
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${GSI}"]`);
      if (!s) {
        s = document.createElement("script");
        s.src = GSI;
        s.async = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", montar);
    }
    return () => {
      vivo = false;
    };
  }, [salio]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-white/35">
        <span className="h-px flex-1 bg-white/10" />o con tu cuenta de Google
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="relative flex min-h-11 justify-center">
        <div ref={caja} className={entrando ? "pointer-events-none opacity-40" : ""} />
        {entrando && (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Entrando con Google…</span>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
