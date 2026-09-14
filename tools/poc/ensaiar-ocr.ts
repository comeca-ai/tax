import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import { VisaoOcrProvider } from "../../api/modules/fiscal/ocr/visao";
import { HeuristicOcrProvider } from "../../api/modules/fiscal/ocr";
import { OpenAiPolicyParser } from "../../api/modules/reembolso/policy/openai";
// @ts-expect-error ferramenta operacional JavaScript
import { criarFetchLimitado } from "./limite-consultas.mjs";

/** PDF sintético: nenhum documento do usuário é transmitido por este ensaio. */
export function pdfSintetico(linhas: string[]): Buffer {
  const texto = linhas.map((s, i) => `${i ? "0 -22 Td " : ""}(${s.replace(/[\\()]/g, "\\$&")}) Tj`).join("\n");
  const stream = `BT /F1 14 Tf 40 750 Td\n${texto}\nET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objetos.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function main() {
  if (process.argv[2] !== "--executar-confirmado") throw new Error("Execução manual não confirmada");
  const arquivo = "/root/.config/codex-secrets/poc-consultas-2026-09-13.jsonl";
  const env = parse(fs.readFileSync("/etc/reembolsa/homolog.env"));
  if (!env.OPENAI_API_KEY?.trim()) throw new Error("Credencial ausente");
  process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  process.env.OCR_OPENAI_MODEL = env.OCR_OPENAI_MODEL ?? "gpt-4o-mini";
  process.env.POLICY_OPENAI_MODEL = env.POLICY_OPENAI_MODEL ?? "gpt-4o-mini";
  process.env.OCR_VISION_PROVIDER = "openai";
  delete process.env.MISTRAL_API_KEY; // Nenhum provedor alternativo autorizado neste ensaio.
  const eventos: Record<string, unknown>[] = [];
  const chaveSintetica = "35260900000000000191550010000000011000000010";
  let cenario = "ocr_pdf_identidade_fiscal";
  const limited = criarFetchLimitado({ arquivo, cenario: () => cenario,
    registrar: (evento: Record<string, unknown>) => { eventos.push(evento); console.log(JSON.stringify(evento)); } });
  globalThis.fetch = (input, init = {}) => {
    // Limite de saída menor que o padrão de política; nenhum aumento de orçamento.
    const body = JSON.parse(String(init.body)); body.max_output_tokens = Math.min(body.max_output_tokens ?? 2000, 2000);
    return limited(input, { ...init, body: JSON.stringify(body) });
  };
  const ocr = await new VisaoOcrProvider(new HeuristicOcrProvider()).extrair({
    arquivoNome: "comprovante-sintetico.pdf", arquivoMime: "application/pdf",
    arquivoBase64: pdfSintetico([
      "DOCUMENTO SINTETICO PARA TESTE - SEM VALOR FISCAL", "POSTO DE TESTE",
      "CNPJ emitente: 00.000.000/0001-91", "CNPJ destinatario: 11.111.111/0001-91",
      `Chave de acesso: ${chaveSintetica}`,
      "Data: 13/09/2026", "Gasolina: 25,00 litros", "VALOR TOTAL: R$ 123,45",
    ]).toString("base64"),
  });
  const resultados: Record<string, unknown>[] = [{ cenario, provedorOpenai: ocr.provedor === "visao-ia:openai",
    totalCorreto: ocr.valor === 123.45, dataCorreta: ocr.dataFatoGerador === "2026-09-13", litrosCorretos: ocr.litros === 25,
    destinatarioCorreto: ocr.cnpjDestinatario?.replace(/\D/g, "") === "11111111000191", chaveCorreta: ocr.chaveAcesso === chaveSintetica }];
  // Falha de credencial/quota/modelo não deve gastar outra unidade repetindo o problema.
  if (ocr.provedor === "visao-ia:openai" && !process.argv.includes("--somente-ocr")) {
    cenario = "politica_texto_sintetico";
    const politica = await new OpenAiPolicyParser().extract({ arquivoNome: "politica-sintetica.txt", mimeType: "text/plain",
      base64: Buffer.from("POLITICA SINTETICA DE TESTE. Moeda BRL. Alimentacao em viagem de trabalho: reembolsavel ate R$ 50,00 por dia, mediante nota fiscal. Bebidas alcoolicas sao vedadas. Vigencia 13/09/2026.").toString("base64") });
    resultados.push({ cenario, provedorOpenai: politica.provedor.startsWith("openai:"), possuiRegras: politica.regras.regrasExtraidas.length > 0 });
  }
  const fontes = ["api/modules/fiscal/ocr/visao.ts", "api/modules/reembolso/policy/openai.ts", "tools/poc/ensaiar-ocr.ts"];
  const report = { em: new Date().toISOString(), somenteDadosSinteticos: true, limite: 20,
    fontesSha256: Object.fromEntries(fontes.map(file => [file, createHash("sha256").update(fs.readFileSync(file)).digest("hex")])), eventos, resultados };
  const destino = path.resolve("docs/poc/evidencias"); fs.mkdirSync(destino, { recursive: true });
  const primeiraConsulta = eventos.find(e => e.estado === "reservada")?.consulta;
  fs.writeFileSync(path.join(destino, `consultas-2026-09-13-${primeiraConsulta ?? "sem-rede"}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ resultados, consultasNestaExecucao: eventos.filter(e => e.estado === "reservada").length }));
  if (!resultados.every(r => Object.values(r).filter(v => typeof v === "boolean").every(Boolean))) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("ensaiar-ocr.ts")) void main().catch(() => { console.error("Ensaio interrompido; consultar registro sanitizado de reservas, sem reexecutar automaticamente."); process.exitCode = 1; });
