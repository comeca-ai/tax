import { createHash } from "node:crypto";
import type { ComprovanteValidado } from "./comprovante";

export type MetadadosArmazenamentoComprovante = {
  arquivoBase64: string;
  arquivoStorageProvider: "database";
  arquivoStorageKey: null;
  arquivoChecksum: string;
  arquivoTamanhoBytes: number;
};

/**
 * Adaptador atual da POC: a nota mantém o binário privado no MySQL. A saída
 * traz os mesmos metadados que um adaptador S3/R2 preencherá futuramente;
 * somente `arquivoBase64` deixará de ser usado naquela migração gradual.
 */
export function prepararComprovanteParaBanco(
  comprovante: ComprovanteValidado,
): MetadadosArmazenamentoComprovante {
  return {
    arquivoBase64: comprovante.conteudo.toString("base64"),
    arquivoStorageProvider: "database",
    arquivoStorageKey: null,
    arquivoChecksum: createHash("sha256").update(comprovante.conteudo).digest("hex"),
    arquivoTamanhoBytes: comprovante.conteudo.length,
  };
}

/** Contrato que um adaptador privado S3/R2 deverá cumprir em fase posterior. */
export interface ArmazenamentoExternoComprovante {
  salvar(comprovante: ComprovanteValidado): Promise<{
    arquivoStorageProvider: "s3";
    arquivoStorageKey: string;
    arquivoChecksum: string;
    arquivoTamanhoBytes: number;
  }>;
}
