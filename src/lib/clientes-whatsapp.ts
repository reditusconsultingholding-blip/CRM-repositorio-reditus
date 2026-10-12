// Busca un cliente por su WhatsApp aunque el número esté escrito distinto
// («+57 300 123 4567», «573001234567», «300-123-4567»). Antes la búsqueda
// era por texto exacto y un mismo cliente quedaba duplicado en /clientes
// cada vez que alguien escribía su número con otro formato.

type ClienteEncontrado = { id: string; tax_id: string | null };

const MIN_DIGITOS = 8;

export function soloDigitos(numero: string): string {
  return numero.replace(/\D/g, "");
}

/** Dos números son el mismo si sus dígitos coinciden, o si uno es el otro
 * con el indicativo del país adelante. */
export function mismoWhatsapp(a: string, b: string): boolean {
  const da = soloDigitos(a);
  const db = soloDigitos(b);
  if (da.length < MIN_DIGITOS || db.length < MIN_DIGITOS) return da === db && da.length > 0;
  if (da === db) return true;
  const [corto, largo] = da.length <= db.length ? [da, db] : [db, da];
  return corto.length >= 10 && largo.endsWith(corto);
}

export async function buscarClientePorWhatsapp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  whatsapp: string,
): Promise<ClienteEncontrado | null> {
  const { data: exacto } = await supabase
    .from("clients")
    .select("id, tax_id")
    .eq("whatsapp_number", whatsapp)
    .limit(1)
    .maybeSingle();
  if (exacto) return exacto as ClienteEncontrado;

  const digitos = soloDigitos(whatsapp);
  if (digitos.length < MIN_DIGITOS) return null;

  // Los últimos 8 dígitos, en orden, con cualquier separador en medio.
  const patron = `%${digitos.slice(-8).split("").join("%")}%`;
  const { data: candidatos } = await supabase
    .from("clients")
    .select("id, tax_id, whatsapp_number, created_at")
    .ilike("whatsapp_number", patron)
    .order("created_at", { ascending: true })
    .limit(25);

  const igual = (candidatos ?? []).find((c: { whatsapp_number: string | null }) =>
    mismoWhatsapp(c.whatsapp_number ?? "", whatsapp),
  );
  return igual ? { id: igual.id, tax_id: igual.tax_id } : null;
}
