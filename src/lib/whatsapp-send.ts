import "server-only";

/** Envía un mensaje de texto por WhatsApp Cloud API (Meta). No hace nada
 * (retorna null) si las credenciales no están configuradas todavía. */
export async function sendWhatsAppMessage(to: string, body: string): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_SALES_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return false;

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  return res.ok;
}

/** Info del número conectado (el que se ve marcado, verificado, etc.) —
 * para mostrarlo en /whatsapp/ventas en vez de solo un "Conectado"
 * genérico. Devuelve null si falta configurar o Meta no responde. */
export async function getConnectedPhoneInfo(): Promise<{ displayNumber: string; verifiedName: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_SALES_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.display_phone_number) return null;
    return { displayNumber: data.display_phone_number, verifiedName: data.verified_name ?? "" };
  } catch {
    return null;
  }
}
