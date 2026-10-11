import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pulso · Reditus" };

// Pulso (Omnipresente, Magneto y la presentación de ventas) se publica como
// app aparte; aquí se muestra embebido para no salir del CRM. La dirección
// se puede cambiar con NEXT_PUBLIC_PULSO_URL sin tocar el código.
const PULSO_URL = process.env.NEXT_PUBLIC_PULSO_URL || "https://pulso-reditus.vercel.app/";

export default function PulsoPage() {
  return (
    <iframe
      src={PULSO_URL}
      title="Pulso · resultados de las páginas de clientes"
      className="block h-full w-full border-0"
      allow="fullscreen; clipboard-write"
      allowFullScreen
    />
  );
}
