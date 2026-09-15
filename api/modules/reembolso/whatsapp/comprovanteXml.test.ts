import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  validarComprovanteBase64,
  validarComprovanteWhatsapp,
} from "./comprovante";
import { criarRouterComprovanteWhatsapp } from "./comprovanteRouter";
import { exigirServicoAutenticado, type ServicoEnv } from "./servicoAuth";

const namespace = "http://www.portalfiscal.inf.br/nfe";
const nota = (
  corpo = "<infNFe><emit><xNome>Posto &amp; Cia</xNome></emit></infNFe>"
) => `<NFe xmlns="${namespace}">${corpo}</NFe>`;

function validarNosDoisCanais(xml: string | Buffer, esperado: boolean) {
  const conteudo = typeof xml === "string" ? Buffer.from(xml) : xml;
  for (const arquivoMime of ["application/xml", "text/xml"]) {
    const input = { arquivoNome: "nota.xml", arquivoMime, conteudo };
    expect(validarComprovanteWhatsapp(input).ok).toBe(esperado);
    expect(
      validarComprovanteBase64({
        ...input,
        arquivoBase64: conteudo.toString("base64"),
      }).ok
    ).toBe(esperado);
  }
}

describe("estrutura do XML fiscal antes de OCR/persistência", () => {
  it.each([
    nota(),
    `\uFEFF<?xml version="1.0" encoding="UTF-8"?>${nota()}`,
    `<?xml version = '1.0' encoding = 'utf-8' standalone = 'yes'?>${nota()}`,
    `<nfeProc xmlns="${namespace}"><NFe><infNFe Id="NFe123"><ide><mod>65</mod></ide></infNFe></NFe><protNFe/></nfeProc>`,
    `<n:NFe xmlns:n="${namespace}"><n:infNFe Id="NFe123"><n:ide/></n:infNFe></n:NFe>`,
    "<NFe><infNFe><emit><xNome>Legado sem namespace</xNome></emit></infNFe></NFe>",
    nota(
      "<infNFe><emit><xNome>Jo&#227;o &#x1F600; &lt; &gt; &apos; &quot;</xNome></emit></infNFe>"
    ),
  ])("aceita documento do subconjunto suportado: %s", xml => {
    validarNosDoisCanais(xml, true);
  });

  it.each([
    ["texto sem XML", "arquivo não fiscal"],
    ["prefixo solto", "<"],
    ["raiz vazia", "<NFe/>"],
    ["HTML disfarçado", "<html><NFe><infNFe/></NFe></html>"],
    ["raiz arbitrária", "<nota><infNFe/></nota>"],
    ["NFS-e ainda não suportada", "<CompNfse><Nfse/></CompNfse>"],
    ["processo sem nota", "<nfeProc><protNFe/></nfeProc>"],
    ["infNFe fora da nota", "<nfeProc><NFe/><infNFe/></nfeProc>"],
    ["fechamento ausente", "<NFe><infNFe/>"],
    ["fechamento trocado", "<NFe><infNFe></NFe></infNFe>"],
    ["duas raízes", `${nota()}${nota()}`],
    ["duas raízes vazias", "<NFe/><NFe/>"],
    ["texto depois da raiz", `${nota()}conteúdo extra`],
    ["texto antes da raiz", `conteúdo extra${nota()}`],
    ["atributo sem aspas", "<NFe><infNFe Id=NFe123/></NFe>"],
    ["atributo com menor literal", '<NFe teste="<"><infNFe/></NFe>'],
    ["atributo sem nome", "<NFe = ><infNFe/></NFe>"],
    ["namespace fiscal removido no filho", nota('<infNFe xmlns=""/>')],
    ["atributo repetido", '<NFe teste="1" teste="2"><infNFe/></NFe>'],
    [
      "atributo de namespace repetido",
      `<NFe xmlns:a="urn:x" xmlns:b="urn:x" a:z="1" b:z="2"><infNFe/></NFe>`,
    ],
    ["aspas abertas", '<NFe><infNFe Id="NFe123/></NFe>'],
    [
      "DTD externa",
      '<!DOCTYPE NFe SYSTEM "https://example.invalid/nfe.dtd">' + nota(),
    ],
    [
      "entidade externa",
      '<!DOCTYPE NFe [<!ENTITY x SYSTEM "file:///etc/passwd">]><NFe><infNFe>&x;</infNFe></NFe>',
    ],
    [
      "expansão de entidades",
      '<!DOCTYPE NFe [<!ENTITY a "123"><!ENTITY b "&a;&a;">]><NFe><infNFe>&b;</infNFe></NFe>',
    ],
    ["entidade desconhecida", nota("<infNFe>&desconhecida;</infNFe>")],
    ["entidade sem ponto e vírgula", nota("<infNFe>&amp</infNFe>")],
    ["ampersand sem escape", nota("<infNFe>A & B</infNFe>")],
    ["referência nula", nota("<infNFe>&#0;</infNFe>")],
    ["referência surrogate", nota("<infNFe>&#xD800;</infNFe>")],
    ["caractere inválido", nota("<infNFe>\u0001</infNFe>")],
    ["namespace incorreto", '<NFe xmlns="urn:outro"><infNFe/></NFe>'],
    ["prefixo não declarado", "<n:NFe><n:infNFe/></n:NFe>"],
    ["atributo com prefixo não declarado", '<NFe n:id="1"><infNFe/></NFe>'],
    ["namespace reservado", `<NFe xmlns:xml="${namespace}"><infNFe/></NFe>`],
    [
      "namespace xmlns proibido",
      '<NFe xmlns="http://www.w3.org/2000/xmlns/"><infNFe/></NFe>',
    ],
    [
      "declaração não UTF-8",
      '<?xml version="1.0" encoding="ISO-8859-1"?>' + nota(),
    ],
    ["declaração incompleta", "<?xml?>" + nota()],
    [
      "instrução de processamento",
      '<?xml-stylesheet href="https://example.invalid/x"?>' + nota(),
    ],
    ["comentário imitando nota", "<NFe><!-- <infNFe/> --></NFe>"],
    ["CDATA imitando nota", "<NFe><![CDATA[<infNFe/>]]></NFe>"],
    ["comentário quebrado", nota() + "<!-- sem fechamento"],
    ["fechamento CDATA solto", nota("<infNFe>]]></infNFe>")],
    [
      "segunda nota no mesmo processo",
      "<nfeProc><NFe><infNFe/></NFe><NFe><infNFe/></NFe></nfeProc>",
    ],
    ["infNFe duplicado", nota("<infNFe/><infNFe/>")],
    [
      "aninhamento excessivo",
      nota("<infNFe>" + "<x>".repeat(65) + "</x>".repeat(65) + "</infNFe>"),
    ],
  ])("recusa %s nos dois canais e nos dois MIME", (_caso, xml) => {
    validarNosDoisCanais(xml, false);
  });

  it("recusa bytes UTF-8 inválidos e UTF-16 antes do parser", () => {
    validarNosDoisCanais(
      Buffer.concat([
        Buffer.from("<NFe><infNFe>"),
        Buffer.from([0xc3, 0x28]),
        Buffer.from("</infNFe></NFe>"),
      ]),
      false
    );
    validarNosDoisCanais(Buffer.from(nota(), "utf16le"), false);
  });

  it("limita a quantidade de elementos de um XML abaixo de 10 MB", () => {
    validarNosDoisCanais(
      nota("<infNFe>" + "<x/>".repeat(100_001) + "</infNFe>"),
      false
    );
  });

  it("não chama estrutura válida de consulta, assinatura ou autenticidade comprovada", () => {
    const conteudo = Buffer.from(nota());
    const resultado = validarComprovanteWhatsapp({
      arquivoNome: "nota.xml",
      arquivoMime: "application/xml",
      conteudo,
    });
    expect(resultado).toEqual({
      ok: true,
      comprovante: {
        arquivoNome: "nota.xml",
        arquivoMime: "application/xml",
        conteudo,
      },
    });
  });

  it.each([
    [nota(), 201],
    ["<NFe><infNFe>", 400],
    ['<!DOCTYPE NFe SYSTEM "file:///etc/passwd">' + nota(), 400],
  ] as const)(
    "rota multipart trata o XML antes de chamar a persistência: %s",
    async (xml, status) => {
      const receber = vi.fn().mockResolvedValue({ despesaId: 42 });
      const app = new Hono<ServicoEnv>();
      const token = "fixture-xml-aaaaaaaaaaaaaaaaaaaaaaaa";
      app.use(
        "/*",
        exigirServicoAutenticado(JSON.stringify([{ token, empresaId: 1 }]))
      );
      app.route("/", criarRouterComprovanteWhatsapp(receber));
      const form = new FormData();
      form.set("colaborador_id", "2");
      form.set("mensagem_id", "fixture-xml");
      form.set(
        "arquivo",
        new File([xml], "nota.xml", { type: "application/xml" })
      );
      const resposta = await app.request("http://local/despesas", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      expect(resposta.status).toBe(status);
      expect(receber).toHaveBeenCalledTimes(status === 201 ? 1 : 0);
    }
  );
});
