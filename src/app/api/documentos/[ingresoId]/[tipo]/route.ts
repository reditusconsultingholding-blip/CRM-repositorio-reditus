import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DocumentoReditus, type DocumentoTipo } from "@/lib/pdf/DocumentoReditus";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ingresoId: string; tipo: string }> },
) {
  const { ingresoId, tipo } = await params;

  if (tipo !== "cotizacion" && tipo !== "cuenta_cobro") {
    return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
  }

  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const supabase = await createClient();
  const [{ data: ingreso, error }, { data: items }] = await Promise.all([
    supabase
      .from("ingresos")
      .select(
        "tracking_id, cantidad, servicio, producto, precio_final_descuento, moneda, cotizacion_numero, cuenta_cobro_numero, comision_plataforma, created_at, client:clients!ingresos_client_id_fkey(name, tax_id)",
      )
      .eq("id", ingresoId)
      .single(),
    supabase
      .from("ingreso_items")
      .select("producto, servicio, cantidad, precio_unitario")
      .eq("ingreso_id", ingresoId)
      .order("created_at", { ascending: true }),
  ]);

  if (error || !ingreso) {
    return NextResponse.json({ error: "Ingreso no encontrado." }, { status: 404 });
  }

  const documentoTipo = tipo as DocumentoTipo;

  if (documentoTipo === "cuenta_cobro" && !ingreso.cuenta_cobro_numero) {
    return NextResponse.json(
      { error: "Este ingreso todavía no está marcado como pagado." },
      { status: 400 },
    );
  }

  const cliente = Array.isArray(ingreso.client) ? ingreso.client[0] : ingreso.client;

  const buffer = await renderToBuffer(
    DocumentoReditus({
      tipo: documentoTipo,
      ingreso,
      cliente: cliente ?? { name: "Cliente", tax_id: null },
      items: items ?? [],
    }),
  );

  const numero =
    documentoTipo === "cuenta_cobro" ? ingreso.cuenta_cobro_numero : ingreso.cotizacion_numero;
  const nombreArchivo = documentoTipo === "cuenta_cobro" ? "factura" : "cotizacion";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivo}-${numero ?? ingreso.tracking_id}.pdf"`,
    },
  });
}
