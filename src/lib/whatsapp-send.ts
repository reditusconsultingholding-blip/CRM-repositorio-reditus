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
