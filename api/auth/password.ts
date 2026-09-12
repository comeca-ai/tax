import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const KEY_LEN = 64;

/** Hash de senha no formato `scrypt:N:salt:hash` (hex). */
export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(senha, salt, KEY_LEN)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Verificação constante em tempo. */
export async function verificarSenha(
  senha: string,
  senhaHash: string,
): Promise<boolean> {
  const parts = senhaHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(senha, Buffer.from(saltHex, "hex"), KEY_LEN)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
