import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HeuristicOcrProvider } from "./index";
import { VisaoOcrProvider } from "./visao";

/**
 * Leitura local antes da IA paga no comprovante (mesmo pré-passo da política).
 * Cada teste afirma QUAIS chamadas externas aconteceram — o dinheiro está aí.
 */

const SIDECAR = "http://127.0.0.1:4190";

/** Bytes que não são PDF: pdf-parse falha → sem texto nativo → sidecar decide. */
const ESCANEADO = {
  arquivoNome: "cupom.pdf",
  arquivoMime: "application/pdf",
  arquivoBase64: Buffer.from("nao-e-um-pdf-de-verdade").toString("base64"),
};

/** Cupom que o heurístico fecha sozinho: emitente, valor, data e categoria. */
const CUPOM_COMPLETO = [
  "RESTAURANTE TESTE LTDA",
  "CNPJ: 12.345.678/0001-95",
  "Data de emissão: 13/09/2026",
  "Almoço — refeição",
  "VALOR TOTAL: R$ 87,40",
].join("\n");

/** Sem CNPJ nem data: o heurístico não fecha, a IA de visão precisa entrar. */
const CUPOM_ILEGIVEL = "RESTAURANTE TESTE\nconsumo no local\nvalor total: R$ 87,40";

const ENV = ["OCR_LOCAL_URL", "OCR_LOCAL_TOKEN", "POLICY_OCR_URL", "MISTRAL_API_KEY", "OPENAI_API_KEY"] as const;

describe("comprovante: OCR local antes da IA paga", () => {
  const fetchOriginal = globalThis.fetch;
  let anterior: Record<string, string | undefined>;
  let chamadas: string[];
  let textoDoSidecar: string | null;

  beforeEach(() => {
    anterior = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
    for (const k of ENV) delete process.env[k];
    chamadas = [];
    textoDoSidecar = null;
    globalThis.fetch = (async (url: string | URL) => {
      const alvo = String(url);
      chamadas.push(new URL(alvo).host);
      if (alvo.startsWith(SIDECAR)) {
        if (textoDoSidecar === null) return new Response("", { status: 503 });
        return Response.json({ texto: textoDoSidecar, paginas: [1], motor: "paddleocr", segundos: 1 });
      }
      throw new Error("IA paga não deveria ter sido chamada neste teste");
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    for (const [k, v] of Object.entries(anterior)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  function provider() {
    return new VisaoOcrProvider(new HeuristicOcrProvider());
  }

  it("sidecar lê o cupom inteiro: nenhuma IA paga é chamada", async () => {
    process.env.OCR_LOCAL_URL = SIDECAR;
    textoDoSidecar = CUPOM_COMPLETO;

    const extracao = await provider().extrair(ESCANEADO);

    expect(chamadas).toEqual(["127.0.0.1:4190"]);
    expect(extracao.valor).toBe(87.4);
    expect(extracao.dataFatoGerador).toBe("2026-09-13");
    expect(extracao.provedor).toBe("heuristico-local:paddle");
    expect(extracao.avisos[0]).toContain("OCR local (paddleocr");
  });

  it("texto local incompleto: IA de visão assume e o aviso diz o que faltou", async () => {
    process.env.OCR_LOCAL_URL = SIDECAR;
    textoDoSidecar = CUPOM_ILEGIVEL;

    const extracao = await provider().extrair(ESCANEADO);

    // Sem chave de IA: cascata paga nem é tentada, mas o aviso local sobrevive.
    expect(chamadas).toEqual(["127.0.0.1:4190"]);
    expect(extracao.avisos[0]).toContain("Faltaram campos essenciais");
    expect(extracao.avisos[0]).toContain("cnpjEmitente");
    expect(extracao.avisos.at(-1)).toContain("IA de visão indisponível");
  });

  it("sidecar fora (503): aviso nomeia a indisponibilidade e segue o caminho pago", async () => {
    process.env.OCR_LOCAL_URL = SIDECAR;
    textoDoSidecar = null;

    const extracao = await provider().extrair(ESCANEADO);

    expect(chamadas).toEqual(["127.0.0.1:4190"]);
    expect(extracao.avisos[0]).toContain("OCR local indisponível (HTTP 503)");
  });

  it("sem URL de OCR local: caminho de hoje, intocado", async () => {
    const extracao = await provider().extrair(ESCANEADO);

    expect(chamadas).toEqual([]);
    expect(extracao.avisos[0]).toContain("IA de visão indisponível");
  });

  it("XML continua no heurístico sem passar pelo sidecar", async () => {
    process.env.OCR_LOCAL_URL = SIDECAR;
    textoDoSidecar = CUPOM_COMPLETO;

    const extracao = await provider().extrair({
      arquivoNome: "nota.xml",
      arquivoMime: "application/xml",
      arquivoBase64: Buffer.from("<NFe><CNPJ>12345678000195</CNPJ><vNF>10.00</vNF></NFe>").toString("base64"),
    });

    expect(chamadas).toEqual([]);
    expect(extracao.provedor).toBe("heuristico-local");
  });
});
