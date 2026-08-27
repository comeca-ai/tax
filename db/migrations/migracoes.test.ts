import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "../schema";
import {
  empresasConfig,
  veiculosColaborador,
  delegacoesDecisao,
  colaboradores,
  veiculos,
  despesas,
} from "../schema";

/**
 * Guarda estática da migração 0008 (Norma PoC).
 *
 * Não abre conexão com banco: lê o .sql gerado pelo drizzle-kit e os metadados
 * das tabelas drizzle, e CRUZA os dois.
 *
 * O QUE ELE COBRE: forma dos statements (só verbos aditivos), ausência de
 * verbo destrutivo, alvo de FK existente no schema, DEFAULT dentro do enum
 * declarado, drift entre o CREATE TABLE e o schema.ts, teto de 64 chars em
 * identificador, e a presença do snapshot/journal.
 *
 * O QUE ELE NÃO COBRE: erro que só o MySQL detecta em tempo de execução
 * (tipo incompatível em FK, engine, colisão de índice). Para isso a prova é
 * aplicar a migração duas vezes contra um MySQL real — feito no portão de QA,
 * não aqui. NÃO edite o .sql à mão confiando neste arquivo: ele reduz o risco
 * de boot, não o elimina. Regenere com `drizzle-kit generate`.
 */

/**
 * Remove linhas de comentário SQL (`-- ...`) preservando o marcador
 * `--> statement-breakpoint`, que o apply.ts usa para separar statements.
 * O .sql tem um cabeçalho explicando a ordem do CREATE INDEX; sem esta
 * limpeza ele entraria no primeiro statement e falsearia as asserções.
 */
function semComentarios(texto: string): string {
  return texto
    .split("\n")
    .filter(l => !/^\s*--(?!>)/.test(l))
    .join("\n");
}

const DIR = path.dirname(new URL(import.meta.url).pathname);
const arquivos0008 = readdirSync(DIR).filter(f => /^0008_.*\.sql$/.test(f));
const arquivo0008 = arquivos0008[0];

describe("migração 0008 — aditiva (Norma PoC)", () => {
  it("existe exatamente UM arquivo 0008_*.sql", () => {
    // Dois arquivos 0008_* (rebase malfeito, cherry-pick duplicado) fariam o
    // docker-entrypoint.sh aplicar os DOIS no boot.
    expect(arquivos0008).toHaveLength(1);
  });

  const sql = semComentarios(
    readFileSync(path.join(DIR, arquivo0008!), "utf8")
  );
  const statements = sql
    .split("--> statement-breakpoint")
    .map(s => s.trim())
    .filter(Boolean);

  it("tem 15 statements: 3 CREATE TABLE, 2 ADD coluna, 9 ADD CONSTRAINT, 1 CREATE INDEX", () => {
    expect(statements).toHaveLength(15);
    expect(statements.filter(s => s.startsWith("CREATE TABLE"))).toHaveLength(
      3
    );
    expect(statements.filter(s => /ALTER TABLE .+ ADD `/.test(s))).toHaveLength(
      2
    );
    expect(statements.filter(s => /ADD CONSTRAINT/.test(s))).toHaveLength(9);
    expect(statements.filter(s => /^CREATE INDEX/.test(s))).toHaveLength(1);
  });

  it("nenhum statement é destrutivo", () => {
    // Descontar as cláusulas que contêm as palavras mas não são verbos:
    // `ON DELETE no action` (FK) e `ON UPDATE CURRENT_TIMESTAMP` (default).
    const limpo = sql
      .replace(/ON DELETE no action/g, "")
      .replace(/ON UPDATE no action/g, "")
      .replace(/ON UPDATE CURRENT_TIMESTAMP/g, "");
    expect(limpo).not.toMatch(
      /\b(DROP|MODIFY|CHANGE|RENAME|TRUNCATE|DELETE|UPDATE)\b/i
    );
  });

  it("a única tabela pré-existente alterada é colaboradores", () => {
    const alteradas = new Set(
      statements
        .map(
          s =>
            s.match(/^ALTER TABLE `([a-z_]+)`/)?.[1] ??
            // CREATE INDEX ... ON `tabela` também altera tabela existente.
            s.match(/^CREATE INDEX `[a-z_]+` ON `([a-z_]+)`/)?.[1]
        )
        .filter((t): t is string => Boolean(t))
    );
    const criadas = new Set(
      statements
        .map(s => s.match(/^CREATE TABLE `([a-z_]+)`/)?.[1])
        .filter((t): t is string => Boolean(t))
    );
    const preExistentes = [...alteradas].filter(t => !criadas.has(t));
    expect(preExistentes).toEqual(["colaboradores"]);
  });

  it("não encosta em veiculos nem em despesas", () => {
    expect(sql).not.toMatch(/ALTER TABLE `veiculos`/);
    expect(sql).not.toMatch(/ALTER TABLE `despesas`/);
  });

  it("as duas colunas novas de colaboradores têm DEFAULT e NOT NULL", () => {
    const adds = statements.filter(s =>
      /ALTER TABLE `colaboradores` ADD `/.test(s)
    );
    expect(adds).toHaveLength(2);
    for (const a of adds) {
      expect(a).toMatch(/DEFAULT '/);
      expect(a).toMatch(/NOT NULL/);
    }
  });

  it("todo statement é re-executável sob a allowlist do apply.ts", () => {
    // Só estas formas produzem 1050 / 1060 / 1061 / 1826 na segunda passada.
    for (const s of statements) {
      expect(
        /^CREATE TABLE /.test(s) ||
          /^ALTER TABLE `[a-z_]+` ADD `/.test(s) ||
          /^ALTER TABLE `[a-z_]+` ADD CONSTRAINT /.test(s) ||
          // CREATE INDEX repetido devolve ER_DUP_KEYNAME (1061), na allowlist.
          /^CREATE INDEX /.test(s)
      ).toBe(true);
    }
  });

  it("nenhum identificador de constraint passa de 64 caracteres", () => {
    const nomes = [...sql.matchAll(/CONSTRAINT `([^`]+)`/g)].map(m => m[1]);
    expect(nomes.length).toBeGreaterThan(0);
    for (const n of nomes) expect(n.length).toBeLessThanOrEqual(64);
  });

  it("o snapshot e o journal da 0008 foram commitados juntos", () => {
    expect(existsSync(path.join(DIR, "meta", "0008_snapshot.json"))).toBe(true);
    const journal = JSON.parse(
      readFileSync(path.join(DIR, "meta", "_journal.json"), "utf8")
    );
    const entrada = journal.entries.find((e: { idx: number }) => e.idx === 8);
    expect(entrada).toBeDefined();
    expect(entrada.tag).toMatch(/^0008_/);
  });
});

describe("schema.ts — estruturas da Norma PoC", () => {
  it("empresas_config: 10 colunas, flags NOT NULL com default false, resto nullable", () => {
    const c = getTableColumns(empresasConfig);
    expect(Object.keys(c).sort()).toEqual(
      [
        "analistaId",
        "aprovadorId",
        "cnpj",
        "createdAt",
        "empresaId",
        "id",
        "tarifaKm",
        "temContratoCorporativoApp",
        "temValeRefeicao",
        "updatedAt",
      ].sort()
    );
    expect(c.temValeRefeicao.notNull).toBe(true);
    expect(c.temValeRefeicao.default).toBe(false);
    expect(c.temContratoCorporativoApp.notNull).toBe(true);
    expect(c.temContratoCorporativoApp.default).toBe(false);
    for (const col of [
      "cnpj",
      "tarifaKm",
      "analistaId",
      "aprovadorId",
    ] as const) {
      expect(c[col].notNull).toBe(false);
    }
  });

  it("colaborador nasce solicitante/externa e NÃO ganhou os campos cortados pelo dono", () => {
    const c = getTableColumns(colaboradores);
    expect(c.papelFluxo.notNull).toBe(true);
    expect(c.papelFluxo.default).toBe("solicitante");
    expect(c.papelFluxo.enumValues).toEqual([
      "solicitante",
      "analista",
      "aprovador",
    ]);
    expect(c.equipe.notNull).toBe(true);
    expect(c.equipe.default).toBe("externa");
    expect(c.equipe.enumValues).toEqual(["interna", "externa"]);
    // O dono cortou explicitamente estes nesta fase.
    for (const ausente of [
      "regime",
      "regimeContratacao",
      "aprovadorId",
      "contaCorrente",
    ]) {
      expect(Object.keys(c)).not.toContain(ausente);
    }
  });

  it("veiculos_colaborador: placa obrigatória, motorização e UF opcionais", () => {
    const c = getTableColumns(veiculosColaborador);
    expect(c.placa.notNull).toBe(true);
    expect(c.colaboradorId.notNull).toBe(true);
    expect(c.motorizacao.notNull).toBe(false);
    expect(c.motorizacao.enumValues).toEqual([
      "combustao",
      "hibrido",
      "eletrico",
    ]);
    expect(c.ufLicenciamento.notNull).toBe(false);
  });

  it("delegacoes_decisao: em nome de quem é obrigatório; quem decidiu aceita as duas identidades", () => {
    const c = getTableColumns(delegacoesDecisao);
    // O delegante é sempre uma pessoa da empresa.
    expect(c.emNomeDeColaboradorId.notNull).toBe(true);
    expect(c.decididoEm.notNull).toBe(true);
    // Quem executou pode ser um `usuarios` (revisor/admin da plataforma, que é
    // quem decide hoje) OU um `colaboradores`: ambos nullable de propósito. Um
    // NOT NULL em decidiuColaboradorId tornaria impossível registrar o caso
    // real de delegação — revisor sem linha em `colaboradores`.
    expect(c.decidiuColaboradorId.notNull).toBe(false);
    expect(c.decidiuUsuarioId.notNull).toBe(false);
    for (const opcional of ["despesaId", "motivo"] as const) {
      expect(c[opcional].notNull).toBe(false);
    }
  });

  it("a veiculos da empresa (RF-09) continua intacta", () => {
    const c = getTableColumns(veiculos);
    expect(Object.keys(c)).toHaveLength(8);
    expect(Object.keys(c)).toContain("kmPorLitroDeclarado");
    expect(Object.keys(getTableColumns(despesas))).toContain("veiculoId");
  });
});

/**
 * Cruzamento SQL ↔ schema.ts.
 *
 * Sem este bloco o teste-guarda aceita três mutações que derrubam o boot ou
 * criam drift silencioso — todas reproduzidas no QA de código:
 *   A) DEFAULT fora do enum      → ER_INVALID_DEFAULT (1067), fora da allowlist
 *   B) FK para tabela inexistente → ER_CANNOT_ADD_FOREIGN (1824), fora da allowlist
 *   C) coluna no schema.ts que não existe no CREATE TABLE → ER_BAD_FIELD_ERROR
 *      no primeiro SELECT do consumidor
 */
describe("0008 — o SQL bate com o schema.ts", () => {
  const arquivo = readdirSync(DIR).filter(f => /^0008_.*\.sql$/.test(f))[0];
  const sql = semComentarios(readFileSync(path.join(DIR, arquivo), "utf8"));

  // Todas as tabelas declaradas no schema.ts, por nome SQL.
  const tabelasDoSchema = new Map<string, MySqlTable>();
  for (const valor of Object.values(schema) as unknown[]) {
    if (is(valor, MySqlTable)) tabelasDoSchema.set(getTableName(valor), valor);
  }

  // Blocos CREATE TABLE do .sql → nome + colunas declaradas.
  const criadas = [
    ...sql.matchAll(/CREATE TABLE `([a-z_]+)` \(([\s\S]*?)\n\);/g),
  ].map(([, nome, corpo]) => ({
    nome,
    colunas: [...corpo.matchAll(/^\t`([a-z_]+)`/gm)].map(m => m[1]),
  }));

  it("toda tabela criada existe no schema.ts com exatamente as mesmas colunas", () => {
    expect(criadas.length).toBe(3);
    for (const { nome, colunas } of criadas) {
      const tabela = tabelasDoSchema.get(nome);
      expect(tabela, `tabela ${nome} não existe em schema.ts`).toBeDefined();
      const noSchema = Object.values(getTableColumns(tabela!)).map(c => c.name);
      expect(colunas.slice().sort(), `drift de colunas em ${nome}`).toEqual(
        noSchema.slice().sort()
      );
    }
  });

  it("toda coluna adicionada por ALTER existe no schema.ts da tabela alvo", () => {
    const adds = [...sql.matchAll(/ALTER TABLE `([a-z_]+)` ADD `([a-z_]+)`/g)];
    expect(adds.length).toBe(2);
    for (const [, tabelaNome, coluna] of adds) {
      const tabela = tabelasDoSchema.get(tabelaNome);
      expect(
        tabela,
        `tabela ${tabelaNome} não existe em schema.ts`
      ).toBeDefined();
      const noSchema = Object.values(getTableColumns(tabela!)).map(c => c.name);
      expect(
        noSchema,
        `${tabelaNome}.${coluna} não está no schema.ts`
      ).toContain(coluna);
    }
  });

  it("todo DEFAULT de enum está dentro dos valores declarados no próprio SQL", () => {
    const comDefault = [
      ...sql.matchAll(/enum\(([^)]+)\)(?: NOT NULL)? DEFAULT '([^']+)'/g),
    ];
    expect(comDefault.length).toBeGreaterThan(0);
    for (const [, valoresRaw, padrao] of comDefault) {
      const valores = valoresRaw
        .split(",")
        .map(v => v.trim().replace(/^'|'$/g, ""));
      expect(
        valores,
        `DEFAULT '${padrao}' fora do enum ${valoresRaw}`
      ).toContain(padrao);
    }
  });

  it("toda FK aponta para tabela e colunas que existem no schema.ts", () => {
    const fks = [...sql.matchAll(/REFERENCES `([a-z_]+)`\(([^)]+)\)/g)];
    expect(fks.length).toBe(9);
    for (const [, alvoNome, colunasRaw] of fks) {
      const alvo = tabelasDoSchema.get(alvoNome);
      expect(
        alvo,
        `FK aponta para tabela inexistente: ${alvoNome}`
      ).toBeDefined();
      const colunas = Object.values(getTableColumns(alvo!)).map(c => c.name);
      for (const alvoColuna of colunasRaw
        .split(",")
        .map(c => c.trim().replace(/`/g, ""))) {
        expect(
          colunas,
          `FK aponta para coluna inexistente: ${alvoNome}.${alvoColuna}`
        ).toContain(alvoColuna);
      }
    }
  });

  it("as 4 FKs compostas amarram colaborador à MESMA empresa (multi-tenant)", () => {
    // Achado B do QA de código: sem isto o banco aceita analista de outra
    // empresa e delegação entre tenants — provado lá por INSERT.
    const compostas = [
      "empresas_config_analista_mesma_empresa_fk",
      "empresas_config_aprovador_mesma_empresa_fk",
      "delegacoes_decisao_decidiu_mesma_empresa_fk",
      "delegacoes_decisao_em_nome_mesma_empresa_fk",
    ];
    for (const nome of compostas) {
      const st = sql
        .split("--> statement-breakpoint")
        .map(x => x.trim())
        .find(x => x.includes("`" + nome + "`"));
      expect(st, `FK composta ausente: ${nome}`).toBeDefined();
      expect(st).toMatch(/FOREIGN KEY \(`empresa_id`,`[a-z_]+`\)/);
      expect(st).toMatch(/REFERENCES `colaboradores`\(`empresa_id`,`id`\)/);
    }
    // ORDEM: o índice tem de vir ANTES das FKs que o referenciam. O drizzle
    // emite CREATE INDEX por último; medido contra MySQL 8.0.46, nessa ordem
    // as 4 FKs falham com ER_FK_NO_INDEX_PARENT (1822), que NÃO está na
    // allowlist do apply.ts — o container não sobe. Se este teste falhar
    // depois de regerar a migração, mova o CREATE INDEX para o topo do .sql.
    const ordem = sql.split("--> statement-breakpoint").map(x => x.trim());
    const posIndice = ordem.findIndex(x =>
      x.includes("colaboradores_empresa_id_id_idx")
    );
    expect(posIndice).toBeGreaterThanOrEqual(0);
    for (const nome of compostas) {
      const posFk = ordem.findIndex(x => x.includes("`" + nome + "`"));
      expect(
        posFk,
        `${nome} vem antes do índice — o boot quebraria`
      ).toBeGreaterThan(posIndice);
    }

    // E o índice que o InnoDB exige do lado referenciado.
    expect(sql).toMatch(
      /CREATE INDEX `colaboradores_empresa_id_id_idx` ON `colaboradores` \(`empresa_id`,`id`\)/
    );
  });
});
