"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// Ingreso con huella, rostro o PIN del dispositivo (passkey / WebAuthn).
// Cada dispositivo se activa una vez desde aquí; después, en la pantalla de
// ingreso basta tocar «Entrar con huella». La llave vive en el dispositivo:
// el CRM no guarda ni ve la huella ni el PIN.
export const CLAVE_HUELLA = "reditus-crm-huella";

type Llave = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

function fecha(iso?: string) {
  if (!iso) return "sin usar";
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function nombreDispositivo() {
  const ua = navigator.userAgent;
  const equipo = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "PC con Windows" : "Dispositivo";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "navegador";
  return `${equipo} · ${nav}`;
}

export function PasskeyCard() {
  const [compatible, setCompatible] = useState<boolean | null>(null);
  const [llaves, setLlaves] = useState<Llave[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await createClient().auth.passkey.list();
    if (!error && data) setLlaves(data);
  }, []);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "PublicKeyCredential" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depende del navegador: solo se sabe al montar
    setCompatible(ok);
    if (ok) void cargar();
  }, [cargar]);

  async function activar() {
    setOcupado(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.registerPasskey();
    if (error || !data) {
      // Cancelar el aviso del sistema no es un error que haya que mostrar en rojo.
      if (error && !/abort|cancel|not allowed|timed out/i.test(error.message)) {
        toast.error("No se pudo activar en este dispositivo. Intenta de nuevo.");
      }
      setOcupado(false);
      return;
    }
    await supabase.auth.passkey.update({ passkeyId: data.id, friendlyName: nombreDispositivo() }).catch(() => undefined);
    try {
      window.localStorage.setItem(CLAVE_HUELLA, "1");
    } catch {
      // sin almacenamiento: la huella funciona igual, solo no se destaca el botón en el ingreso
    }
    toast.success("Listo: en este dispositivo ya puedes entrar con huella o PIN.");
    await cargar();
    setOcupado(false);
  }

  async function quitar(id: string) {
    setOcupado(true);
    const { error } = await createClient().auth.passkey.delete({ passkeyId: id });
    if (error) toast.error("No se pudo quitar. Intenta de nuevo.");
    else toast.success("Dispositivo quitado.");
    await cargar();
    setOcupado(false);
  }

  if (compatible === false) {
    return <p className="text-sm text-muted-foreground">Este navegador no permite entrar con huella o PIN.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Activa este dispositivo una vez y la próxima vez entras con tu huella, tu rostro o el PIN del equipo, sin escribir
        la contraseña. Hazlo solo en dispositivos tuyos.
      </p>

      {llaves.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {llaves.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-medium">{l.friendly_name || "Dispositivo"}</span>
                <span className="block text-xs text-muted-foreground">
                  Activado el {fecha(l.created_at)} · último uso: {fecha(l.last_used_at)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={ocupado}
                onClick={() => quitar(l.id)}
                aria-label={`Quitar ${l.friendly_name || "dispositivo"}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" onClick={activar} disabled={ocupado || compatible === null} className="w-fit gap-2">
        <Fingerprint className="size-4" />
        {ocupado ? "Un momento…" : llaves.length ? "Activar también en este dispositivo" : "Activar en este dispositivo"}
      </Button>
    </div>
  );
}
