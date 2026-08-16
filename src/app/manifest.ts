import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reditus CRM",
    short_name: "Reditus",
    description: "Reditus Consulting — ingresos, producción, equipo y rentabilidad.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#1a3a7a",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
