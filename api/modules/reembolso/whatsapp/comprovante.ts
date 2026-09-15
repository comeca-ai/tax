import { XMLParser, XMLValidator } from "fast-xml-parser";

/** Limite alinhado ao upload existente do painel; o webhook nunca recebe mídia sem limite. */
export const LIMITE_COMPROVANTE_BYTES = 10 * 1024 * 1024;

const MIMES_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/xml",
  "text/xml",
]);

export type ComprovanteValidado = {
  arquivoNome: string;
  arquivoMime:
    | "application/pdf"
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "application/xml"
    | "text/xml";
  conteudo: Buffer;
};

function temPrefixo(conteudo: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, indice) => conteudo[indice] === byte);
}

const NAMESPACE_NFE = "http://www.portalfiscal.inf.br/nfe";
const NAMESPACE_XML = "http://www.w3.org/XML/1998/namespace";
const NAMESPACE_XMLNS = "http://www.w3.org/2000/xmlns/";
const NOME_XML = "[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?";
const TAG_ABERTURA = new RegExp(
  `^<${NOME_XML}(?:[ \\t\\r\\n]+${NOME_XML}[ \\t\\r\\n]*=[ \\t\\r\\n]*(?:"[^"<]*"|'[^'<]*'))*[ \\t\\r\\n]*/?>$`
);
const TAG_FECHAMENTO = new RegExp(`^</${NOME_XML}[ \\t\\r\\n]*>$`);

function caractereXmlPermitido(codigo: number): boolean {
  return (
    codigo === 9 ||
    codigo === 10 ||
    codigo === 13 ||
    (codigo >= 0x20 && codigo <= 0xd7ff) ||
    (codigo >= 0xe000 && codigo <= 0xfffd) ||
    (codigo >= 0x10000 && codigo <= 0x10ffff)
  );
}

/**
 * Subconjunto de entrada fiscal: UTF-8, NFe/nfeProc, com infNFe direto.
 * Aceita namespace NF-e ou XML legado sem namespace. NFS-e XML, DTD,
 * comentários, CDATA e instruções de processamento não são suportados.
 * Não valida XSD, assinatura digital, conteúdo tributário ou situação SEFAZ.
 */
function xmlFiscalEstruturado(conteudo: Buffer): boolean {
  try {
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(conteudo);
    for (const [referencia, entidade] of xml.matchAll(/&([^;\s<&]*);?/g)) {
      if (!referencia.endsWith(";")) return false;
      if (["amp", "lt", "gt", "apos", "quot"].includes(entidade)) continue;
      if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entidade)) return false;
      const codigo = entidade.startsWith("#x")
        ? parseInt(entidade.slice(2), 16)
        : Number(entidade.slice(1));
      if (!caractereXmlPermitido(codigo)) return false;
    }
    for (const caractere of xml)
      if (!caractereXmlPermitido(caractere.codePointAt(0)!)) return false;

    // Recusa declarações antes do parser: nenhuma resolução/expansão de entidades.
    // Comentários/CDATA também poderiam enganar o extrator heurístico posterior.
    const corpo = xml.replace(
      /^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"1\.0"|'1\.0')(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"UTF-8"|'UTF-8'|"utf-8"|'utf-8'))?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\r\n]*\?>/,
      ""
    );
    if (corpo.includes("<!") || corpo.includes("<?") || corpo.includes("]]>"))
      return false;

    // XMLValidator é complementado com gramática estrita de atributos e limites:
    // sozinho ele aceita, por exemplo, atributo com '<' literal ou '=' sem nome.
    const tokens = /<(?:[^<>"']|"[^"<]*"|'[^'<]*')*>|[^<]+/gy;
    let fim = 0;
    let profundidade = 0;
    let elementos = 0;
    for (const token of corpo.matchAll(tokens)) {
      if (token.index !== fim) return false;
      fim += token[0].length;
      if (token[0].startsWith("</")) {
        if (!TAG_FECHAMENTO.test(token[0])) return false;
        profundidade--;
      } else if (token[0].startsWith("<")) {
        if (!TAG_ABERTURA.test(token[0]) || ++elementos > 100_000) return false;
        if (++profundidade > 64) return false;
        if (token[0].endsWith("/>")) profundidade--;
      } else if (profundidade === 0 && !/^[ \t\r\n]*$/.test(token[0]))
        return false;
    }
    if (fim !== corpo.length || XMLValidator.validate(xml) !== true)
      return false;

    const parser = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      processEntities: false,
      ignoreDeclaration: true,
      parseTagValue: false,
      parseAttributeValue: false,
      maxNestedTags: 64,
    });
    type NoXml = { [nome: string]: NoXml[] | Record<string, string> | string };
    const arvore: NoXml[] = parser.parse(xml);
    const raizes = arvore.filter(no => !Object.hasOwn(no, "#text"));
    if (raizes.length !== 1) return false;
    let notas = 0;
    let informacoes = 0;
    let namespaceFiscal = "";
    function visitar(
      no: NoXml,
      namespaces: Map<string, string>,
      caminho: string[]
    ): boolean {
      const nome = Object.keys(no).find(
        chave => chave !== ":@" && chave !== "#text"
      );
      if (!nome) return true;
      const atributos = (no[":@"] ?? {}) as Record<string, string>;
      const ns = new Map(namespaces);
      for (const [chave, valor] of Object.entries(atributos)) {
        const atributo = chave.slice(2);
        if (atributo !== "xmlns" && !atributo.startsWith("xmlns:")) continue;
        const prefixo = atributo === "xmlns" ? "" : atributo.slice(6);
        if (
          valor.includes("&") ||
          prefixo === "xmlns" ||
          valor === NAMESPACE_XMLNS ||
          (prefixo !== "" && !valor) ||
          (prefixo === "xml") !== (valor === NAMESPACE_XML)
        )
          return false;
        ns.set(prefixo, valor);
      }
      const nomesExpandidos = new Set<string>();
      for (const chave of Object.keys(atributos)) {
        const atributo = chave.slice(2);
        if (atributo === "xmlns" || atributo.startsWith("xmlns:")) continue;
        const partes = atributo.split(":");
        if (partes.length === 2 && !ns.get(partes[0])) return false;
        const expandido = `${partes.length === 2 ? ns.get(partes[0]) : ""}|${partes.at(-1)}`;
        if (nomesExpandidos.has(expandido)) return false;
        nomesExpandidos.add(expandido);
      }
      const partes = nome.split(":");
      const local = partes.at(-1)!;
      const uri = ns.get(partes.length === 2 ? partes[0] : "");
      if (partes.length === 2 && !uri) return false;
      if (caminho.length === 0 && !["NFe", "nfeProc"].includes(local))
        return false;
      if (caminho.length === 0) namespaceFiscal = uri ?? "";
      if (["NFe", "nfeProc", "infNFe"].includes(local)) {
        if ((uri && uri !== NAMESPACE_NFE) || (uri ?? "") !== namespaceFiscal)
          return false;
        if (local === "nfeProc" && caminho.length !== 0) return false;
        if (
          local === "NFe" &&
          (++notas !== 1 ||
            (caminho.length !== 0 && caminho.join("/") !== "nfeProc"))
        )
          return false;
        if (
          local === "infNFe" &&
          (++informacoes !== 1 ||
            !["NFe", "nfeProc/NFe"].includes(caminho.join("/")))
        )
          return false;
      }
      return (no[nome] as NoXml[]).every(filho =>
        visitar(filho, ns, [...caminho, local])
      );
    }
    return (
      visitar(raizes[0], new Map([["xml", NAMESPACE_XML]]), []) &&
      notas === 1 &&
      informacoes === 1
    );
  } catch {
    // Nenhum conteúdo/erro do parser (que pode conter dados fiscais) vai à resposta.
    return false;
  }
}

function mimeConfereComAssinatura(mime: string, conteudo: Buffer): boolean {
  if (mime === "application/pdf")
    return temPrefixo(conteudo, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (mime === "image/jpeg") return temPrefixo(conteudo, [0xff, 0xd8, 0xff]);
  if (mime === "image/png")
    return temPrefixo(
      conteudo,
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    );
  if (mime === "application/xml" || mime === "text/xml") {
    return xmlFiscalEstruturado(conteudo);
  }
  return (
    temPrefixo(conteudo, [0x52, 0x49, 0x46, 0x46]) &&
    conteudo.length >= 12 &&
    conteudo.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

/** Base64 canônico evita que dados inválidos cheguem ao OCR como buffer vazio. */
export function decodificarComprovanteBase64(base64: string): Buffer | null {
  // Limita antes de qualquer decode; regex com grupos repetidos estourava a
  // pilha em arquivos grandes. O round-trip também confere padding canônico.
  if (
    base64.length > Math.ceil(LIMITE_COMPROVANTE_BYTES / 3) * 4 ||
    base64.length % 4 !== 0
  )
    return null;
  const conteudo = Buffer.from(base64, "base64");
  return conteudo.length <= LIMITE_COMPROVANTE_BYTES &&
    conteudo.toString("base64") === base64
    ? conteudo
    : null;
}

function nomeSeguro(nome: string): string | null {
  const limpo = nome.trim();
  const contemCaractereDeControle = [...limpo].some(
    caractere => caractere.charCodeAt(0) < 0x20
  );
  if (
    !limpo ||
    limpo.length > 255 ||
    contemCaractereDeControle ||
    /[\\/]/.test(limpo)
  )
    return null;
  return limpo;
}

/**
 * Valida o arquivo antes de OCR ou persistência. O MIME vindo do provider é
 * tratado como dado não confiável e precisa coincidir com a assinatura binária.
 */
export function validarComprovanteWhatsapp(input: {
  arquivoNome: string;
  arquivoMime: string;
  conteudo: Buffer;
}):
  { ok: true; comprovante: ComprovanteValidado } | { ok: false; erro: string } {
  const nome = nomeSeguro(input.arquivoNome);
  if (!nome) return { ok: false, erro: "Nome de arquivo inválido." };
  if (!MIMES_PERMITIDOS.has(input.arquivoMime)) {
    return { ok: false, erro: "Envie um PDF, JPG, PNG, WEBP ou XML de NF-e." };
  }
  if (
    input.conteudo.length === 0 ||
    input.conteudo.length > LIMITE_COMPROVANTE_BYTES
  ) {
    return { ok: false, erro: "O comprovante deve ter até 10 MB." };
  }
  if (!mimeConfereComAssinatura(input.arquivoMime, input.conteudo)) {
    return {
      ok: false,
      erro:
        input.arquivoMime === "application/xml" ||
        input.arquivoMime === "text/xml"
          ? "XML de NF-e inválido ou não suportado. Envie NFe ou nfeProc em UTF-8, sem DTD, comentários ou CDATA."
          : "O conteúdo não corresponde ao tipo de arquivo informado.",
    };
  }

  return {
    ok: true,
    comprovante: {
      arquivoNome: nome,
      arquivoMime: input.arquivoMime as ComprovanteValidado["arquivoMime"],
      conteudo: input.conteudo,
    },
  };
}

/** Validação comum aos recebimentos web e WhatsApp, antes de OCR/persistência. */
export function validarComprovanteBase64(input: {
  arquivoNome: string;
  arquivoMime: string;
  arquivoBase64: string;
}):
  { ok: true; comprovante: ComprovanteValidado } | { ok: false; erro: string } {
  const conteudo = decodificarComprovanteBase64(input.arquivoBase64);
  if (!conteudo)
    return { ok: false, erro: "O conteúdo do arquivo é inválido." };
  return validarComprovanteWhatsapp({ ...input, conteudo });
}
