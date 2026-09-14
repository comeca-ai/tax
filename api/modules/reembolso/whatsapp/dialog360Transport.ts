import { createHash } from "node:crypto";
import {
  LIMITE_COMPROVANTE_BYTES,
  validarComprovanteWhatsapp,
} from "./comprovante";
const ORIGIN = "https://waba-v2.360dialog.io";
export function mediaProxyUrl(raw: string): string {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["lookaside.fbsbx.com", "waba-v2.360dialog.io"].includes(url.hostname) ||
    url.pathname !== "/whatsapp_business/attachments/"
  )
    throw new Error("Mídia não permitida");
  return `${ORIGIN}${url.pathname}${url.search}`;
}
async function limitedBody(response: Response, limit: number): Promise<Buffer> {
  if (!response.ok || !response.body) throw new Error("Falha no provedor");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > limit) throw new Error("Arquivo acima do limite");
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}
export function createDialog360Transport(
  apiKey: string,
  fetchFn: typeof fetch = fetch
) {
  if (!apiKey.trim()) throw new Error("API key ausente");
  const request = (url: string, init: RequestInit = {}) =>
    fetchFn(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
    });
  return {
    nome: "dialog360",
    async sendText(telefone: string, texto: string): Promise<string> {
      if (!/^[1-9]\d{7,14}$/.test(telefone) || !texto || texto.length > 4096)
        throw new Error("Mensagem inválida");
      const res = await request(`${ORIGIN}/messages`, {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: telefone,
          type: "text",
          text: { body: texto },
        }),
      });
      const parsed = JSON.parse((await limitedBody(res, 65536)).toString());
      const id: unknown = parsed?.messages?.[0]?.id;
      if (typeof id !== "string" || !id || id.length > 128)
        throw new Error("Resultado de envio incerto");
      return id;
    },
    async downloadMedia(id: string, nome?: string) {
      if (!/^\d{1,128}$/.test(id)) throw new Error("Mídia inválida");
      const meta = JSON.parse(
        (await limitedBody(await request(`${ORIGIN}/${id}`), 65536)).toString()
      );
      if (
        typeof meta.url !== "string" ||
        typeof meta.mime_type !== "string" ||
        !Number.isSafeInteger(meta.file_size) ||
        meta.file_size <= 0 ||
        meta.file_size > LIMITE_COMPROVANTE_BYTES
      )
        throw new Error("Metadados inválidos");
      const conteudo = await limitedBody(
        await request(mediaProxyUrl(meta.url)),
        LIMITE_COMPROVANTE_BYTES
      );
      if (
        conteudo.length !== meta.file_size ||
        typeof meta.sha256 !== "string" ||
        createHash("sha256").update(conteudo).digest("hex") !==
          meta.sha256.toLowerCase()
      )
        throw new Error("Integridade inválida");
      const extensions: Record<string, string> = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };
      const result = validarComprovanteWhatsapp({
        arquivoNome:
          nome || `comprovante.${extensions[meta.mime_type] ?? "bin"}`,
        arquivoMime: meta.mime_type,
        conteudo,
      });
      if (!result.ok) throw new Error(result.erro);
      return result.comprovante;
    },
  };
}
