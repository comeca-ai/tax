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

/**
 * REFORÇO — achado 2 do QA de código (27/08).
 *
 * O cruzamento SQL↔schema.ts acima compara só NOMES de coluna. Três mutações
 * passavam 19/19 verdes, todas reproduzidas contra MySQL 8.0.46 real:
 *   FG1) `bigint unsigned` → `int unsigned` em empresas_config.empresa_id
 *        ⇒ ER_FK_INCOMPATIBLE_COLUMNS (3780), FORA da allowlist do apply.ts,
 *          `set -e` no entrypoint ⇒ o container NÃO SOBE.
 *   FG2) `double` → `varchar(10)` em tarifa_km ⇒ drift silencioso (o app lê
 *        número, o banco guarda string).
 *   FG3) remover o UNIQUE de empresa_id ⇒ duas configs para a mesma empresa.
 *
 * O snapshot do próprio drizzle já traz `type` e `notNull` por coluna e os
 * índices (uniques inclusive, com isUnique), então a checagem sai de graça —
 * e é o drizzle, não nós, quem define a verdade.
 */
type ColunaSql = { tipo: string; notNull: boolean };

/** Extrai tipo e nulabilidade de uma definição de coluna do .sql. */
function defColuna(resto: string): ColunaSql {
  const semAuto = resto.replace(/\s+AUTO_INCREMENT\b/g, "");
  const notNull = /\bNOT NULL\b/.test(semAuto);
  const tipo = semAuto
    .replace(/\s+NOT NULL\b/g, "")
    .replace(/\s+DEFAULT\s+.*$/i, "")
    .replace(/\s+ON UPDATE\s+.*$/i, "")
    .replace(/,\s*$/, "")
    .trim();
  return { tipo, notNull };
}

/** Colunas por tabela declaradas nos CREATE TABLE e nos ALTER ... ADD do .sql. */
function colunasDoSql(sql: string): Map<string, Map<string, ColunaSql>> {
  const fora = new Map<string, Map<string, ColunaSql>>();
  for (const [, nome, corpo] of sql.matchAll(
    /CREATE TABLE `([a-z_]+)` \(([\s\S]*?)\n\);/g
  )) {
    const cols = new Map<string, ColunaSql>();
    for (const linha of corpo.split("\n")) {
      const m = /^\t`([a-z_]+)`\s+(.+?),?$/.exec(linha);
      if (m) cols.set(m[1]!, defColuna(m[2]!));
    }
    fora.set(nome, cols);
  }
  for (const [, tabela, coluna, resto] of sql.matchAll(
    /ALTER TABLE `([a-z_]+)` ADD `([a-z_]+)`\s+(.+?);/g
  )) {
    if (!fora.has(tabela)) fora.set(tabela, new Map());
    fora.get(tabela)!.set(coluna, defColuna(resto));
  }
  return fora;
}

function lerSnapshot(idx: string): {
  tables: Record<
    string,
    {
      columns: Record<string, { type: string; notNull?: boolean }>;
      indexes: Record<
        string,
        { name: string; columns: string[]; isUnique: boolean }
      >;
    }
  >;
} {
  return JSON.parse(
    readFileSync(path.join(DIR, "meta", `${idx}_snapshot.json`), "utf8")
  );
}

describe("SQL × snapshot — tipo, nulabilidade e unique (não só nome)", () => {
  const snap = lerSnapshot("0009");

  it("0008: toda coluna criada tem no .sql o MESMO tipo do snapshot (mata FG1/FG2)", () => {
    const arquivo = readdirSync(DIR).filter(f => /^0008_.*\.sql$/.test(f))[0];
    const doSql = colunasDoSql(
      semComentarios(readFileSync(path.join(DIR, arquivo!), "utf8"))
    );
    expect(doSql.size).toBeGreaterThan(0);

    let conferidas = 0;
    for (const [tabela, colunas] of doSql) {
      const noSnap = snap.tables[tabela];
      expect(noSnap, `tabela ${tabela} ausente do snapshot`).toBeDefined();
      for (const [coluna, { tipo, notNull }] of colunas) {
        const ref = noSnap!.columns[coluna];
        expect(ref, `${tabela}.${coluna} ausente do snapshot`).toBeDefined();
        expect(tipo, `tipo divergente em ${tabela}.${coluna}`).toBe(ref!.type);
        expect(notNull, `nulabilidade divergente em ${tabela}.${coluna}`).toBe(
          ref!.notNull === true
        );
        conferidas++;
      }
    }
    // 3 CREATE TABLE (10+6+9 colunas) + 2 ALTER ADD
    expect(conferidas).toBe(27);
  });

  it("0008: todo UNIQUE do snapshot está no .sql (mata FG3)", () => {
    const arquivo = readdirSync(DIR).filter(f => /^0008_.*\.sql$/.test(f))[0];
    const sql = semComentarios(readFileSync(path.join(DIR, arquivo!), "utf8"));
    const criadas = [...sql.matchAll(/CREATE TABLE `([a-z_]+)`/g)].map(
      m => m[1]!
    );
    expect(criadas.length).toBe(3);

    let uniques = 0;
    for (const tabela of criadas) {
      for (const idx of Object.values(snap.tables[tabela]!.indexes)) {
        if (!idx.isUnique) continue;
        // O drizzle emite o unique inline, como CONSTRAINT ... UNIQUE(cols).
        const cols = idx.columns.map(c => "`" + c + "`").join(",");
        expect(
          sql,
          `UNIQUE ${idx.name} sumiu do .sql — duas linhas iguais passariam`
        ).toContain(`CONSTRAINT \`${idx.name}\` UNIQUE(${cols})`);
        uniques++;
      }
    }
    expect(uniques).toBe(2);
  });
});

/**
 * Guarda da migração 0009 — fecha a terceira ponta da delegação.
 *
 * A 0008 amarrou quem-decidiu e em-nome-de-quem a `colaboradores(empresa_id,id)`,
 * mas deixou `despesa_id` como FK SIMPLES. O QA de 27/08 gravou, com dado real
 * de produção, uma delegação da empresa 1 apontando despesa da empresa 2.
 */
const arquivos0009 = readdirSync(DIR).filter(f => /^0009_.*\.sql$/.test(f));

describe("migração 0009 — aditiva (delegação × despesa)", () => {
  it("existe exatamente UM arquivo 0009_*.sql", () => {
    expect(arquivos0009).toHaveLength(1);
  });

  const sql = semComentarios(
    readFileSync(path.join(DIR, arquivos0009[0]!), "utf8")
  );
  const statements = sql
    .split("--> statement-breakpoint")
    .map(s => s.trim())
    .filter(Boolean);

  it("tem 2 statements: 1 CREATE INDEX e 1 ADD CONSTRAINT", () => {
    expect(statements).toHaveLength(2);
    expect(statements.filter(s => /^CREATE INDEX/.test(s))).toHaveLength(1);
    expect(statements.filter(s => /ADD CONSTRAINT/.test(s))).toHaveLength(1);
  });

  it("nenhum statement é destrutivo", () => {
    // Mesmo desconto da 0008: `ON DELETE no action` / `ON UPDATE no action`
    // carregam as palavras sem serem verbos.
    for (const s of statements) {
      const limpo = s
        .replace(/ON DELETE no action/g, "")
        .replace(/ON UPDATE no action/g, "");
      expect(limpo, `statement destrutivo: ${s.slice(0, 60)}`).not.toMatch(
        /\b(DROP|MODIFY|CHANGE|RENAME|TRUNCATE|DELETE|UPDATE)\b/i
      );
    }
  });

  it("o CREATE INDEX vem ANTES da FK composta (senão o boot quebra com 1822)", () => {
    // Mesma armadilha da 0008: o drizzle emite o índice por último. Se alguém
    // regerar a 0009 e não reordenar, o MySQL devolve ER_FK_NO_INDEX_PARENT
    // (1822), que NÃO está na allowlist do apply.ts, e o container não sobe.
    const posIndice = statements.findIndex(s =>
      s.includes("despesas_empresa_id_id_idx")
    );
    const posFk = statements.findIndex(s =>
      s.includes("delegacoes_decisao_despesa_mesma_empresa_fk")
    );
    expect(posIndice).toBeGreaterThanOrEqual(0);
    expect(posFk).toBeGreaterThanOrEqual(0);
    expect(
      posFk,
      "a FK composta vem antes do índice — o boot quebraria"
    ).toBeGreaterThan(posIndice);
  });

  it("a FK amarra (empresa_id, despesa_id) a despesas(empresa_id, id)", () => {
    expect(sql).toMatch(
      /ADD CONSTRAINT `delegacoes_decisao_despesa_mesma_empresa_fk` FOREIGN KEY \(`empresa_id`,`despesa_id`\) REFERENCES `despesas`\(`empresa_id`,`id`\)/
    );
    expect(sql).toMatch(
      /CREATE INDEX `despesas_empresa_id_id_idx` ON `despesas` \(`empresa_id`,`id`\)/
    );
  });

  it("todo statement é re-executável sob a allowlist do apply.ts", () => {
    // CREATE INDEX repetido → ER_DUP_KEYNAME; ADD CONSTRAINT → ER_FK_DUP_NAME.
    // Ambos tolerados, então a 2ª passada do boot não mata o container.
    for (const s of statements) {
      expect(s).toMatch(/^(CREATE INDEX|ALTER TABLE `[a-z_]+` ADD CONSTRAINT)/);
    }
  });

  it("nenhum identificador passa de 64 caracteres", () => {
    for (const [, nome] of sql.matchAll(/`([a-z_]{40,})`/g)) {
      expect(nome!.length, `identificador longo: ${nome}`).toBeLessThanOrEqual(
        64
      );
    }
  });

  it("o snapshot e o journal da 0009 foram commitados juntos", () => {
    const tag = arquivos0009[0]!.replace(/\.sql$/, "");
    expect(existsSync(path.join(DIR, "meta", "0009_snapshot.json"))).toBe(true);
    const journal = JSON.parse(
      readFileSync(path.join(DIR, "meta", "_journal.json"), "utf8")
    ) as { entries: { idx: number; tag: string }[] };
    const entrada = journal.entries.find(e => e.idx === 9);
    expect(entrada, "journal sem entrada idx=9").toBeDefined();
    expect(entrada!.tag).toBe(tag);
  });
});
