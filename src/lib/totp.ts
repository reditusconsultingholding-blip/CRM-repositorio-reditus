import "server-only";
import { createHmac } from "crypto";

// Implementación mínima de TOTP (RFC 6238), el mismo algoritmo que usan
// Google Authenticator / Authy — código de 6 dígitos que cambia cada 30
// segundos, derivado de un secreto fijo (INGRESOS_DELETE_TOTP_SECRET) +
// la hora actual. No hace falta guardar el código en ningún lado: se
// recalcula igual en el servidor y en la pantalla de Configuración.
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

function getSecret(): Buffer | null {
  const raw = process.env.INGRESOS_DELETE_TOTP_SECRET;
  if (!raw) return null;
  return base32Decode(raw);
}

/** Código vigente ahora mismo — para mostrarlo en Configuración. */
export function currentTotpCode(): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  return hotp(secret, counter);
}

/** Segundos que faltan para que el código actual cambie. */
export function secondsUntilNextCode(): number {
  const nowSec = Math.floor(Date.now() / 1000);
  return STEP_SECONDS - (nowSec % STEP_SECONDS);
}

/** Verifica un código dado por el usuario — acepta también el paso
 * anterior/siguiente (±30s) por si el reloj está un poco desfasado. */
export function verifyTotpCode(code: string): boolean {
  const secret = getSecret();
  if (!secret) return false;
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (const delta of [0, -1, 1]) {
    if (hotp(secret, counter + delta) === clean) return true;
  }
  return false;
}
