import Link from "next/link";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { clave: "embudo", href: "/prospectos", texto: "Embudo" },
  { clave: "campanas", href: "/prospectos/campanas", texto: "Campañas" },
] as const;

/** Pestañas de /prospectos: el embudo y las campañas de correo en frío. */
export function PestanasProspectos({ activa }: { activa: (typeof PESTANAS)[number]["clave"] }) {
  return (
    <nav aria-label="Secciones de prospectos" className="inline-flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {PESTANAS.map((p) => (
        <Link
          key={p.clave}
          href={p.href}
          aria-current={p.clave === activa ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            p.clave === activa ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
