import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEvolutionProvider,
  parseEvolutionPayload,
  telefoneDoJid,
} from "./evolution";

/** Payload real do Evolution v2 (event messages.upsert). */
function payloadTexto(texto: string, overrides: Record<string, unknown> = {}) {
  return {
    event: "messages.upsert",
    instance: "reembolsa",
    data: {
      key: {
        remoteJid: "5511998887777@s.whatsapp.net",
        fromMe: false,
        id: "ABCD1234",
      },
      pushName: "João Silva",
      message: { conversation: texto },
      ...overrides,
    },
  };
}

describe("parseEvolutionPayload", () => {
  it("extrai texto simples (conversation) com telefone e nome", () => {
    const msg = parseEvolutionPayload(payloadTexto("oi"));
    expect(msg).toEqual({
      telefone: "5511998887777",
      texto: "oi",
      tipo: "texto",
      mensagemId: "ABCD1234",
      nomeContato: "João Silva",
    });
  });

  it("extrai texto de extendedTextMessage", () => {
    const msg = parseEvolutionPayload(
      payloadTexto("", {
        message: { extendedTextMessage: { text: "  sim  " } },
      }),
    );
    expect(msg?.texto).toBe("sim");
    expect(msg?.tipo).toBe("texto");
  });

  it("classifica imagem e usa caption como texto", () => {
    const msg = parseEvolutionPayload(
      payloadTexto("", {
        message: { imageMessage: { caption: "cupom do almoço" } },
      }),
    );
    expect(msg?.tipo).toBe("imagem");
    expect(msg?.texto).toBe("cupom do almoço");
  });

  it("ignora mensagens enviadas por nós (fromMe)", () => {
    const p = payloadTexto("resposta nossa");
    (p.data.key as Record<string, unknown>).fromMe = true;
    expect(parseEvolutionPayload(p)).toBeNull();
  });

  it("ignora grupos, broadcast e canais", () => {
    for (const jid of ["123@g.us", "status@broadcast", "123@newsletter"]) {
      const p = payloadTexto("oi");
      (p.data.key as Record<string, unknown>).remoteJid = jid;
      expect(parseEvolutionPayload(p)).toBeNull();
    }
  });

  it("ignora eventos que não são messages.upsert", () => {
    const p = payloadTexto("oi");
    p.event = "connection.update";
    expect(parseEvolutionPayload(p)).toBeNull();
  });

  it("tolera payload malformado", () => {
    expect(parseEvolutionPayload(null)).toBeNull();
    expect(parseEvolutionPayload({})).toBeNull();
    expect(parseEvolutionPayload({ event: "messages.upsert" })).toBeNull();
  });
});

describe("telefoneDoJid", () => {
  it("remove sufixo e não-dígitos", () => {
    expect(telefoneDoJid("5511998887777@s.whatsapp.net")).toBe("5511998887777");
    expect(telefoneDoJid("")).toBe("");
    expect(telefoneDoJid(undefined)).toBe("");
  });
});

describe("createEvolutionProvider.sendText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("chama a API do Evolution com URL, apikey e payload corretos", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createEvolutionProvider({
      apiUrl: "http://localhost:8080/",
      apiKey: "segredo",
      instance: "reembolsa",
    });
    await provider.sendText("5511998887777", "Olá!");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/message/sendText/reembolsa",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: "segredo" },
        body: JSON.stringify({ number: "5511998887777", text: "Olá!" }),
      },
    );
  });

  it("lança erro com status quando a API falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("unauthorized"),
      }),
    );
    const provider = createEvolutionProvider({
      apiUrl: "http://localhost:8080",
      apiKey: "errada",
      instance: "x",
    });
    await expect(provider.sendText("1", "x")).rejects.toThrow("401");
  });
});
