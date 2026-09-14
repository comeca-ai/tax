import {
  regrasPoliticaSchema,
  type OcrExtracao,
} from "../../../../contracts/types";
import { decidirReembolso } from "../decisor";
import { consolidarRegras } from "../policy/derivar";
import { aplicarModo, type ConfiguracaoCampo } from "../campo/politica";

/** A mesma política do painel, com efeito separado do veredito e sem I/O. */
export function decidirComprovanteWhatsapp(
  extracao: OcrExtracao | undefined,
  politica: { id: number; versao: number; regras: unknown } | null,
  config: Pick<
    ConfiguracaoCampo,
    "modo" | "politicaId" | "politicaVersao"
  > | null
) {
  const regras = politica
    ? regrasPoliticaSchema.safeParse(politica.regras)
    : null;
  const decisao = decidirReembolso(
    extracao ?? {
      categoriaSugerida: null,
      valor: null,
      dataFatoGerador: null,
      cnpjEmitente: null,
      confiancaExtracao: "baixa",
      camposPendentes: ["extracao"],
    },
    regras?.success ? consolidarRegras(regras.data) : null,
    {
      politicaVersao: politica?.versao ?? null,
    }
  );
  // Uma promoção amarrada à política antiga não autoriza a política nova.
  const modo =
    config &&
    politica &&
    config.politicaId === politica.id &&
    config.politicaVersao === politica.versao
      ? config.modo
      : "sombra";
  const efeito = aplicarModo(decisao, modo);
  const status = efeito.aplicarStatus
    ? decisao.decisao === "aprovado"
      ? ("aprovada" as const)
      : ("rejeitada" as const)
    : ("em_revisao" as const);
  const motivo = [...decisao.motivos, ...decisao.ressalvas].join("\n");
  const resposta =
    modo === "sombra"
      ? "Comprovante recebido para acompanhamento. Nenhum pagamento foi executado."
      : `Política v${politica?.versao}: ${modo === "assistido" ? "sugestão pendente de confirmação humana" : status === "aprovada" ? "reembolso aprovado" : status === "rejeitada" ? "reembolso rejeitado" : "revisão humana necessária"}. ${motivo} Esta avaliação não certifica validade fiscal. Nenhum pagamento foi executado.`;
  return {
    decisao,
    modo,
    status,
    motivo,
    resposta,
    politicaVersao: politica?.versao ?? null,
  };
}
