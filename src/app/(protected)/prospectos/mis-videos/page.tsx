import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORIGEN_PROSPECCION, etapaEfectiva, leerProspeccion } from "@/lib/prospeccion";
import { MisVideosLista, type PiezaAsignada } from "@/components/prospectos/mis-videos-lista";

// Vista mínima para quien tiene asignada una pieza de prospección. La tabla
// `prospectos` solo la ven por RLS los roles de Ingresos, así que aquí se lee
// con el cliente de servicio DESPUÉS de identificar a quien entra, y solo se
// le pasan a la pantalla los datos de producción (marca, tienda, producto y
// guion): nada de contacto, respuesta del cliente, mensaje ni notas.
export default async function MisVideosPage() {
  const profile = await requireProfile();
  const esIngresos = (INGRESOS_ROLES as string[]).includes(profile.role);

  const admin = createAdminClient();
  let consulta = admin
    .from("prospectos")
    .select("id, nombre, estado, respuestas_calificacion, created_at")
    .eq("origen", ORIGEN_PROSPECCION)
    .order("created_at", { ascending: false })
    .limit(200);
  // Quien no es de Ingresos solo recibe lo que tiene asignado.
  if (!esIngresos) consulta = consulta.eq("respuestas_calificacion->prospeccion->>editor_id", profile.id);
  const { data: filas } = await consulta;

  const idsEncargados = new Set<string>();
  const piezas: PiezaAsignada[] = [];
  const encargadoDe = new Map<string, string>();
  for (const f of filas ?? []) {
    const pros = leerProspeccion(f.respuestas_calificacion);
    if (!pros?.editor_id) continue;
    if (!esIngresos && pros.editor_id !== profile.id) continue; // doble seguro
    const etapa = etapaEfectiva(f.estado as string, pros);
    if (etapa === "descartado" || etapa === "convertido") continue;
    idsEncargados.add(pros.editor_id);
    piezas.push({
      id: f.id as string,
      nombre: f.nombre as string,
      servicio: pros.servicio,
      tienda: pros.tienda,
      producto: pros.producto,
      pais: pros.pais,
      guion: pros.guion,
      videoUrl: pros.video_url,
      videoNombre: pros.video_nombre,
      terminado: !!pros.video_terminado_at && !!pros.video_url,
      encargado: null,
    });
    encargadoDe.set(f.id as string, pros.editor_id);
  }

  if (esIngresos && idsEncargados.size) {
    const { data: personas } = await admin.from("users").select("id, name").in("id", [...idsEncargados]);
    const nombreDe = new Map((personas ?? []).map((u) => [u.id as string, u.name as string]));
    for (const p of piezas) p.encargado = nombreDe.get(encargadoDe.get(p.id) ?? "") ?? null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        {esIngresos && (
          <Link href="/prospectos" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Prospectos
          </Link>
        )}
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {esIngresos ? "Piezas de prospección asignadas" : "Mis videos de prospección"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Piezas gratis de muestra para marcas que todavía no son clientes. Sigue el guion, sube el resultado y márcalo
          terminado: el equipo comercial recibe el aviso.
        </p>
      </div>
      <MisVideosLista
        piezas={piezas}
        vacio={esIngresos ? "No hay piezas asignadas en este momento." : "No tienes piezas de prospección asignadas."}
      />
    </div>
  );
}
