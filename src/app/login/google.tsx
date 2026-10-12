"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { entrarConGoogle, solicitarAcceso, type GoogleState } from "./actions";
import { GOOGLE_CLIENT_ID } from "@/lib/google-login";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

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
// Roles que una persona puede pedir al registrarse (el de CEO no se pide).
const ROLES: UserRole[] = ["gerente_comercial", "directora_operativa", "editor_video", "disenador_landing", "programador"];
const QUE_VE: Record<string, string> = {
  gerente_comercial: "Ve ingresos, clientes, producción y Pulso.",
  directora_operativa: "Ve ingresos, producción y Pulso.",
  editor_video: "Ve solo su cola de edición de video.",
  disenador_landing: "Ve solo su cola de páginas.",
  programador: "Ve solo las páginas por publicar.",
};
const CAMPO =
  "h-11 w-full rounded-md border border-white/15 bg-white/[0.06] px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#00c6ff]";

/** Botón «Continuar con Google». Quien ya tiene cuenta activa entra directo (y la
 * próxima vez Google lo reconoce y entra solo). Quien no tiene cuenta pide acceso:
 * confirma su nombre, elige su rol y queda pendiente hasta que el CEO lo acepte.
 * Recién cerrada la sesión (?salio=1) no se intenta el ingreso automático. */
export function EntrarGoogle() {
  const salio = useSearchParams().get("salio") === "1";
  const caja = useRef<HTMLDivElement>(null);
  const credencial = useRef("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registro, setRegistro] = useState<{ correo: string } | null>(null);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");

  function aplicar(res: GoogleState) {
    setOcupado(false);
    if (!res) return;
    window.google?.accounts.id.disableAutoSelect();
    if ("error" in res) setError(res.error);
    else if ("registrar" in res) {
      setNombre(res.nombre);
      setRegistro({ correo: res.correo });
    } else if ("pendiente" in res) {
      setRegistro(null);
      setPendiente(res.correo);
    }
  }

  useEffect(() => {
    let vivo = true;

    async function recibir(r: RespuestaGoogle) {
      if (!r.credential || !vivo) return;
      credencial.current = r.credential;
      setError(null);
      setOcupado(true);
      try {
        const res = await entrarConGoogle(r.credential);
        if (vivo) aplicar(res);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se monta una vez por visita
  }, [salio]);

  async function enviar() {
    setError(null);
    if (nombre.trim().length < 3) return setError("Escribe tu nombre completo.");
    if (!rol) return setError("Elige tu rol.");
    setOcupado(true);
    try {
      aplicar(await solicitarAcceso(credencial.current, nombre, rol));
    } catch {
      setOcupado(false);
      setError("No se pudo enviar la solicitud. Intenta de nuevo en unos segundos.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-white/35">
        <span className="h-px flex-1 bg-white/10" />o con tu cuenta de Google
        <span className="h-px flex-1 bg-white/10" />
      </div>

      {pendiente ? (
        <div role="status" className="flex items-start gap-3 rounded-md border border-[#00c6ff]/30 bg-[#00c6ff]/[0.08] p-3 text-sm leading-relaxed text-white/85">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#00c6ff]" />
          <p>
            <b className="text-white">Listo, muchas gracias.</b> Recibimos tu solicitud con {pendiente}. Alank la revisa y, en cuanto la acepte, entras con
            «Continuar con Google».
          </p>
        </div>
      ) : registro ? (
        <div className="flex flex-col gap-3 rounded-md border border-white/12 bg-white/[0.03] p-3">
          <p className="text-sm leading-relaxed text-white/75">
            <b className="text-white">{registro.correo}</b> todavía no tiene cuenta. Dinos quién eres y Alank acepta tu ingreso.
          </p>
          <label className="flex flex-col gap-1.5 text-xs text-white/60">
            Tu nombre
            <input
              className={CAMPO}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Nombre y apellido"
              autoComplete="name"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-white/60">
            Tu rol en Reditus
            <select className={CAMPO + " [&>option]:text-black"} value={rol} onChange={(e) => setRol(e.target.value)}>
              <option value="">Elige tu rol…</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          {rol && <p className="text-xs text-white/45">{QUE_VE[rol]}</p>}
          <button
            type="button"
            onClick={enviar}
            disabled={ocupado}
            className="rd-login-boton flex h-11 items-center justify-center rounded-md text-sm font-semibold text-white disabled:opacity-60"
          >
            {ocupado ? "Enviando…" : "Pedir acceso"}
          </button>
        </div>
      ) : null}

      <div className={"relative min-h-11 justify-center " + (registro || pendiente ? "hidden" : "flex")}>
        <div ref={caja} className={ocupado ? "pointer-events-none opacity-40" : ""} />
        {ocupado && <span className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Entrando con Google…</span>}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      {!registro && !pendiente && (
        <p className="text-center text-xs leading-relaxed text-white/40">¿Eres nuevo en el equipo? Entra con Google, elige tu rol y Alank te acepta.</p>
      )}
    </div>
  );
}
