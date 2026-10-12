import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { PAGINAS, hoyBogota, imagenPagina, paginaDelDia, paginaPorId } from "@/lib/seguimiento";
import { AntesDespues, type PaginaComparada } from "@/components/seguimiento/antes-despues";

export const dynamic = "force-dynamic";
export const metadata = { title: "Antes y después · Reditus" };

// «Antes y después en simultáneo» (pedido del CEO en la reunión del 12-oct):
// las dos capturas largas de una página, lado a lado, bajando a la vez, para
// grabarla como historia. Solo muestra capturas públicas de la presentación:
// la ve cualquiera del equipo, igual que Seguimiento diario.
export default async function AntesDespuesPage({ searchParams }: { searchParams: Promise<{ p?: string | string[] }> }) {
  await requireProfile();
  const { p } = await searchParams;
  const pedida = paginaPorId(typeof p === "string" ? p : null);
  const delDia = paginaDelDia(hoyBogota());
  const inicial = pedida ?? delDia ?? PAGINAS[0] ?? null;

  const paginas: PaginaComparada[] = PAGINAS.map((x) => ({
    id: x.id,
    nombre: x.nombre,
    antes: imagenPagina(x.id, "antes", true),
    despues: imagenPagina(x.id, "despues", true),
    urlAntes: x.antes,
    urlDespues: x.despues,
    delDia: x.id === delDia?.id,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <div>
        <Link href="/seguimiento" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Seguimiento diario
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Antes y después en simultáneo</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Las dos páginas bajan a la vez. Ponla en pantalla completa, dale a reproducir y graba la pantalla: sale lista para la historia.
        </p>
      </div>
      {inicial ? (
        <AntesDespues paginas={paginas} inicialId={inicial.id} />
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay páginas cargadas.</p>
      )}
    </div>
  );
}
