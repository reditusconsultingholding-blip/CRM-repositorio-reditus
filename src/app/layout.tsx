import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/push/register-sw";
import { CargadorApps } from "@/components/cargador-apps";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Poppins for headings/titles — Geist (above) stays the body font.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Reditus CRM",
  description: "Reditus Consulting — ingresos, producción y equipo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Reditus CRM",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a3a7a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      // La clase del tema (.dark) la pone un script antes de hidratar.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background">
        <RegisterServiceWorker />
        {children}
        <Toaster richColors position="top-right" />
        {/* Pantalla de carga al cambiar entre CRM y Pulso */}
        <CargadorApps />
      </body>
    </html>
  );
}
