import {
  regrasPoliticaSchema,
  type CategoriaDespesa,
  type PolicyExtracao,
  type RegrasPolitica,
} from "@contracts/types";

/**
 * Parser plugável da política de reembolso (v1.1.0).
 * Mesmo padrão do OCR (api/ocr): contrato estável PolicyExtracao, provider
 * selecionado via env POLICY_PROVIDER (default "heuristico").
 *
 * CONTRATO ESTÁVEL: para trocar a extração por LLM (OpenAI/Gemini) depois,
 * basta implementar PolicyParser mantendo PolicyExtracao e registrar o
 * provider em `parsers` abaixo — nenhum consumidor (router/agente) muda.
 */

export type ArquivoPolitica = {
  arquivoNome: string;
  mimeType: string;
  base64: string;
};

export interface PolicyParser {
  nome: string;
  extract(input: ArquivoPolitica): Promise<PolicyExtracao>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de extração (determinísticos)
// ─────────────────────────────────────────────────────────────────────────────

/** "R$ 1.234,56" | "R$ 120" | "120,00" → número (formato BR). */
function parseValorBR(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const v = valor.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const REGEX_VALOR = /R\$\s*([\d][\d.,]*)/gi;

/** Valores monetários "R$ X" numa janela de texto, na ordem de aparecimento. */
function valoresEm(trecho: string): number[] {
  const out: number[] = [];
  for (const m of trecho.matchAll(REGEX_VALOR)) {
    const n = parseValorBR(m[1]);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Palavras-chave por categoria (PT-BR, com/sem acento). */
const KEYWORDS_CATEGORIA: Record<CategoriaDespesa, RegExp> = {
  alimentacao: /alimenta[çc][ãa]o|comida|refei[çc][ãa]o|restaurante|lanche/i,
  hospedagem: /hospedagem|hotel|di[áa]ria|pousada/i,
  uber: /uber|99\s?(app|pop)?|aplicativo de transporte|app de transporte/i,
  taxi: /t[áa]xi/i,
  combustivel: /combust[íi]vel|abastecimento|gasolina|diesel|etanol/i,
  pedagio: /ped[áa]gio/i,
};

/** Primeiro valor "R$" na MESMA LINHA da keyword (depois dela; senão antes). */
function limitePorCategoria(texto: string, re: RegExp): number | null {
  const m = re.exec(texto);
  if (!m) return null;
  const fimLinha = texto.indexOf("\n", m.index);
  const inicioLinha = texto.lastIndexOf("\n", m.index);
  const depois = texto.slice(
    m.index + m[0].length,
    fimLinha === -1 ? undefined : fimLinha,
  );
  const antes = texto.slice(inicioLinha === -1 ? 0 : inicioLinha + 1, m.index);
  return valoresEm(depois)[0] ?? valoresEm(antes)[0] ?? null;
}

/** Texto decodificado ou null quando binário (PDF/imagem sem camada de texto). */
function decodificarTexto(input: ArquivoPolitica): string | null {
  let texto = "";
  try {
    texto = Buffer.from(input.base64, "base64").toString("utf8");
  } catch {
    return null;
  }
  if (!texto) return null;
  const isMarkup =
    input.mimeType.includes("xml") ||
    input.mimeType.includes("html") ||
    /\.(xml|html?|txt|md|csv)$/i.test(input.arquivoNome);
  if (!isMarkup && /[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]{20}/.test(texto)) {
    return null; // binário: PDF escaneado/imagem
  }
  // XML/HTML: extrai apenas o texto (remove tags e entidades básicas)
  if (/<[a-zA-Z][^>]*>/.test(texto)) {
    texto = texto
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
  }
  return texto;
}

/** Linhas do texto que mencionam uma categoria + uma keyword de exigência. */
function categoriasComExigencia(texto: string, reExigencia: RegExp): CategoriaDespesa[] {
  const trechos = texto.split(/[\n;]+/);
  const achadas = new Set<CategoriaDespesa>();
  for (const trecho of trechos) {
    if (!reExigencia.test(trecho)) continue;
    for (const [categoria, reCat] of Object.entries(KEYWORDS_CATEGORIA) as [
      CategoriaDespesa,
      RegExp,
    ][]) {
      if (reCat.test(trecho)) achadas.add(categoria);
    }
  }
  return [...achadas];
}

/** Teto: linha com o contexto (ex.: "aprovação automática") → último valor "R$" da linha. */
function tetoPorContexto(texto: string, reContexto: RegExp): number | null {
  const trechos = texto.split(/[\n;]+/);
  for (const trecho of trechos) {
    if (!reContexto.test(trecho)) continue;
    const valores = valoresEm(trecho);
    if (valores.length > 0) return valores[valores.length - 1];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser heurístico (DEFAULT)
// ─────────────────────────────────────────────────────────────────────────────

export class HeuristicPolicyParser implements PolicyParser {
  nome = "heuristico-local";

  async extract(input: ArquivoPolitica): Promise<PolicyExtracao> {
    const avisos: string[] = [];
    const texto = decodificarTexto(input);

    if (texto === null) {
      // Binário (PDF/imagem): sem extração local → preenchimento assistido
      return {
        textoExtraido: null,
        regras: regrasPoliticaSchema.parse({}),
        confiancaExtracao: "baixa",
        camposPendentes: [
          "limitesPorCategoria",
          "exigeVeiculoCadastrado",
          "exigeEvidencia",
          "aprovacaoAutomaticaAte",
          "revisaoHumanaAcimaDe",
          "negacaoAcimaDe",
        ],
        provedor: this.nome,
        avisos: [
          "Arquivo binário (PDF/imagem) sem texto extraível: preencha as regras manualmente na revisão assistida. Conector LLM disponível via POLICY_PROVIDER=llm.",
        ],
      };
    }

    const regrasInput: Record<string, unknown> = {};
    const camposPendentes: string[] = [];
    const observacoes: string[] = [];
    let regrasExtraidas = 0;

    // 1. Limites por categoria (valor "R$" próximo à keyword da categoria)
    const limites: Partial<Record<CategoriaDespesa, number | null>> = {};
    for (const [categoria, re] of Object.entries(KEYWORDS_CATEGORIA) as [
      CategoriaDespesa,
      RegExp,
    ][]) {
      const limite = limitePorCategoria(texto, re);
      if (limite !== null) {
        limites[categoria] = limite;
        regrasExtraidas += 1;
      }
    }
    regrasInput.limitesPorCategoria = limites;
    if (Object.keys(limites).length === 0) camposPendentes.push("limitesPorCategoria");

    // 2. Exigência de veículo cadastrado ("veículo cadastrado/próprio")
    const exigeVeiculo = categoriasComExigencia(
      texto,
      /ve[íi]culo\s+(cadastrado|pr[óo]prio)|ve[íi]culo\s+da\s+empresa/i,
    );
    regrasInput.exigeVeiculoCadastrado = exigeVeiculo;
    if (exigeVeiculo.length > 0) regrasExtraidas += 1;

    // 3. Exigência de evidência ("obrigatório/nota/recibo/evidência/comprovante")
    const exigeEvidencia = categoriasComExigencia(
      texto,
      /obrigat[óo]ri|nota\s+fiscal|recibo|evid[êe]ncia|comprovante/i,
    );
    regrasInput.exigeEvidencia = exigeEvidencia;
    if (exigeEvidencia.length > 0) regrasExtraidas += 1;

    // 4. Tetos globais
    const aprovacaoAutomaticaAte = tetoPorContexto(
      texto,
      /aprova[çc][ãa]o\s+autom[áa]tica|reembolso\s+autom[áa]tico/i,
    );
    const revisaoHumanaAcimaDe = tetoPorContexto(
      texto,
      /revis[ãa]o\s+(humana|manual)|an[áa]lise\s+(humana|manual)/i,
    );
    const negacaoAcimaDe = tetoPorContexto(
      texto,
      /nega[çc]|negad|n[ãa]o\s+(s[ãa]o\s+)?reembols|rejeitad/i,
    );
    regrasInput.aprovacaoAutomaticaAte = aprovacaoAutomaticaAte;
    regrasInput.revisaoHumanaAcimaDe = revisaoHumanaAcimaDe;
    regrasInput.negacaoAcimaDe = negacaoAcimaDe;
    if (aprovacaoAutomaticaAte === null) camposPendentes.push("aprovacaoAutomaticaAte");
    if (revisaoHumanaAcimaDe === null) camposPendentes.push("revisaoHumanaAcimaDe");
    if (negacaoAcimaDe === null) camposPendentes.push("negacaoAcimaDe");
    regrasExtraidas +=
      (aprovacaoAutomaticaAte !== null ? 1 : 0) +
      (revisaoHumanaAcimaDe !== null ? 1 : 0) +
      (negacaoAcimaDe !== null ? 1 : 0);

    // 5. Observações em texto livre (tarifa/km e demais regras não estruturadas)
    const trechosKm = texto
      .split(/[.\n;]+/)
      .filter((t) => /tarifa|por\s+km|km\s+rodado/i.test(t) && valoresEm(t).length > 0);
    for (const t of trechosKm.slice(0, 5)) {
      observacoes.push(`Tarifa/km mencionada: "${t.trim()}"`);
    }
    regrasInput.observacoes = observacoes;

    const regras: RegrasPolitica = regrasPoliticaSchema.parse(regrasInput);

    // Confiança por quantidade de regras extraídas (determinístico)
    const confiancaExtracao =
      camposPendentes.length === 0 && regrasExtraidas >= 5
        ? ("alta" as const)
        : regrasExtraidas >= 2
          ? ("media" as const)
          : ("baixa" as const);

    if (camposPendentes.length > 0) {
      avisos.push(
        `Regras não extraídas automaticamente: ${camposPendentes.join(", ")} — confirmar via preenchimento assistido.`,
      );
    }

    return {
      textoExtraido: texto.slice(0, 60000),
      regras,
      confiancaExtracao,
      camposPendentes,
      provedor: this.nome,
      avisos,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stub LLM (contrato estável — trocar implementação por OpenAI/Gemini depois)
// ─────────────────────────────────────────────────────────────────────────────

export class LlmPolicyParser implements PolicyParser {
  nome = "llm";

  async extract(_input: ArquivoPolitica): Promise<PolicyExtracao> {
    // TODO(v1.2+): implementar chamada OpenAI/Gemini devolvendo PolicyExtracao.
    // O contrato (textoExtraido/regras/confiancaExtracao/camposPendentes) já é
    // estável — basta preencher `regras` via structured output do modelo.
    if (!process.env.POLICY_API_KEY) {
      throw new Error(
        "POLICY_PROVIDER=llm selecionado sem POLICY_API_KEY configurada. Defina POLICY_API_KEY no ambiente ou use POLICY_PROVIDER=heuristico.",
      );
    }
    throw new Error(
      "Parser LLM ainda não implementado nesta versão. Use POLICY_PROVIDER=heuristico.",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seleção do parser (plugável, mesmo padrão do OCR)
// ─────────────────────────────────────────────────────────────────────────────

const parsers: Record<string, () => PolicyParser> = {
  heuristico: () => new HeuristicPolicyParser(),
  llm: () => new LlmPolicyParser(),
};

export function getPolicyParser(): PolicyParser {
  const nome = process.env.POLICY_PROVIDER ?? "heuristico";
  const factory = parsers[nome] ?? parsers.heuristico;
  return factory();
}
