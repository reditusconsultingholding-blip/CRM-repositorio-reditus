import "server-only";
import { createPublicKey, verify } from "node:crypto";
import { GOOGLE_CLIENT_ID } from "@/lib/google-login";

type Jwk = { kid: string; [k: string]: unknown };
let llaves: { hasta: number; keys: Jwk[] } | null = null;

async function llavesDeGoogle(): Promise<Jwk[]> {
  if (llaves && llaves.hasta > Date.now()) return llaves.keys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cache: "no-store" });
  if (!r.ok) throw new Error("certs");
  const { keys } = (await r.json()) as { keys: Jwk[] };
  llaves = { hasta: Date.now() + 60 * 60 * 1000, keys };
  return keys;
}

const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Comprueba el token que entrega «Entrar con Google» (firma, emisor, destinatario y
 * vigencia) y devuelve el correo verificado, o null si algo no cuadra. */
export async function correoDeGoogle(credential: string): Promise<string | null> {
  try {
    const [h, p, f] = credential.split(".");
    if (!h || !p || !f) return null;
    const cab = JSON.parse(b64(h).toString("utf8")) as { alg?: string; kid?: string };
    if (cab.alg !== "RS256" || !cab.kid) return null;
    let jwk = (await llavesDeGoogle()).find((k) => k.kid === cab.kid);
    if (!jwk) {
      llaves = null; // Google rota las llaves: se vuelven a pedir una vez
      jwk = (await llavesDeGoogle()).find((k) => k.kid === cab.kid);
    }
    if (!jwk) return null;
    const llave = createPublicKey({ key: jwk as never, format: "jwk" });
    if (!verify("RSA-SHA256", Buffer.from(h + "." + p), llave, b64(f))) return null;

    const d = JSON.parse(b64(p).toString("utf8")) as {
      iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean | string;
    };
    if (d.aud !== GOOGLE_CLIENT_ID) return null;
    if (d.iss !== "https://accounts.google.com" && d.iss !== "accounts.google.com") return null;
    if (!d.exp || d.exp * 1000 < Date.now()) return null;
    if (d.email_verified !== true && d.email_verified !== "true") return null;
    return d.email ? d.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}
