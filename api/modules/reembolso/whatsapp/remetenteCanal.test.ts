import { describe, expect, it, vi } from "vitest";
import { remetentePermitido, resolverRemetenteCanal, variantesTelefoneCanal } from "./remetenteCanal";
const atual = "5581998765432", legado = "558198765432";
const pessoa = { empresaId: 1, colaboradorId: 3, situacao: "ativo" };
describe("identidade recebida do canal", () => {
  it("reconhece os formatos BR com e sem nono dígito preservando DDD e país", async () => {
    const resolver = vi.fn(async (phone: string) => phone === atual ? [pessoa] : []);
    expect(remetentePermitido(legado, new Set([atual]))).toBe(true);
    expect(await resolverRemetenteCanal(legado, new Set([atual]), resolver)).toEqual({ ...pessoa, telefoneCadastro: atual });
    expect(resolver).toHaveBeenCalledWith(legado); expect(resolver).toHaveBeenCalledWith(atual);
  });
  it("colisão entre duas pessoas ou empresas impede associação", async () => {
    const resolver = async (p: string) => p === atual ? [pessoa] : [{ ...pessoa, colaboradorId: 8 }];
    expect(await resolverRemetenteCanal(legado, new Set([atual]), resolver)).toBeNull();
    expect(await resolverRemetenteCanal(legado, new Set([atual]), async () => [pessoa, { ...pessoa, empresaId: 2 }])).toBeNull();
  });
  it("não faz busca por sufixo, outro país, telefone fixo ou entrada com sinal", () => {
    expect(variantesTelefoneCanal("558133334444")).toEqual(["558133334444"]);
    expect(variantesTelefoneCanal("14155552671")).toEqual(["14155552671"]);
    expect(variantesTelefoneCanal("+" + atual)).toEqual([]);
    expect(remetentePermitido("552198765432", new Set([atual]))).toBe(false);
  });
  it("remetente fora da lista e vínculo suspenso não são resolvidos", async () => {
    const resolver = vi.fn(async () => [pessoa]);
    expect(await resolverRemetenteCanal(legado, new Set(), resolver)).toBeNull(); expect(resolver).not.toHaveBeenCalled();
    expect(await resolverRemetenteCanal(legado, new Set([atual]), async () => [{ ...pessoa, situacao: "suspenso" }])).toBeNull();
  });
});
