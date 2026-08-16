import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM: la contraseña real nunca toca la base de datos en texto
// plano. VAULT_ENCRYPTION_KEY es un secreto de 32 bytes (64 hex) que solo
// vive en las variables de entorno del servidor (local + Vercel), nunca
// en el repo ni en la base de datos.
function getKey() {
  const hex = process.env.VAULT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("VAULT_ENCRYPTION_KEY no está configurada (debe ser 64 caracteres hex).");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Empaquetado: iv.tag.ciphertext, todo en base64.
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptSecret(packed: string): string {
  const [ivB64, tagB64, dataB64] = packed.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Dato cifrado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}
