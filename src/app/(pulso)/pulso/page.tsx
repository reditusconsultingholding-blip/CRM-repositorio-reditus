import type { Metadata } from "next";
import { PulsoFrame } from "@/components/pulso-frame";

export const metadata: Metadata = { title: "Pulso · Reditus" };

// Pulso (Omnipresente, Magneto y la presentación de ventas) se publica como
// app aparte; aquí se muestra embebido para no salir del CRM. La dirección
// se puede cambiar con NEXT_PUBLIC_PULSO_URL sin tocar el código.
const PULSO_URL = process.env.NEXT_PUBLIC_PULSO_URL || "https://pulso.crmreditusconsulting.company/";

export default function PulsoPage() {
  return <PulsoFrame src={PULSO_URL} />;
}
