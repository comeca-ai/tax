import { createHash, randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { colaboradores, empresas, notasFiscais, despesas, whatsappInbox, veiculos } from "../../../../db/schema";
import { pocDocumentos } from "../../../../db/pocSchema";
import { getDb } from "../../../queries/connection";
import type { OcrProvider } from "../../fiscal/ocr";
import { LIMITE_COMPROVANTE_BYTES } from "../whatsapp/comprovante";
import { alterarCampo, type IdentidadeCampo } from "./servico";
import { atualizarConciliacoes, chaveFiscalValida, type Documento } from "./dominio";
import type { OcrExtracao } from "../../../../contracts/types";

export type ExtracaoCombustivel = OcrExtracao & { chaveAcesso?: string | null; cnpjDestinatario?: string | null };

/** Recorte XML local conservador; não acessa rede, DTD, entidades ou valida assinatura fiscal. */
export const extratorLocalCombustivel: OcrProvider = {
  nome: "campo-xml-local",
  async extrair(arquivo): Promise<ExtracaoCombustivel> {
    const vazio: ExtracaoCombustivel = { cnpjEmitente: null, cfop: null, ncm: null, cst: null, valor: null, dataFatoGerador: null, litros: null, categoriaSugerida: null, confiancaExtracao: "baixa", camposPendentes: ["extracaoDocumento"], provedor: "campo-xml-local", avisos: ["Extração local não verifica assinatura nem situação fiscal."] };
    if (!/xml/i.test(arquivo.arquivoMime)) return vazio;
    const xml = Buffer.from(arquivo.arquivoBase64, "base64").toString("utf8");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || !/<NFe(?:\s|>)/.test(xml)) return vazio;
    const tag = (text: string, name: string) => new RegExp(`<${name}(?:\\s[^>]*)?>([^<]+)</${name}>`).exec(text)?.[1]?.trim() ?? null;
    const dest = /<dest(?:\s[^>]*)?>([\s\S]*?)<\/dest>/.exec(xml)?.[1] ?? "";
    const emit = /<emit(?:\s[^>]*)?>([\s\S]*?)<\/emit>/.exec(xml)?.[1] ?? "";
    const itens = [...xml.matchAll(/<det(?:\s[^>]*)?>([\s\S]*?)<\/det>/g)].map(m => m[1]);
    const combustiveis = itens.filter(i => /^(2710|2207)/.test(tag(i, "NCM") ?? "") && /^(L|LT|LITRO|LITROS)$/i.test(tag(i, "uCom") ?? ""));
    const quantidades = combustiveis.map(i => Number(tag(i, "qCom")));
    const litros = quantidades.length && quantidades.every(n => Number.isFinite(n) && n > 0) ? quantidades.reduce((a, b) => a + b, 0) : null;
    return { ...vazio, cnpjEmitente: tag(emit, "CNPJ"), cnpjDestinatario: tag(dest, "CNPJ"), chaveAcesso: /<infNFe\b[^>]*\bId=["']NFe(\d{44})["']/.exec(xml)?.[1] ?? null, dataFatoGerador: tag(xml, "dhEmi") ?? tag(xml, "dEmi"), litros, categoriaSugerida: litros ? "combustivel" : null, camposPendentes: [], confiancaExtracao: "media" };
  },
};

/** Nenhum campo fiscal entra pelo formulário. Incerteza permanece explícita. */
export function prepararDocumentoExtraido(conteudo: Buffer, extracao: ExtracaoCombustivel, contexto: { cnpj: string; notaFiscalId: number; veiculo: string }): Documento {
  if (!conteudo.length || conteudo.length > LIMITE_COMPROVANTE_BYTES) throw new Error("Arquivo fora do limite permitido.");
  const chave = extracao.chaveAcesso && chaveFiscalValida(extracao.chaveAcesso) ? extracao.chaveAcesso : null;
  const cnpj = extracao.cnpjDestinatario?.replace(/\D/g, "") ?? "";
  const data = extracao.dataFatoGerador && Number.isFinite(Date.parse(extracao.dataFatoGerador)) ? new Date(extracao.dataFatoGerador).toISOString() : null;
  const litros = typeof extracao.litros === "number" && Number.isFinite(extracao.litros) && extracao.litros > 0 ? extracao.litros : null;
  const pendentes = new Set(extracao.camposPendentes);
  if (!chave) pendentes.add("chaveAcesso");
  if (!/^\d{14}$/.test(cnpj)) pendentes.add("cnpjDestinatario");
  if (!data) pendentes.add("dataFatoGerador");
  if (!litros) pendentes.add("litros");
  if (extracao.categoriaSugerida !== "combustivel") pendentes.add("categoriaCombustivel");
  const divergente = /^\d{14}$/.test(cnpj) && cnpj !== contexto.cnpj;
  return { id: randomUUID(), chave, hash: createHash("sha256").update(conteudo).digest("hex"), cnpjDestinatario: /^\d{14}$/.test(cnpj) ? cnpj : null, veiculo: contexto.veiculo, data, litros, estado: divergente ? "divergente" : "em_validacao", motivo: divergente ? "CNPJ destinatário divergente" : "Extração automática aguardando conferência documental; não comprova autenticidade fiscal.", notaFiscalId: contexto.notaFiscalId, camposPendentes: [...pendentes], provedorExtracao: extracao.provedor, extraidoEm: new Date().toISOString() };
}

/** Uso servidor: vínculo pessoa→inbox→despesa→nota e hash do binário persistido. */
export async function importarDocumentoCampo(identidade: IdentidadeCampo, input: { notaFiscalId: number; veiculo: string }, ocr: OcrProvider = extratorLocalCombustivel, usuarioId: number | null = null) {
  const db = getDb();
  const [pessoa] = await db.select().from(colaboradores).where(and(eq(colaboradores.id, identidade.colaboradorId), eq(colaboradores.empresaId, identidade.empresaId), eq(colaboradores.statusVinculo, "ativo"))).limit(1);
  if (!pessoa) throw new Error("Vínculo indisponível.");
  const [nota] = await db.select().from(notasFiscais).where(and(eq(notasFiscais.id, input.notaFiscalId), eq(notasFiscais.empresaId, identidade.empresaId))).limit(1);
  const vinculos = await db.select({ id: despesas.id }).from(despesas).innerJoin(whatsappInbox, and(eq(whatsappInbox.despesaId, despesas.id), eq(whatsappInbox.empresaId, despesas.empresaId))).where(and(eq(despesas.notaFiscalId, input.notaFiscalId), eq(despesas.empresaId, identidade.empresaId), eq(whatsappInbox.colaboradorId, identidade.colaboradorId), eq(whatsappInbox.provider, "dialog360"))).limit(1);
  if (!nota?.arquivoBase64 || !vinculos.length) throw new Error("Comprovante não vinculado a esta pessoa e empresa.");
  if (nota.arquivoBase64.length > Math.ceil(LIMITE_COMPROVANTE_BYTES / 3) * 4) throw new Error("Arquivo fora do limite permitido.");
  const binario = Buffer.from(nota.arquivoBase64, "base64");
  const hash = createHash("sha256").update(binario).digest("hex");
  if (nota.arquivoChecksum && nota.arquivoChecksum !== hash) throw new Error("Integridade do comprovante não confere.");
  const [existente] = await db.select().from(pocDocumentos).where(and(eq(pocDocumentos.empresaId, identidade.empresaId), eq(pocDocumentos.hash, hash))).limit(1);
  if (existente) return { documentoId: existente.colaboradorId === identidade.colaboradorId ? existente.id : null, duplicado: true };
  const extracao = await ocr.extrair({ arquivoNome: nota.arquivoNome ?? "comprovante", arquivoMime: nota.arquivoMime ?? "application/octet-stream", arquivoBase64: nota.arquivoBase64 }) as ExtracaoCombustivel;
  return alterarCampo(identidade, usuarioId, "documento.importar_ocr", async (estado, tx) => {
    const [empresa] = await tx.select().from(empresas).where(eq(empresas.id, identidade.empresaId)).limit(1);
    const [veiculo] = await tx.select().from(veiculos).where(and(eq(veiculos.empresaId, identidade.empresaId), eq(veiculos.placa, input.veiculo))).limit(1);
    const [atual] = await tx.select().from(notasFiscais).where(and(eq(notasFiscais.id, nota.id), eq(notasFiscais.empresaId, identidade.empresaId))).for("update");
    if (!empresa || !veiculo || atual?.arquivoBase64 !== nota.arquivoBase64) throw new Error("Documento ou veículo mudou durante a extração; repita a operação.");
    const documento = prepararDocumentoExtraido(binario, extracao, { cnpj: empresa.cnpj.replace(/\D/g, ""), notaFiscalId: nota.id, veiculo: veiculo.placa });
    const [repetido] = await tx.select().from(pocDocumentos).where(and(eq(pocDocumentos.empresaId, identidade.empresaId), or(eq(pocDocumentos.hash, documento.hash), documento.chave ? eq(pocDocumentos.chave, documento.chave) : undefined))).limit(1);
    if (repetido) return { documentoId: repetido.colaboradorId === identidade.colaboradorId ? repetido.id : null, duplicado: true };
    await tx.insert(pocDocumentos).values({ id: documento.id, empresaId: identidade.empresaId, colaboradorId: identidade.colaboradorId, chave: documento.chave, hash: documento.hash });
    estado.documentos.push(documento);
    atualizarConciliacoes(estado);
    return { documentoId: documento.id, duplicado: false };
  });
}
