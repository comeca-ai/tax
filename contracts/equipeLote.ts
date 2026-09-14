import { emailDoDominio, mensagemDominioConvite } from "./dominioConvite";
import { z } from "zod";

export const linhaEquipeSchema = z.object({
  nome: z.string().trim().min(3).max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  telefone: z
    .string()
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Use telefone internacional, como +5511999999999"
    ),
  matricula: z.string().trim().toUpperCase().min(1).max(50),
  vinculo: z.enum(["CLT", "MEI", "PJ"]),
  superiorMatricula: z.string().trim().toUpperCase().max(50).default(""),
  equipe: z.enum(["interna", "externa"]),
});
export type LinhaEquipe = z.infer<typeof linhaEquipeSchema>;
export const arquivoEquipeSchema = z.object({
  empresaId: z.number().int().positive(),
  csv: z.string().min(1).max(200_000),
});
const headers = [
  "nome",
  "email",
  "telefone",
  "matricula",
  "vinculo",
  "superiorMatricula",
  "equipe",
];

/** CSV UTF-8 exportado da planilha, com vírgula ou ponto e vírgula e aspas RFC 4180. */
export function lerEquipeCsv(csv: string): string[][] {
  const input = csv.replace(/^\uFEFF/, "");
  const first = input.split(/\r?\n/, 1)[0];
  const separator = first.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === separator || c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      closed = false;
      if (c !== separator) {
        if (c === "\r" && input[i + 1] === "\n") i++;
        if (row.some(v => v.trim())) rows.push(row);
        row = [];
      }
    } else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (closed || c === '"')
        throw new Error("Aspas inválidas na planilha CSV.");
      field += c;
    }
    if (rows.length > 101)
      throw new Error("Importe no máximo 100 pessoas por lote.");
  }
  if (quoted) throw new Error("Aspas não encerradas na planilha CSV.");
  row.push(field);
  if (row.some(v => v.trim())) rows.push(row);
  if (rows.length < 2 || rows.length > 101)
    throw new Error("Informe de 1 a 100 pessoas por lote.");
  if (rows[0].map(v => v.trim()).join(";") !== headers.join(";"))
    throw new Error("Cabeçalho esperado: " + headers.join(";"));
  return rows.slice(1);
}
export type PessoaExistente = {
  id: number;
  matricula: string | null;
  telefone: string | null;
  statusVinculo: string;
};
export function validarEquipeCsv(csv: string, existentes: PessoaExistente[], dominioObrigatorio?: string) {
  const rows = lerEquipeCsv(csv);
  const erros: { linha: number; campo: string; mensagem: string }[] = [];
  const linhas: { linha: number; pessoa: LinhaEquipe }[] = [];
  const matriculas = new Map<string, number>(),
    telefones = new Map<string, number>();
  rows.forEach((row, index) => {
    const linha = index + 2;
    if (row.length !== headers.length) {
      erros.push({
        linha,
        campo: "linha",
        mensagem: "Quantidade de colunas inválida.",
      });
      return;
    }
    const parsed = linhaEquipeSchema.safeParse(
      Object.fromEntries(headers.map((h, i) => [h, row[i]]))
    );
    if (!parsed.success) {
      for (const e of parsed.error.issues)
        erros.push({ linha, campo: String(e.path[0]), mensagem: e.message });
      return;
    }
    const pessoa = parsed.data;
    linhas.push({ linha, pessoa });
    if (dominioObrigatorio && !emailDoDominio(pessoa.email, dominioObrigatorio))
      erros.push({ linha, campo: "email", mensagem: mensagemDominioConvite(dominioObrigatorio) });
    for (const [campo, value, seen] of [
      ["matricula", pessoa.matricula, matriculas],
      ["telefone", pessoa.telefone.slice(1), telefones],
    ] as const) {
      if (seen.has(value)) {
        erros.push({
          linha,
          campo,
          mensagem: `Duplicado no lote (linha ${seen.get(value)}).`,
        });
        erros.push({
          linha: seen.get(value)!,
          campo,
          mensagem: `Duplicado no lote (linha ${linha}).`,
        });
      } else seen.set(value, linha);
      if (
        existentes.some(
          p =>
            (campo === "matricula"
              ? p.matricula?.trim().toUpperCase()
              : p.telefone?.replace(/\D/g, "")) === value
        )
      )
        erros.push({ linha, campo, mensagem: "Já cadastrado nesta empresa." });
    }
  });
  const byMatricula = new Map(linhas.map(l => [l.pessoa.matricula, l]));
  for (const { linha, pessoa } of linhas) {
    const superior = pessoa.superiorMatricula;
    if (
      superior &&
      !byMatricula.has(superior) &&
      !existentes.some(
        p =>
          p.matricula?.trim().toUpperCase() === superior &&
          p.statusVinculo === "ativo"
      )
    )
      erros.push({
        linha,
        campo: "superiorMatricula",
        mensagem: "Superior deve constar do lote ou estar ativo nesta empresa.",
      });
    const seen = new Set([pessoa.matricula]);
    let current = superior;
    while (current) {
      if (seen.has(current)) {
        erros.push({
          linha,
          campo: "superiorMatricula",
          mensagem: "Hierarquia não pode conter ciclos ou a própria pessoa.",
        });
        break;
      }
      seen.add(current);
      current = byMatricula.get(current)?.pessoa.superiorMatricula ?? "";
    }
  }
  return { total: rows.length, validas: linhas.length, erros, linhas };
}
