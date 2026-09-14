import { afterEach, expect, it, vi } from "vitest"
import { getActiveCompanyId, parseCompanyId, selectCompany, subscribeCompany } from "./activeCompanyStore"

afterEach(() => vi.unstubAllGlobals())

it("valida identificadores persistidos", () => {
  for (const value of [null, "", " ", "0", "-1", "1.2", "NaN", "9007199254740992"]) expect(parseCompanyId(value)).toBeNull()
  expect(parseCompanyId("12")).toBe(12)
})

it("avisa simultaneamente shell e página ao trocar a empresa e remove assinaturas", () => {
  const target = new EventTarget()
  const values = new Map<string, string>()
  vi.stubGlobal("window", Object.assign(target, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } }))
  const shell = vi.fn(), pagina = vi.fn()
  const unsubShell = subscribeCompany(shell), unsubPagina = subscribeCompany(pagina)
  selectCompany(4)
  expect(getActiveCompanyId()).toBe(4)
  expect(shell).toHaveBeenCalledTimes(1)
  expect(pagina).toHaveBeenCalledTimes(1)
  selectCompany(-1)
  expect(getActiveCompanyId()).toBe(4)
  unsubShell(); unsubPagina()
  selectCompany(5)
  expect(pagina).toHaveBeenCalledTimes(1)
})
