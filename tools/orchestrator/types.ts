/**
 * Tipos compartilhados do orquestrador de varredura/auditoria.
 *
 * O orquestrador ("reembolsa_motor") percorre o repositório e produz
 * relatórios estruturados em `docs/auditoria/` cobrindo:
 * branches, entidades, funcionalidades, integrações, telas e histórico.
 */

/** Item de branch conhecido pelo repositório. */
export interface BranchItem {
  name: string;
  /** "local" = existe no clone atual; "remote" = só no remoto. */
  source: "local" | "remote";
  /** true quando é a branch atualmente em checkout. */
  current: boolean;
}

/** Entidade de persistência (tabela Drizzle) encontrada no schema. */
export interface EntityItem {
  /** Nome do export no schema (ex.: `despesas`). */
  name: string;
  /** Arquivo onde a entidade foi declarada (relativo à raiz). */
  file: string;
  /** Linha da declaração no arquivo. */
  line: number;
}

/** Router tRPC montado no `appRouter`. */
export interface FeatureItem {
  /** Chave exposta no appRouter (ex.: `despesas`). */
  name: string;
  /** Arquivo do router (relativo à raiz). */
  file: string;
  /** Quantidade aproximada de procedures encontradas no arquivo. */
  procedures: number;
}

/** Sinal de integração externa detectado por palavras-chave. */
export interface IntegrationItem {
  /** Domínio da integração (ex.: "whatsapp", "ocr", "email", "receita"). */
  domain: string;
  /** Termo que disparou a detecção. */
  term: string;
  /** Arquivo onde o termo aparece. */
  file: string;
  /** Quantidade de ocorrências do termo no arquivo. */
  occurrences: number;
}

/** Tela/rota do frontend declarada em `src/App.tsx`. */
export interface ScreenItem {
  /** Caminho da rota (ex.: `/app/despesas`). */
  path: string;
  /** Componente renderizado. */
  component: string;
  /** true quando a rota exige autenticação (dentro de `RequireAuth`). */
  protected: boolean;
}

/** Commit relevante ao domínio de reembolso no histórico. */
export interface HistoryItem {
  hash: string;
  subject: string;
}

/** Resultado agregado da varredura completa. */
export interface AuditResult {
  generatedAt: string;
  branches: BranchItem[];
  entities: EntityItem[];
  features: FeatureItem[];
  integrations: IntegrationItem[];
  screens: ScreenItem[];
  history: HistoryItem[];
}
