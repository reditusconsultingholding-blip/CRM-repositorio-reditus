import type { Metadata } from "next";
import { createHmac } from "node:crypto";
import { PulsoFrame } from "@/components/pulso-frame";

export const metadata: Metadata = { title: "Pulso · Reditus" };
// El pase cambia en cada visita: esta página no se guarda en caché.
export const dynamic = "force-dynamic";

// Pulso (Omnipresente, Magneto y la presentación de ventas) se publica como
// app aparte; aquí se muestra embebido para no salir del CRM. La dirección
// se puede cambiar con NEXT_PUBLIC_PULSO_URL sin tocar el código.
const PULSO_URL = process.env.NEXT_PUBLIC_PULSO_URL || "https://pulso.crmreditusconsulting.company/";

/** Pulso es privado: solo abre con un pase firmado que dura 3 minutos. El
 * layout de esta ruta ya comprobó la sesión y el rol, así que aquí solo se
 * firma. El secreto (PULSO_SECRETO) es el mismo en el proyecto de Pulso;
 * mientras no esté definido, Pulso sigue abierto y no se añade pase. */
function conPase(direccion: string): string {
  const secreto = process.env.PULSO_SECRETO;
  if (!secreto) return direccion;
  const vence = Math.floor(Date.now() / 1000) + 180;
  const firma = createHmac("sha256", secreto).update(`pulso:k:${vence}`).digest("hex");
  const url = new URL(direccion);
  url.searchParams.set("k", `k.${vence}.${firma}`);
  return url.toString();
}

export default function PulsoPage() {
  return <PulsoFrame src={conPase(PULSO_URL)} />;
}
