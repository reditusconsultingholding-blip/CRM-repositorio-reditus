import { notFound, redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ORIGEN_PROSPECCION, ROLES_ASIGNABLES, etapaEfectiva, leerProspeccion } from "@/lib/prospeccion";
import { ProspectoDetalle } from "@/components/prospectos/prospecto-detalle";
import { ROLES_ACTIVAN_ENVIO, leerCorreos } from "@/lib/prospeccion-correo";
import { envioSinConfirmar, faltaParaEnviar } from "@/lib/prospeccion-correo-server";

// Ficha de un prospecto del embudo «video gratis»: datos, guion, producción
// y mensaje de entrega. Solo roles de Ingresos (la RLS de `prospectos`
// también lo impide); quien edita ve lo suyo en /prospectos/mis-videos.
export default async function ProspectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) redirect("/prospectos/mis-videos");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: fila } = await supabase
    .from("prospectos")
    .select("id, nombre, whatsapp_number, email, estado, origen, respuestas_calificacion, notas, created_at")
    .eq("id", id)
    .maybeSingle();
  const pros = fila ? leerProspeccion(fila.respuestas_calificacion) : null;
  // Los prospectos de Calendly, WhatsApp o manuales no tienen ficha.
  if (!fila || !pros || fila.origen !== ORIGEN_PROSPECCION) notFound();

  const { data: personas } = await supabase
    .from("users")
    .select("id, name")
    .in("role", ROLES_ASIGNABLES[pros.servicio])
    .eq("active", true)
    .order("name");
  const asignables = (personas ?? []).map((u) => ({ id: u.id as string, name: u.name as string }));
  // Si el encargado actual ya no está en la lista (cambió de rol o se
  // desactivó), se muestra igual para que el selector no quede en blanco.
  if (pros.editor_id && !asignables.some((u) => u.id === pros.editor_id)) {
    const { data: actual } = await supabase.from("users").select("id, name").eq("id", pros.editor_id).maybeSingle();
    if (actual) asignables.push({ id: actual.id as string, name: actual.name as string });
  }

  const correos = leerCorreos(fila.respuestas_calificacion);

  return (
    <ProspectoDetalle
      id={fila.id as string}
      nombre={fila.nombre as string}
      whatsapp={(fila.whatsapp_number as string | null) ?? null}
      email={(fila.email as string | null) ?? null}
      notas={(fila.notas as string | null) ?? null}
      creado={fila.created_at as string}
      etapa={etapaEfectiva(fila.estado as string, pros)}
      pros={pros}
      asignables={asignables}
      correo={{
        correos,
        falta: faltaParaEnviar({ email: (fila.email as string | null) ?? null }, pros),
        sinConfirmar: envioSinConfirmar(correos),
        puedeAutorizar: ROLES_ACTIVAN_ENVIO.includes(profile.role),
      }}
    />
  );
}
