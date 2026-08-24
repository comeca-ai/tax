// Import direto da lib: o index.js do pdf-parse v1 tem um bloco de debug que
// tenta ler ./test/data quando module.parent é undefined (vitest/bundle ESM)
// @ts-expect-error — pdf-parse v1 não tem tipos para o subpath da lib
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { MistralPolicyParser } from "./mistral";
import { LIMITE_TEXTO_EXTRAIDO_BYTES, truncarUtf8 } from "./texto";
import {
  regrasPoliticaSchema,
  type CategoriaDespesa,
  type PolicyExtracao,
  type RegrasPolitica,
} from "@contracts/types";

/**
 * Parser plugável da política de reembolso (v1.1.0; PDF em v1.4.3).
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
  alimentacao:
    /alimenta[çc][ãa]o|comida|refei[çc][ãa]o|restaurante|lanche|almo[çc]o|jantar/i,
  hospedagem: /hospedagem|hotel|di[áa]ria|pousada|pernoite/i,
  uber: /uber|99\s?(app|pop)?|aplicativo de transporte|app de transporte/i,
  taxi: /t[áa]xi/i,
  combustivel: /combust[íi]vel|abastecimento|gasolina|diesel|etanol/i,
  pedagio: /ped[áa]gio/i,
};

/**
 * Linhas de quilometragem/tarifa por km NÃO são tetos de categoria —
 * "R$ 1,30/km" é tarifa, não limite. (v1.4.3: evitava contaminar
 * combustível com a tarifa por km da tabela de limites.)
 */
const RE_LINHA_KM =
  /quilometragem|por\s+km|\/\s*km|km\s+rodado|ve[íi]culo\s+pr[óo]prio|ressarcid[oa]\s+por\s+quil[ôo]metro/i;

/** Texto decodificado ou null quando binário (imagem/PDF escaneado). */
async function decodificarTexto(input: ArquivoPolitica): Promise<string | null> {
  // PDF com camada de texto → extrai o texto de verdade (pdf-parse/pdf.js).
  // PDF escaneado (só imagem) retorna texto vazio → null → assistido.
  const ehPdf =
    input.mimeType.includes("pdf") || /\.pdf$/i.test(input.arquivoNome);
  if (ehPdf) {
    try {
      const dados = await pdfParse(Buffer.from(input.base64, "base64"));
      const texto = (dados.text ?? "").replace(/\r/g, "").trim();
      return texto.length > 0 ? texto : null;
    } catch {
      return null; // PDF corrompido/criptografado → preenchimento assistido
    }
  }

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
    return null; // binário: imagem etc.
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

/** Linhas não-vazias do texto (PDF de tabela quebra células em várias linhas). */
function linhasDe(texto: string): string[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Primeira categoria cuja keyword aparece na linha (ordem de KEYWORDS_CATEGORIA). */
function categoriaNaLinha(linha: string): CategoriaDespesa | null {
  for (const [categoria, re] of Object.entries(KEYWORDS_CATEGORIA) as [
    CategoriaDespesa,
    RegExp,
  ][]) {
    if (re.test(linha)) return categoria;
  }
  return null;
}

/**
 * Linhas que mencionam exigência → categoria mais próxima numa janela para
 * TRÁS de até 2 linhas (em tabelas, a regra vem depois do rótulo da categoria).
 */
function categoriasComExigencia(texto: string, reExigencia: RegExp): CategoriaDespesa[] {
  const linhas = linhasDe(texto);
  const achadas = new Set<CategoriaDespesa>();
  for (let i = 0; i < linhas.length; i++) {
    if (!reExigencia.test(linhas[i])) continue;
    for (let j = i; j >= Math.max(0, i - 2); j--) {
      const cat = categoriaNaLinha(linhas[j]);
      if (cat) achadas.add(cat);
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
    const texto = await decodificarTexto(input);

    if (texto === null) {
      // Binário (imagem/PDF escaneado): sem extração local → preenchimento assistido
      return {
        textoExtraido: null,
        regras: regrasPoliticaSchema.parse({}),
        confiancaExtracao: "baixa",
        camposPendentes: [
          "limitesPorCategoria",
          "exigeEvidencia",
          "aprovacaoAutomaticaAte",
          "revisaoHumanaAcimaDe",
          "negacaoAcimaDe",
          "regrasExtraidas",
        ],
        provedor: this.nome,
        avisos: [
          "Arquivo sem texto extraível (imagem ou PDF escaneado): preencha as regras manualmente na revisão assistida. Conector LLM disponível via POLICY_PROVIDER=llm.",
        ],
      };
    }

    const regrasInput: Record<string, unknown> = {};
    const camposPendentes: string[] = [];
    const observacoes: string[] = [];
    let regrasExtraidas = 0;

    // 1. Limites por categoria — tabelas de PDF quebram células em várias
    //    linhas: a keyword da categoria abre uma janela de até 3 linhas que
    //    para ANTES da próxima categoria/linha de km (evita contaminação).
    //    O 1º "R$" da janela é o teto principal; variações (regional, refeição
    //    c/ cliente etc.) viram observação — nunca sobrescrevem o teto.
    const linhas = linhasDe(texto);
    const limites: Partial<Record<CategoriaDespesa, number | null>> = {};
    for (let i = 0; i < linhas.length; i++) {
      const cat = categoriaNaLinha(linhas[i]);
      if (!cat || RE_LINHA_KM.test(linhas[i])) continue;

      const janela: string[] = [linhas[i]];
      for (let j = i + 1; j < Math.min(i + 3, linhas.length); j++) {
        if (categoriaNaLinha(linhas[j]) || RE_LINHA_KM.test(linhas[j])) break;
        janela.push(linhas[j]);
      }
      const valores = valoresEm(janela.join(" "));
      if (valores.length === 0) continue;

      if (limites[cat] === undefined) {
        limites[cat] = valores[0];
        regrasExtraidas += 1;
        if (valores.length > 1) {
          observacoes.push(
            `Teto com variação (${cat}): "${janela.join(" ")}" — usado o 1º valor (R$ ${valores[0]}); confira as demais faixas.`,
          );
        }
      } else {
        observacoes.push(
          `Variação de teto (${cat}): "${janela.join(" ")}" — teto principal já definido; avalie se precisa ajustar.`,
        );
      }
    }
    // Teto "solto" (linha com "até R$" e contexto, sem categoria mapeada)
    for (const linha of linhas) {
      if (!/at[ée]\s+R\$/i.test(linha)) continue;
      if (categoriaNaLinha(linha) || RE_LINHA_KM.test(linha)) continue;
      if (linha.split(/\s+/).length < 6) continue; // fragmento de célula
      observacoes.push(`Teto mencionado sem categoria mapeada: "${linha}"`);
    }
    regrasInput.limitesPorCategoria = limites;
    if (Object.keys(limites).length === 0) camposPendentes.push("limitesPorCategoria");

    // 2. Exigência de evidência ("obrigatório/nota/recibo/evidência/comprovante")
    const exigeEvidencia = categoriasComExigencia(
      texto,
      /obrigat[óo]ri|nota\s+fiscal|recibo|evid[êe]ncia|comprovante|cupom\s+fiscal/i,
    );
    regrasInput.exigeEvidencia = exigeEvidencia;
    if (exigeEvidencia.length > 0) regrasExtraidas += 1;

    // 3. Tetos globais
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
      /nega[ç]|negad|n[ãa]o\s+(s[ãa]o\s+)?reembols|rejeitad/i,
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

    // 4. Observações em texto livre — tarifa/km: bloco de linhas ao redor da
    //    primeira menção a quilometragem (a tabela quebra "R$ 1,30 / km" em
    //    várias linhas), mais frases avulsas que citam tarifa com valor.
    const kmIdx = linhas.findIndex((l) => RE_LINHA_KM.test(l));
    if (kmIdx >= 0) {
      const bloco = linhas.slice(Math.max(0, kmIdx - 1), kmIdx + 6).join(" ");
      if (valoresEm(bloco).length > 0) {
        observacoes.push(
          `Tarifa/km mencionada: "${bloco.slice(0, 220)}${bloco.length > 220 ? "…" : ""}"`,
        );
      }
    }
    const trechosKm = texto
      .split(/[.\n;]+/)
      .filter(
        (t) =>
          /tarifa|por\s+km|km\s+rodado/i.test(t) && valoresEm(t).length > 0,
      );
    for (const t of trechosKm.slice(0, 5)) {
      const trecho = t.trim();
      if (!observacoes.some((o) => o.includes(trecho))) {
        observacoes.push(`Tarifa/km mencionada: "${trecho}"`);
      }
    }
    regrasInput.observacoes = observacoes;
    // A heurística não gera regras estruturadas (fonte única RegraExtraida[]):
    // o gestor cadastra na revisão assistida ou usa POLICY_PROVIDER=mistral.
    regrasInput.regrasExtraidas = [];

    const regras: RegrasPolitica = regrasPoliticaSchema.parse(regrasInput);

    // Confiança por quantidade de regras extraídas (determinístico)
    const confiancaExtracao =
      camposPendentes.length === 0 && regrasExtraidas >= 5
        ? ("alta" as const)
        : regrasExtraidas >= 2
          ? ("media" as const)
          : ("baixa" as const);

    camposPendentes.push("regrasExtraidas");
    if (camposPendentes.length > 0) {
      avisos.push(
        `Regras não extraídas automaticamente: ${camposPendentes.join(", ")} — confirmar via preenchimento assistido.`,
      );
    }
    avisos.push(
      "Nenhuma regra estruturada extraída sem LLM: cadastre as regras manualmente na revisão assistida.",
    );

    return {
      textoExtraido: truncarUtf8(texto, LIMITE_TEXTO_EXTRAIDO_BYTES),
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
  // "llm" mantido como alias de "mistral" para não quebrar POLICY_PROVIDER=llm já em uso
  llm: () => new MistralPolicyParser(() => new HeuristicPolicyParser()),
  mistral: () => new MistralPolicyParser(() => new HeuristicPolicyParser()),
};

export function getPolicyParser(): PolicyParser {
  const nome = process.env.POLICY_PROVIDER ?? "heuristico";
  const factory = parsers[nome] ?? parsers.heuristico;
  return factory();
}
