/**
 * Máquina de estados do onboarding conversacional (v1.5.0) — ver
 * docs/ARQUITETURA.md §3. Função pura: recebe sessão + texto, devolve o
 * próximo estado, o novo contexto, as respostas a enviar e as ações de
 * escrita (o handler em api/agente/index.ts executa as ações no banco).
 *
 * Princípios do produto aplicados aqui:
 * - Confirmação, não cadastro (D-005): o admin cadastrou; o funcionário confere.
 * - Cada campo é uma defesa (D-001): veículo só é pedido a quem declarou
 *   combustível — ou a quem mandar despesa de combustível (correção de rota,
 *   v1.6.0).
 * - O interesse é dele (D-004): a conversa destrava o reembolso do funcionário.
 */

export type EstadoConversa =
  | "inicio"
  | "confirmando_dados"
  | "declarando_combustivel"
  | "declarando_viagem"
  | "declarando_refeicao"
  | "coletando_veiculo_placa"
  | "coletando_veiculo_descricao"
  | "coletando_veiculo_consumo"
  | "pronto";

export interface ContextoConversa {
  combustivel?: boolean;
  viagem?: boolean;
  refeicao?: boolean;
  veiculoPlaca?: string;
  veiculoDescricao?: string;
  veiculoConsumo?: number;
}

export interface DadosColaborador {
  nome: string;
  email: string | null;
  telefone: string | null;
  matricula: string | null;
}

export interface EntradaMaquina {
  estado: EstadoConversa;
  contexto: ContextoConversa;
  colaborador: DadosColaborador;
  empresaNome: string;
  texto: string;
}

export type AcaoMaquina =
  | { tipo: "salvar_declaracoes" }
  | { tipo: "criar_veiculo" }
  | { tipo: "marcar_confirmado" }
  | { tipo: "marcar_divergencia"; detalhe: string };

export interface SaidaMaquina {
  estado: EstadoConversa;
  contexto: ContextoConversa;
  respostas: string[];
  acoes: AcaoMaquina[];
}

/** "sim", "s", "isso", "confirma", "👍" → true; "não", "nao", "n" → false. */
export function interpretarSimNao(texto: string): boolean | null {
  const t = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // faixa de diacríticos combinantes
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
  if (!t) return null;
  const sim = ["sim", "s", "isso", "confirma", "confirmo", "ok", "okay", "exato", "correto", "certo", "claro"];
  const nao = ["nao", "n", "negativo", "errado", "incorreto", "nops", "nop"];
  const primeira = t.split(/\s+/)[0];
  if (sim.includes(t) || sim.includes(primeira)) return true;
  if (nao.includes(t) || nao.includes(primeira)) return false;
  return null;
}

const REGRA_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/; // Mercosul e antiga

export function normalizarPlaca(texto: string): string | null {
  const t = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return REGRA_PLACA.test(t) ? t : null;
}

export function interpretarConsumo(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  const match = t.match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const valor = Number(match[1]);
  return valor > 2 && valor < 40 ? valor : null;
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0];
}

function resumoDados(c: DadosColaborador): string {
  const linhas = [
    `• Nome: ${c.nome}`,
    c.matricula ? `• Matrícula: ${c.matricula}` : null,
    c.email ? `• E-mail: ${c.email}` : null,
  ].filter(Boolean);
  return linhas.join("\n");
}

const PERGUNTA_COMBUSTIVEL =
  "Você roda com *veículo próprio* a trabalho e pede reembolso de combustível/km? (responda *sim* ou *não*)";
const PERGUNTA_VIAGEM =
  "Você *viaja* a trabalho (hospedagem, passagens)? (sim/não)";
const PERGUNTA_REFEICAO =
  "Você costuma ter despesas de *alimentação* (refeição a trabalho ou com cliente)? (sim/não)";

/**
 * Avança a conversa um passo. Idempotente por natureza: mesma entrada,
 * mesma saída — o handler garante persistência entre chamadas.
 */
export function proximoPasso(entrada: EntradaMaquina): SaidaMaquina {
  const { colaborador, empresaNome } = entrada;
  const ctx: ContextoConversa = { ...entrada.contexto };
  const nome = primeiroNome(colaborador.nome);
  const texto = entrada.texto.trim();

  switch (entrada.estado) {
    case "inicio":
      return {
        estado: "confirmando_dados",
        contexto: ctx,
        respostas: [
          `Oi, ${nome}! Aqui é o reembolso da *${empresaNome}* 🤝`,
          `Cadastraram você com esses dados:\n${resumoDados(colaborador)}\n\nEstá tudo certo? (responda *sim* ou me diga o que está errado)`,
        ],
        acoes: [],
      };

    case "confirmando_dados": {
      const sn = interpretarSimNao(texto);
      if (sn === true) {
        return {
          estado: "declarando_combustivel",
          contexto: ctx,
          respostas: [
            "Perfeito! Agora rapidinho, 3 perguntas pra eu saber o que você costuma pedir de reembolso — assim eu só te peço o que realmente importa pro seu caso.",
            PERGUNTA_COMBUSTIVEL,
          ],
          acoes: [],
        };
      }
      if (sn === false) {
        return {
          estado: "declarando_combustivel",
          contexto: ctx,
          respostas: [
            "Obrigado por avisar! Anotei aqui e o responsável da sua empresa vai revisar seus dados — pode continuar normalmente por enquanto. 👍",
            PERGUNTA_COMBUSTIVEL,
          ],
          acoes: [
            {
              tipo: "marcar_divergencia",
              detalhe: `Colaborador contestou os dados no onboarding: "${texto.slice(0, 200)}"`,
            },
          ],
        };
      }
      return {
        estado: "confirmando_dados",
        contexto: ctx,
        respostas: [
          `Não entendi — pode responder *sim* (está tudo certo) ou *não* (tem algo errado)?`,
        ],
        acoes: [],
      };
    }

    case "declarando_combustivel": {
      const sn = interpretarSimNao(texto);
      if (sn === null) {
        return { estado: entrada.estado, contexto: ctx, respostas: [`Me responde só *sim* ou *não*: ${PERGUNTA_COMBUSTIVEL}`], acoes: [] };
      }
      ctx.combustivel = sn;
      return { estado: "declarando_viagem", contexto: ctx, respostas: [PERGUNTA_VIAGEM], acoes: [] };
    }

    case "declarando_viagem": {
      const sn = interpretarSimNao(texto);
      if (sn === null) {
        return { estado: entrada.estado, contexto: ctx, respostas: [`Me responde só *sim* ou *não*: ${PERGUNTA_VIAGEM}`], acoes: [] };
      }
      ctx.viagem = sn;
      return { estado: "declarando_refeicao", contexto: ctx, respostas: [PERGUNTA_REFEICAO], acoes: [] };
    }

    case "declarando_refeicao": {
      const sn = interpretarSimNao(texto);
      if (sn === null) {
        return { estado: entrada.estado, contexto: ctx, respostas: [`Me responde só *sim* ou *não*: ${PERGUNTA_REFEICAO}`], acoes: [] };
      }
      ctx.refeicao = sn;
      const acoes: AcaoMaquina[] = [{ tipo: "salvar_declaracoes" }];
      if (ctx.combustivel) {
        return {
          estado: "coletando_veiculo_placa",
          contexto: ctx,
          respostas: [
            "Anotado! 📝 Como você roda com veículo próprio, preciso dele pra defender seus reembolsos de combustível — prometo que é só desta vez.",
            "Qual a *placa* do veículo? (ex.: ABC1D23)",
          ],
          acoes,
        };
      }
      return {
        estado: "pronto",
        contexto: ctx,
        respostas: [
          "Prontinho, cadastro confirmado! ✅",
          "Quando tiver uma despesa, é só mandar a foto da nota/cupom aqui que eu cuido do resto.",
        ],
        acoes: [...acoes, { tipo: "marcar_confirmado" }],
      };
    }

    case "coletando_veiculo_placa": {
      const placa = normalizarPlaca(texto);
      if (!placa) {
        return {
          estado: entrada.estado,
          contexto: ctx,
          respostas: ["Essa placa não parece válida. Me manda no formato ABC1D23 ou ABC-1234?"],
          acoes: [],
        };
      }
      ctx.veiculoPlaca = placa;
      return {
        estado: "coletando_veiculo_descricao",
        contexto: ctx,
        respostas: ["Qual o veículo? (ex.: Onix prata 2022)"],
        acoes: [],
      };
    }

    case "coletando_veiculo_descricao": {
      if (texto.length < 3) {
        return { estado: entrada.estado, contexto: ctx, respostas: ["Me diz o modelo do veículo? (ex.: Onix prata 2022)"], acoes: [] };
      }
      ctx.veiculoDescricao = texto.slice(0, 255);
      return {
        estado: "coletando_veiculo_consumo",
        contexto: ctx,
        respostas: ["Última: quantos *km por litro* ele faz em média? (ex.: 12,5 — se não souber, chuta um valor aproximado)"],
        acoes: [],
      };
    }

    case "coletando_veiculo_consumo": {
      const consumo = interpretarConsumo(texto);
      if (consumo === null) {
        return {
          estado: entrada.estado,
          contexto: ctx,
          respostas: ["Não entendi o número. Me manda só o valor, ex.: 12,5"],
          acoes: [],
        };
      }
      ctx.veiculoConsumo = consumo;
      return {
        estado: "pronto",
        contexto: ctx,
        respostas: [
          `Veículo cadastrado: *${ctx.veiculoDescricao}* (${ctx.veiculoPlaca}), ${String(consumo).replace(".", ",")} km/l. ✅`,
          "Prontinho! Quando tiver uma despesa, é só mandar a foto da nota/cupom aqui que eu cuido do resto.",
        ],
        acoes: [{ tipo: "criar_veiculo" }, { tipo: "marcar_confirmado" }],
      };
    }

    case "pronto":
      return {
        estado: "pronto",
        contexto: ctx,
        respostas: [
          `${nome}, seu cadastro já está completinho ✅ — em breve você vai poder mandar as despesas por aqui. Por enquanto, qualquer dúvida fala com o responsável da sua empresa.`,
        ],
        acoes: [],
      };
  }
}

/** Mensagem para telefone sem colaborador cadastrado (D-005: portão único). */
export const MSG_TELEFONE_DESCONHECIDO =
  "Olá! Ainda não encontrei seu cadastro por este número. Peça ao responsável da sua empresa para cadastrar seu telefone no reembolsa.ia — assim que cadastrar, me chama aqui de novo. 👋";
