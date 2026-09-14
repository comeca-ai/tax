import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createDialog360Transport, mediaProxyUrl } from "./dialog360Transport";
describe("transporte 360dialog", () => {
  it("não envia credencial para URL arbitrária/redirecionamento", () => {
    for (const url of [
      "http://lookaside.fbsbx.com/whatsapp_business/attachments/",
      "https://evil.test/whatsapp_business/attachments/",
      "https://lookaside.fbsbx.com.evil.test/whatsapp_business/attachments/",
      "https://lookaside.fbsbx.com:8443/whatsapp_business/attachments/",
      "https://lookaside.fbsbx.com/other",
    ])
      expect(() => mediaProxyUrl(url)).toThrow();
    expect(
      mediaProxyUrl(
        "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1"
      )
    ).toBe("https://waba-v2.360dialog.io/whatsapp_business/attachments/?mid=1");
  });
  it("envio usa host fixo e valida aceitação", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }))
      );
    expect(
      await createDialog360Transport("dummy", fetchFn).sendText(
        "5511999999999",
        "Recebido"
      )
    ).toBe("wamid.out");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://waba-v2.360dialog.io/messages",
      expect.objectContaining({
        redirect: "error",
        headers: {
          "D360-API-KEY": "dummy",
          "Content-Type": "application/json",
        },
      })
    );
  });
  it("mídia verifica hash, tamanho e assinatura sem rede real", async () => {
    const content = Buffer.from("%PDF-test");
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1",
            mime_type: "application/pdf",
            file_size: content.length,
            sha256: createHash("sha256").update(content).digest("hex"),
          })
        )
      )
      .mockResolvedValueOnce(new Response(content));
    expect(
      (await createDialog360Transport("dummy", fetchFn).downloadMedia("123"))
        .conteudo
    ).toEqual(content);
    expect(fetchFn.mock.calls[1]?.[0]).toBe(
      "https://waba-v2.360dialog.io/whatsapp_business/attachments/?mid=1"
    );
  });
});
