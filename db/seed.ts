import { eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import {
  cnaesSecundarios,
  empresas,
  politicasReembolso,
  regrasElegibilidade,
  usuarios,
  veiculos,
} from "./schema";
import { hashSenha } from "../api/auth/password";
import { VERSAO_REGRA } from "../api/modules/fiscal/engine/params";
import type { RegrasPolitica } from "@contracts/types";

/**
 * Seed — Tax Engine (reembolsa.ia.br):
 * 1. Matriz de elegibilidade CNAE × categoria (MVP, §7.2 da spec) + dedutibilidade IRPJ/CSLL
 * 2. Usuários iniciais: admin, revisor e cliente demo
 * 3. Empresa demo (transporte de cargas) + veículo demo
 */

type LinhaMatriz = {
  padrao: string;
  combustivel: string;
  alimentacao: string;
  hospedagem: string;
  pedagio: string;
  uber: string;
  taxi: string;
  baseLegal: string;
};

// §7.2 — "Média-Alta" do MVP mapeada para "media" (escala alta|media|baixa|vedado)
const MATRIZ: LinhaMatriz[] = [
  {
    padrao: "49.30-2",
    combustivel: "alta", alimentacao: "media", hospedagem: "media",
    pedagio: "alta", uber: "baixa", taxi: "baixa",
    baseLegal: "Transporte de cargas: insumo da atividade (Lei 10.637/2002 e 10.833/2003)",
  },
  {
    padrao: "49.2x",
    combustivel: "alta", alimentacao: "media", hospedagem: "media",
    pedagio: "alta", uber: "baixa", taxi: "baixa",
    baseLegal: "Transporte de passageiros: insumo da atividade",
  },
  {
    padrao: "47.31-8",
    combustivel: "vedado", alimentacao: "baixa", hospedagem: "baixa",
    pedagio: "baixa", uber: "baixa", taxi: "baixa",
    baseLegal: "Revenda de combustível: vedado crédito sobre objeto da revenda",
  },
  {
    padrao: "46.81-8",
    combustivel: "vedado", alimentacao: "baixa", hospedagem: "baixa",
    pedagio: "baixa", uber: "baixa", taxi: "baixa",
    baseLegal: "Comércio atacadista de combustíveis: vedado crédito sobre objeto da revenda",
  },
  {
    padrao: "41.x",
    combustivel: "alta", alimentacao: "media", hospedagem: "media",
    pedagio: "media", uber: "baixa", taxi: "baixa",
    baseLegal: "Construção civil: deslocamento a obras como insumo",
  },
  {
    padrao: "42.x",
    combustivel: "alta", alimentacao: "media", hospedagem: "media",
    pedagio: "media", uber: "baixa", taxi: "baixa",
    baseLegal: "Construção civil: deslocamento a obras como insumo",
  },
  {
    padrao: "43.x",
    combustivel: "alta", alimentacao: "media", hospedagem: "media",
    pedagio: "media", uber: "baixa", taxi: "baixa",
    baseLegal: "Construção civil: deslocamento a obras como insumo",
  },
  {
    padrao: "33.1x",
    combustivel: "alta", alimentacao: "media", hospedagem: "media",
    pedagio: "media", uber: "baixa", taxi: "baixa",
    baseLegal: "Manutenção industrial: deslocamento técnico como insumo",
  },
  {
    padrao: "69.11-7",
    combustivel: "baixa", alimentacao: "baixa", hospedagem: "baixa",
    pedagio: "baixa", uber: "baixa", taxi: "baixa",
    baseLegal: "Serviços advocatícios: sem vínculo direto com insumo",
  },
  {
    padrao: "69.20-6",
    combustivel: "baixa", alimentacao: "baixa", hospedagem: "baixa",
    pedagio: "baixa", uber: "baixa", taxi: "baixa",
    baseLegal: "Serviços contábeis: sem vínculo direto com insumo",
  },
  {
    padrao: "46.x",
    combustivel: "media", alimentacao: "baixa", hospedagem: "baixa",
    pedagio: "media", uber: "baixa", taxi: "baixa",
    baseLegal: "Comércio com entrega própria: elegibilidade parcial",
  },
  {
    padrao: "47.x",
    combustivel: "media", alimentacao: "baixa", hospedagem: "baixa",
    pedagio: "media", uber: "baixa", taxi: "baixa",
    baseLegal: "Comércio com entrega própria: elegibilidade parcial",
  },
  {
    padrao: "80.1x",
    combustivel: "alta", alimentacao: "baixa", hospedagem: "baixa",
    pedagio: "media", uber: "baixa", taxi: "baixa",
    baseLegal: "Segurança privada: rondas e deslocamento como insumo",
  },
  {
    padrao: "86.x",
    combustivel: "alta", alimentacao: "media", hospedagem: "media",
    pedagio: "media", uber: "baixa", taxi: "baixa",
    baseLegal: "Saúde domiciliar: deslocamento assistencial como insumo",
  },
  {
    padrao: "*",
    combustivel: "baixa", alimentacao: "baixa", hospedagem: "baixa",
    pedagio: "baixa", uber: "baixa", taxi: "baixa",
    baseLegal: "CNAE não mapeado: confiança baixa (revisão obrigatória)",
  },
];

const CATEGORIAS = [
  "combustivel",
  "alimentacao",
  "hospedagem",
  "pedagio",
  "uber",
  "taxi",
] as const;

const VIGENCIA_INICIO = "2024-01-01";

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  // ── 1. Matriz de elegibilidade ────────────────────────────────────────────
  const existentes = await db.select({ id: regrasElegibilidade.id }).from(regrasElegibilidade).limit(1);
  if (existentes.length === 0) {
    const rows: (typeof regrasElegibilidade.$inferInsert)[] = [];
    for (const linha of MATRIZ) {
      for (const categoria of CATEGORIAS) {
        const confianca = linha[categoria] as "alta" | "media" | "baixa" | "vedado";
        rows.push({
          cnaePadrao: linha.padrao,
          categoria,
          tributo: "pis_cofins",
          tipoBeneficio: "credito",
          confianca,
          aliquota: 0.0925,
          baseLegal: linha.baseLegal,
          vigenciaInicio: VIGENCIA_INICIO,
          vigenciaFim: null,
          versao: VERSAO_REGRA,
        });
        if (categoria === "combustivel") {
          // ICMS monofásico acompanha a confiança da matriz para combustível
          rows.push({
            cnaePadrao: linha.padrao,
            categoria,
            tributo: "icms",
            tipoBeneficio: "credito",
            confianca,
            aliquota: null,
            baseLegal: "Convênio ICMS 15/2023 — monofásico ad rem por UF",
            vigenciaInicio: VIGENCIA_INICIO,
            vigenciaFim: null,
            versao: VERSAO_REGRA,
          });
        }
      }
    }
    // Dedutibilidade IRPJ/CSLL: regra única, qualquer CNAE, alta confiança
    for (const categoria of CATEGORIAS) {
      rows.push({
        cnaePadrao: "*",
        categoria,
        tributo: "irpj_csll",
        tipoBeneficio: "dedutibilidade",
        confianca: "alta",
        aliquota: 0.34,
        baseLegal: "Art. 311 RIR/2018 (IRPJ 25%); Art. 435 RIR/2018 (CSLL 9%)",
        vigenciaInicio: VIGENCIA_INICIO,
        vigenciaFim: null,
        versao: VERSAO_REGRA,
      });
    }
    await db.insert(regrasElegibilidade).values(rows);
    console.log(`  regras_elegibilidade: ${rows.length} linhas`);
  } else {
    console.log("  regras_elegibilidade: já populada, pulando");
  }

  // ── 2. Usuários ───────────────────────────────────────────────────────────
  async function upsertUsuario(
    email: string,
    nome: string,
    senha: string,
    perfil: "admin" | "cliente" | "revisor",
  ): Promise<number> {
    const rows = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);
    if (rows[0]) return rows[0].id;
    const result = await db.insert(usuarios).values({
      email,
      nome,
      senhaHash: await hashSenha(senha),
      perfil,
    });
    console.log(`  usuario: ${email} (${perfil})`);
    return Number(result[0].insertId);
  }

  await upsertUsuario("admin@reembolsa.ia.br", "Administrador", "Admin@12345", "admin");
  await upsertUsuario("revisor@reembolsa.ia.br", "Revisor Tributário", "Revisor@12345", "revisor");
  const clienteId = await upsertUsuario("cliente@demo.com.br", "Cliente Demo", "Cliente@12345", "cliente");

  // ── 3. Empresa + veículo demo ─────────────────────────────────────────────
  const empresaExistente = await db
    .select({ id: empresas.id })
    .from(empresas)
    .where(eq(empresas.cnpj, "12.345.678/0001-90"))
    .limit(1);
  let empresaId: number;
  if (empresaExistente[0]) {
    empresaId = empresaExistente[0].id;
  } else {
    const result = await db.insert(empresas).values({
      usuarioId: clienteId,
      razaoSocial: "Transportes Demo Ltda",
      cnpj: "12.345.678/0001-90",
      cnaePrincipal: "49.30-2",
      regimeTributario: "lucro_real",
      uf: "SP",
    });
    empresaId = Number(result[0].insertId);
    await db.insert(cnaesSecundarios).values([
      { empresaId, cnae: "52.31-0" },
    ]);
    console.log("  empresa demo: Transportes Demo Ltda (49.30-2, lucro_real, SP)");
  }

  const veiculoExistente = await db
    .select({ id: veiculos.id })
    .from(veiculos)
    .where(eq(veiculos.placa, "ABC1D23"))
    .limit(1);
  if (!veiculoExistente[0]) {
    await db.insert(veiculos).values({
      empresaId,
      placa: "ABC1D23",
      renavam: "12345678901",
      kmPorLitroDeclarado: 8.5,
      tarifaReembolsoKm: 0.85,
      descricao: "Caminhão 3/4 diesel (demo)",
    });
    console.log("  veiculo demo: ABC1D23 (8,5 km/L, R$ 0,85/km)");
  }

  // ── 4. Política de reembolso demo ATIVA (v1.1.0) ──────────────────────────
  const politicaExistente = await db
    .select({ id: politicasReembolso.id })
    .from(politicasReembolso)
    .where(eq(politicasReembolso.empresaId, empresaId))
    .limit(1);
  if (!politicaExistente[0]) {
    const textoPolitica = [
      "POLÍTICA DE REEMBOLSO DE DESPESAS — TRANSPORTES DEMO LTDA",
      "Vigência: 01/01/2025",
      "",
      "1. ALIMENTAÇÃO: reembolso de até R$ 120,00 por dia, mediante nota fiscal ou recibo.",
      "   Evidência obrigatória para alimentação acima de R$ 120,00.",
      "2. HOSPEDAGEM: reembolso de até R$ 450,00 por diária. Nota fiscal/recibo obrigatório.",
      "3. TRANSPORTE POR APLICATIVO (Uber/99): até R$ 80,00 por corrida.",
      "4. TÁXI: até R$ 80,00 por corrida, com recibo.",
      "5. COMBUSTÍVEL: reembolso de até R$ 600,00 por abastecimento, somente para",
      "   veículo cadastrado na empresa. Tarifa de R$ 0,85 por km rodado para veículo próprio.",
      "6. PEDÁGIO: reembolso integral mediante comprovante.",
      "7. APROVAÇÃO AUTOMÁTICA: despesas até R$ 200,00 são aprovadas automaticamente.",
      "8. REVISÃO HUMANA: despesas acima de R$ 2.000,00 exigem revisão humana do financeiro.",
      "9. NEGAÇÃO: despesas acima de R$ 5.000,00 não são reembolsadas.",
    ].join("\n");
    const regrasDemo: RegrasPolitica = {
      limitesPorCategoria: {
        alimentacao: 120,
        hospedagem: 450,
        uber: 80,
        taxi: 80,
        combustivel: 600,
        pedagio: null,
      },
      exigeVeiculoCadastrado: ["combustivel"],
      exigeEvidencia: ["hospedagem", "alimentacao"],
      aprovacaoAutomaticaAte: 200,
      revisaoHumanaAcimaDe: 2000,
      negacaoAcimaDe: 5000,
      observacoes: [
        "Tarifa de R$ 0,85 por km rodado para veículo próprio cadastrado.",
        "Evidência obrigatória para alimentação acima de R$ 120,00.",
      ],
    };
    await db.insert(politicasReembolso).values({
      empresaId,
      arquivoNome: "politica-reembolso-demo.txt",
      arquivoPath: null,
      textoExtraido: textoPolitica,
      regras: regrasDemo,
      status: "ativa",
      versao: 1,
      confiancaExtracao: "alta",
      camposPendentes: [],
      createdById: clienteId,
    });
    console.log("  politica demo: ATIVA (v1) para Transportes Demo Ltda");
  } else {
    console.log("  politica demo: já existe, pulando");
  }

  console.log("Done.");
  process.exit(0); // close MySQL connection pool
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
