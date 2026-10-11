"use client";

import { Suspense, useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, KeyRound, MailCheck } from "lucide-react";
import { entrar, enviarRecuperacion, createPasswordAndSignIn } from "./actions";
import { LoginMarco } from "./marco";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Este navegador recuerda el correo de la última persona que entró (solo el
// correo, nunca la contraseña): al volver ya viene escrito y el navegador
// rellena la contraseña guardada, así que basta tocar «Entrar».
const CLAVE_CORREO = "reditus-crm-correo";
const CAMPO = "h-12 border-white/15 bg-white/[0.06] text-base text-white placeholder:text-white/30";

function recordar(correo: string) {
  try {
    window.localStorage.setItem(CLAVE_CORREO, correo);
  } catch {
    // almacenamiento bloqueado: se entra igual, sin recordar
  }
}

type Modo = "entrar" | "recuperar";

function Formulario() {
  const aviso = useSearchParams().get("aviso");
  const [modo, setModo] = useState<Modo>("entrar");
  const correoRef = useRef<HTMLInputElement>(null);
  const claveRef = useRef<HTMLInputElement>(null);

  const [estado, accionEntrar, entrando] = useActionState(entrar, undefined);
  const [recup, accionRecuperar, enviando] = useActionState(enviarRecuperacion, undefined);

  const [nueva, setNueva] = useState("");
  const [confirma, setConfirma] = useState("");
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  // Correo recordado: se escribe en el campo y el cursor queda en la contraseña.
  useEffect(() => {
    let guardado = "";
    try {
      guardado = window.localStorage.getItem(CLAVE_CORREO) ?? "";
    } catch {
      guardado = "";
    }
    if (guardado && correoRef.current && !correoRef.current.value) {
      correoRef.current.value = guardado;
      claveRef.current?.focus();
    }
  }, [modo]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setErrorCrear(null);
    if (nueva.length < 8) return setErrorCrear("La contraseña debe tener al menos 8 caracteres.");
    if (nueva !== confirma) return setErrorCrear("Las contraseñas no coinciden.");
    setCreando(true);
    const r = await createPasswordAndSignIn(estado?.email ?? "", nueva);
    if (r?.error) setErrorCrear(r.error);
    setCreando(false);
  }

  // Primera vez con este correo: crear la contraseña.
  if (estado?.crear && estado.email) {
    return (
      <form key="crear" onSubmit={crear} className="rd-paso flex flex-col gap-5">
        <Encabezado
          titulo="Crea tu contraseña"
          texto={`Es tu primera vez con ${estado.email}. Elige una contraseña de 8 caracteres o más.`}
        />
        <input
          type="text"
          value={estado.email}
          readOnly
          autoComplete="username"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        <Campo id="nueva" etiqueta="Contraseña nueva">
          <Input
            id="nueva"
            type="password"
            required
            minLength={8}
            autoFocus
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            className={CAMPO}
          />
        </Campo>
        <Campo id="confirma" etiqueta="Repítela">
          <Input
            id="confirma"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            className={CAMPO}
          />
        </Campo>
        {errorCrear && <Aviso>{errorCrear}</Aviso>}
        <Button type="submit" disabled={creando} className="rd-login-boton h-12 text-base">
          {creando ? "Creando…" : "Crear contraseña y entrar"}
        </Button>
      </form>
    );
  }

  if (modo === "recuperar") {
    return (
      <div key="recuperar" className="rd-paso flex flex-col gap-5">
        <button
          type="button"
          onClick={() => setModo("entrar")}
          className="flex w-fit items-center gap-1.5 text-xs text-white/55 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" />
          Volver a ingresar
        </button>
        {recup?.enviado ? (
          <div className="flex flex-col gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-[#0072ff]/20 text-[#7cc4ff]">
              <MailCheck className="size-6" />
            </span>
            <Encabezado
              titulo="Revisa tu correo"
              texto="Si ese correo tiene cuenta en el CRM, te acaba de llegar un enlace para crear una contraseña nueva. Ábrelo en este mismo navegador. Si no lo ves, mira en spam."
            />
          </div>
        ) : (
          <form action={accionRecuperar} className="flex flex-col gap-5">
            <Encabezado
              titulo="Recupera tu contraseña"
              texto="Escribe tu correo y te enviamos un enlace para crear una nueva."
            />
            <Campo id="correo-rec" etiqueta="Correo">
              <Input
                id="correo-rec"
                ref={correoRef}
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="username"
                placeholder="tu@correo.com"
                className={CAMPO}
              />
            </Campo>
            {recup?.error && <Aviso>{recup.error}</Aviso>}
            <Button type="submit" disabled={enviando} className="rd-login-boton h-12 text-base">
              {enviando ? "Enviando…" : "Enviarme el enlace"}
            </Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <form
      key="entrar"
      action={accionEntrar}
      onSubmit={() => {
        const c = correoRef.current?.value.trim().toLowerCase();
        if (c) recordar(c);
      }}
      className="rd-paso flex flex-col gap-5"
    >
      <Encabezado titulo="Ingresa" texto="Con tu correo y tu contraseña del equipo." />
      {aviso === "enlace" && (
        <Aviso>Ese enlace venció o ya se usó. Pide uno nuevo en «¿Olvidaste tu contraseña?».</Aviso>
      )}
      <Campo id="correo" etiqueta="Correo">
        <Input
          id="correo"
          ref={correoRef}
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="username"
          placeholder="tu@correo.com"
          defaultValue={estado?.email ?? ""}
          className={CAMPO}
        />
      </Campo>
      <Campo
        id="clave"
        etiqueta="Contraseña"
        lado={
          <button
            type="button"
            onClick={() => setModo("recuperar")}
            className="text-xs text-[#7cc4ff] transition-colors hover:text-white"
          >
            ¿Olvidaste tu contraseña?
          </button>
        }
      >
        <Input
          id="clave"
          ref={claveRef}
          name="password"
          type="password"
          autoComplete="current-password"
          className={CAMPO}
        />
      </Campo>
      {estado?.error && <Aviso>{estado.error}</Aviso>}
      <Button type="submit" disabled={entrando} className="rd-login-boton h-12 text-base">
        {entrando ? "Entrando…" : "Entrar"}
        {!entrando && <ArrowRight className="size-4" />}
      </Button>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-white/40">
        <KeyRound className="mt-0.5 size-3.5 shrink-0 text-[#5cc8ff]" />
        ¿Primera vez? Escribe tu correo y toca Entrar: te pedimos crear tu contraseña.
      </p>
    </form>
  );
}

function Encabezado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="font-heading text-2xl font-semibold tracking-tight">{titulo}</h2>
      <p className="text-sm leading-relaxed text-white/55">{texto}</p>
    </div>
  );
}

function Campo({
  id,
  etiqueta,
  lado,
  children,
}: {
  id: string;
  etiqueta: string;
  lado?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-white/75">
          {etiqueta}
        </Label>
        {lado}
      </div>
      {children}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-[#ff8a8a]/25 bg-[#ff8a8a]/10 px-3 py-2 text-sm text-[#ffb1b1]">
      {children}
    </p>
  );
}

export default function LoginPage() {
  return (
    <LoginMarco>
      <Suspense fallback={null}>
        <Formulario />
      </Suspense>
    </LoginMarco>
  );
}
