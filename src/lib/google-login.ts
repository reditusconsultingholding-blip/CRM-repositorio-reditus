// Ingreso con Google. El ID de cliente es público (viaja en la página); no hay secreto:
// el navegador recibe de Google un token firmado y el servidor lo comprueba contra las
// llaves públicas de Google antes de abrir la sesión.
export const GOOGLE_CLIENT_ID = "714359214707-hsesovhl7f6trskuf8u6ic04ugchbddi.apps.googleusercontent.com";

// Cuentas de Google que entran como otro usuario del CRM (correo de Google → correo del usuario).
// Así el CEO entra con el Gmail de la empresa sin cambiar el correo de su usuario.
export const GOOGLE_ALIAS: Record<string, string> = {
  "reditusconsultingholding@gmail.com": "alankvargasab31@gmail.com",
};
