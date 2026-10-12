import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORIGEN_PROSPECCION, leerProspeccion } from "@/lib/prospeccion";
import { tarjetas } from "@/lib/video-formatos";
import { VIDEOS_ROLES, codigoDePais, type DatosVideo } from "@/lib/videos";
import { ID_VALIDO, VIDEO_IA_ACTIVO, listarGuiones } from "@/lib/videos-server";
import { CrearVideo, type ProspectoOrigen } from "@/components/videos/crear-video";

// «Crear video»: formato → datos del producto → investigación de mercado →
// guion → guardar. La ven los roles de Ingresos y quien edita video. Los
// guiones viven en Storage (no hay tabla), así que se leen con el cliente de
// servicio DESPUÉS de validar el rol.
export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ prospecto?: string | string[] }>;
}) {
  const profile = await requireProfile();
  if (!VIDEOS_ROLES.includes(profile.role)) redirect("/requerimientos");
  const esIngresos = INGRESOS_ROLES.includes(profile.role);

  const admin = createAdminClient();
  const { prospecto: crudo } = await searchParams;
  const prospectoId = typeof crudo === "string" && ID_VALIDO.test(crudo) ? crudo : null;

  // Si llega ?prospecto=<id>, se prellena desde su ficha. Quien no es de
  // Ingresos solo puede traer un prospecto que tenga asignado, y recibe
  // únicamente los datos de producción (nada de contacto ni respuestas).
  let prospecto: ProspectoOrigen | null = null;
  let inicial: Partial<DatosVideo> = {};
  if (prospectoId) {
    const { data: fila } = await admin
      .from("prospectos")
      .select("id, nombre, origen, respuestas_calificacion")
      .eq("id", prospectoId)
      .maybeSingle();
    const pros = fila ? leerProspeccion(fila.respuestas_calificacion) : null;
    if (fila && pros && fila.origen === ORIGEN_PROSPECCION && (esIngresos || pros.editor_id === profile.id)) {
      prospecto = { id: fila.id as string, nombre: fila.nombre as string };
      const pais = codigoDePais(pros.pais) ?? "CO";
      const valores = esIngresos
        ? [
            pros.falencia ? `Falencia detectada en su publicidad o tienda: ${pros.falencia}` : "",
            pros.respuesta ? `Lo que respondió el prospecto: ${pros.respuesta}` : "",
            pros.ads_library ? `Su biblioteca de anuncios: ${pros.ads_library}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";
      inicial = {
        producto: pros.producto,
        pais,
        paisBusqueda: pais,
        cliente: fila.nombre as string,
        enlace: pros.tienda,
        valores,
      };
    }
  }

  const { guiones, error } = await listarGuiones(admin);

  return (
    <CrearVideo
      formatos={tarjetas()}
      guiones={guiones}
      errorLista={error ?? null}
      inicial={inicial}
      prospecto={prospecto}
      prospectoNoEncontrado={!!prospectoId && !prospecto}
      puedeUsarEnProspecto={esIngresos}
      videoActivo={VIDEO_IA_ACTIVO}
    />
  );
}
