import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORIGEN_PROSPECCION, leerProspeccion } from "@/lib/prospeccion";
import { tarjetas } from "@/lib/video-formatos";
import { VIDEOS_ROLES, codigoDePais, versionVigente, type DatosVideo } from "@/lib/videos";
import { ID_VALIDO, listarGuiones } from "@/lib/videos-server";
import { ponerAlDiaProyecto } from "@/lib/proyecto-video-server";
import { vistaTrabajo, type TrabajoVista } from "@/lib/trabajos-video";
import { buscarTrabajo, listarTrabajos, servidorVideoActivo, topeDeHoy } from "@/lib/trabajos-video-server";
import { CrearVideo, type ProspectoOrigen } from "@/components/videos/crear-video";
import { ColaVideos } from "@/components/videos/cola-videos";
import { configVideos } from "./proyecto-actions";

// «Crear video»: formato → datos del producto → investigación de mercado →
// guion → guardar. La ven los roles de Ingresos y quien edita video. Los
// guiones viven en Storage (no hay tabla), así que se leen con el cliente de
// servicio DESPUÉS de validar el rol.
// Las acciones de esta pantalla (investigación con anuncios, guion) pueden tardar más que el límite por defecto.
export const maxDuration = 300;

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ prospecto?: string | string[]; guion?: string | string[] }>;
}) {
  const profile = await requireProfile();
  if (!VIDEOS_ROLES.includes(profile.role)) redirect("/requerimientos");
  const esIngresos = INGRESOS_ROLES.includes(profile.role);

  const admin = createAdminClient();
  const { prospecto: crudo, guion: guionCrudo } = await searchParams;
  const abrirGuionId = typeof guionCrudo === "string" && ID_VALIDO.test(guionCrudo) ? guionCrudo : null;
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

  const videoActivo = servidorVideoActivo();
  const esCeo = profile.role === "ceo";
  // Todo a la vez: antes iba una consulta detrás de otra y la página tardaba la suma de todas.
  const [{ guiones, error }, cfg, prospectosLote] = await Promise.all([
    // Los proyectos por escenas recogen aquí lo que el servidor de videos ya entregó.
    listarGuiones(admin).then(async (l) => ({ error: l.error, guiones: await Promise.all(l.guiones.map(async (g) => (await ponerAlDiaProyecto(admin, g, false)).g)) })),
    // Topes y automatización (los ve todo el que opera; los cambia el CEO).
    configVideos(),
    // Prospectos del embudo que se pueden meter a un lote (solo equipo comercial; solo datos de producción).
    esIngresos
      ? admin
          .from("prospectos")
          .select("id, nombre, origen, respuestas_calificacion")
          .eq("origen", ORIGEN_PROSPECCION)
          .order("created_at", { ascending: false })
          .limit(40)
          .then(({ data }) =>
            (data ?? []).flatMap((f) => {
              const pros = leerProspeccion(f.respuestas_calificacion);
              return pros?.producto ? [{ id: f.id as string, nombre: f.nombre as string, producto: pros.producto, pais: pros.pais }] : [];
            }),
          )
      : Promise.resolve([] as { id: string; nombre: string; producto: string; pais: string }[]),
  ]);
  // «Mis videos»: en qué va lo que pidió esta persona. Sale de los guiones ya leídos; solo se busca
  // el trabajo de los videos completos de antes (los proyectos por escenas ya vienen al día).
  const misTrabajos: Record<string, TrabajoVista> = {};
  await Promise.all(
    guiones
      .filter((g) => g.autorId === profile.id)
      .slice(0, 8)
      .map(async (g) => {
        const idTrabajo = versionVigente(g)?.videoTrabajoId ?? null;
        const t = idTrabajo ? await buscarTrabajo(idTrabajo) : null;
        if (t) misTrabajos[g.id] = vistaTrabajo(t.trabajo);
      }),
  );

  return (
    <CrearVideo
      formatos={tarjetas()}
      guiones={guiones}
      errorLista={error ?? null}
      inicial={inicial}
      prospecto={prospecto}
      prospectoNoEncontrado={!!prospectoId && !prospecto}
      puedeUsarEnProspecto={esIngresos}
      videoActivo={videoActivo}
      puedeAprobarVideo={esIngresos}
      esCeo={esCeo}
      config={"error" in cfg ? null : cfg}
      prospectosLote={prospectosLote}
      abrirGuionId={abrirGuionId}
      userId={profile.id}
      misTrabajos={misTrabajos}
    >
      {/* La cola completa (solo CEO, sección Ajustes) no frena la página: llega cuando esté. */}
      {videoActivo && esCeo ? (
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando la cola del servidor…</p>}>
          <ColaDelServidor />
        </Suspense>
      ) : null}
    </CrearVideo>
  );
}

/** La cola del servidor de videos. Va aparte para que el resto de Creativos pinte sin esperarla. */
async function ColaDelServidor() {
  const admin = createAdminClient();
  const [l, tope] = await Promise.all([listarTrabajos(admin), topeDeHoy(admin)]);
  return <ColaVideos trabajos={l.trabajos.map(vistaTrabajo)} tope={tope} aviso={l.error ?? null} />;
}
