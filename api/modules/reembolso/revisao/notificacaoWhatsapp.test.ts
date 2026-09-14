import { describe, expect, it } from "vitest";
import { instanteUltimaMensagem } from "./notificacaoWhatsapp";

describe("janela da notificação de revisão", () => {
  it("usa o timestamp da mensagem exata e não o horário de processamento", () => {
    const data = instanteUltimaMensagem({ messages: [{ id: "outra", timestamp: "1900000000" }, { id: "alvo", timestamp: "1789300000" }] }, "alvo");
    expect(data.getTime()).toBe(1789300000000);
  });
  it.each([null, {}, { messages: [] }, { messages: [{ id: "alvo", timestamp: "invalido" }] }, { messages: [{ id: "alvo", timestamp: "-1" }] }, { messages: [{ id: "alvo", timestamp: "Infinity" }] }])("ausência de evidência expira a janela", payload => {
    expect(instanteUltimaMensagem(payload, "alvo").getTime()).toBe(0);
  });
});
