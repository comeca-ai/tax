import type { CategoriaDespesa, OcrExtracao } from "@contracts/types";

/**
 * Provider plugável de OCR/extração (RF-01).
 * Default: parser heurístico local (NF-e XML / texto) + preenchimento assistido.
 * Para usar IA de visão, implementar OcrProvider e selecionar via OCR_PROVIDER.
 */

export type ArquivoNota = {
  arquivoNome: string;
  arquivoMime: string;
  arquivoBase64: string;
};

export interface OcrProvider {
  nome: string;
  extrair(arquivo: ArquivoNota): Promise<OcrExtracao>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de extração
// ─────────────────────────────────────────────────────────────────────────────

function primeiro(texto: string, regexes: RegExp[]): string | null {
  for (const re of regexes) {
    const m = texto.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function parseNumero(valor: string | null): number | null {
  if (!valor) return null;
  const n = Number(valor.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseData(valor: string | null): string | null {
  if (!valor) return null;
  // yyyy-mm-dd (com ou sem hora)
  const iso = valor.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy
  const br = valor.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function extrairTagXml(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`));
  return m?.[1]?.trim() ?? null;
}

function sugerirCategoria(
  texto: string,
  cfop: string | null,
  ncm: string | null,
): CategoriaDespesa | null {
  const t = texto.toLowerCase();
  if (
    ncm?.startsWith("2710") ||
    cfop === "5656" ||
    /combust[ií]vel|diesel|gasolina|etanol|gnv|posto/.test(t)
  ) {
    return "combustivel";
  }
  if (/restaurante|alimenta|refei[çc][ãa]o|lanche/.test(t)) return "alimentacao";
  if (/hotel|hosped|pousada/.test(t)) return "hospedagem";
  if (/ped[áa]gio|concession[áa]ria de rodovia/.test(t)) return "pedagio";
  if (/uber|99 ?app|99pop/.test(t)) return "uber";
  if (/t[áa]xi/.test(t)) return "taxi";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider heurístico (default)
// ─────────────────────────────────────────────────────────────────────────────

export class HeuristicOcrProvider implements OcrProvider {
  nome = "heuristico-local";

  async extrair(arquivo: ArquivoNota): Promise<OcrExtracao> {
    const avisos: string[] = [];
    const isXml =
      arquivo.arquivoMime.includes("xml") ||
      arquivo.arquivoNome.toLowerCase().endsWith(".xml");

    let texto = "";
    try {
      texto = Buffer.from(arquivo.arquivoBase64, "base64").toString("utf8");
    } catch {
      texto = "";
    }

    if (!isXml && (!texto || /[^\x09\x0A\x0D\x20-\x7E\u00C0-\u00FF]{20}/.test(texto))) {
      // Binário (imagem/PDF escaneado): sem extração local → preenchimento assistido
      return {
        cnpjEmitente: null,
        cfop: null,
        ncm: null,
        cst: null,
        valor: null,
        dataFatoGerador: null,
        litros: null,
        categoriaSugerida: null,
        confiancaExtracao: "baixa",
        camposPendentes: [
          "cnpjEmitente",
          "cfop",
          "ncm",
          "cst",
          "valor",
          "dataFatoGerador",
          "litros",
          "categoria",
        ],
        provedor: this.nome,
        avisos: [
          "Arquivo de imagem/PDF sem texto extraível: preenchimento manual assistido necessário. Conector de IA de visão disponível via OCR_PROVIDER.",
        ],
      };
    }

    let cnpjEmitente: string | null;
    let cfop: string | null;
    let ncm: string | null;
    let cst: string | null;
    let valor: number | null;
    let dataFato: string | null;
    let litros: number | null;

    if (isXml || texto.includes("<NFe") || texto.includes("<nfeProc")) {
      cnpjEmitente = extrairTagXml(texto, "CNPJ");
      cfop = extrairTagXml(texto, "CFOP");
      ncm = extrairTagXml(texto, "NCM");
      cst = extrairTagXml(texto, "CST") ?? extrairTagXml(texto, "CSOSN");
      valor = parseNumero(extrairTagXml(texto, "vNF"));
      dataFato = parseData(
        extrairTagXml(texto, "dhEmi") ?? extrairTagXml(texto, "dEmi"),
      );
      litros = parseNumero(extrairTagXml(texto, "qCom"));
      if (litros !== null && (litros > 10000 || !ncm?.startsWith("2710"))) {
        litros = null; // qCom só é litros para combustível
      }
    } else {
      // Texto livre (PDF com camada de texto, DANFE etc.)
      cnpjEmitente = primeiro(texto, [
        /CNPJ[:\s]*([\d./-]{14,18})/i,
        /\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/,
      ]);
      cfop = primeiro(texto, [/CFOP[:\s]*(\d{4})/i]);
      ncm = primeiro(texto, [/NCM[:\s]*([\d.]{8,10})/i]);
      cst = primeiro(texto, [/CST[:\s]*(\d{2,3})/i, /CSOSN[:\s]*(\d{3})/i]);
      valor = parseNumero(
        primeiro(texto, [
          /valor\s+(?:total|da nota)[:\s]*R?\$?\s*([\d.,]+)/i,
          /total[:\s]*R\$\s*([\d.,]+)/i,
        ]),
      );
      dataFato = parseData(
        primeiro(texto, [
          /(?:data\s+(?:de\s+)?emiss[ãa]o)[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
          /(\d{2}\/\d{2}\/\d{4})/,
        ]),
      );
      litros = parseNumero(
        primeiro(texto, [/([\d.,]+)\s*(?:litros?|lt\b|L\b)/i]),
      );
    }

    const categoriaSugerida = sugerirCategoria(texto, cfop, ncm);

    const extraidos: Record<string, unknown> = {
      cnpjEmitente,
      cfop,
      ncm,
      cst,
      valor,
      dataFatoGerador: dataFato,
      litros,
      categoria: categoriaSugerida,
    };
    const camposPendentes = Object.entries(extraidos)
      .filter(([, v]) => v === null)
      .map(([k]) => k);

    const extraidosQtd = Object.keys(extraidos).length - camposPendentes.length;
    const confiancaExtracao =
      camposPendentes.length === 0
        ? "alta"
        : extraidosQtd >= 4
          ? "media"
          : "baixa";

    if (camposPendentes.length > 0) {
      avisos.push(
        `Campos não extraídos automaticamente: ${camposPendentes.join(", ")} — confirmar via preenchimento assistido.`,
      );
    }

    return {
      cnpjEmitente,
      cfop,
      ncm,
      cst,
      valor,
      dataFatoGerador: dataFato,
      litros,
      categoriaSugerida,
      confiancaExtracao,
      camposPendentes,
      provedor: this.nome,
      avisos,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seleção do provider (plugável)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Providers registrados. Para plugar IA de visão (ex.: OCR_PROVIDER=visao),
 * basta registrar um novo provider aqui — o contrato OcrExtracao é o mesmo.
 */
const providers: Record<string, () => OcrProvider> = {
  heuristico: () => new HeuristicOcrProvider(),
};

export function getOcrProvider(): OcrProvider {
  const nome = process.env.OCR_PROVIDER ?? "heuristico";
  const factory = providers[nome] ?? providers.heuristico;
  return factory();
}
