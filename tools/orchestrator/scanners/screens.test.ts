import { describe, expect, it } from "vitest";
import { parseScreens } from "./screens";

const APP = `
<Routes>
  <Route element={<Layout />}>
    <Route index element={<Home />} />
    <Route path="/login" element={<Login />} />
  </Route>
  <Route element={<RequireAuth />}>
    <Route path="/app" element={<AppShell />}>
      <Route index element={<Navigate to="/app/dashboard" replace />} />
      <Route path="despesas" element={<Despesas />} />
    </Route>
  </Route>
</Routes>
`;

describe("parseScreens", () => {
  it("extrai rotas públicas e protegidas", () => {
    const items = parseScreens(APP);
    expect(items).toEqual([
      { path: "(index)", component: "Home", protected: false },
      { path: "/login", component: "Login", protected: false },
      { path: "/app", component: "AppShell", protected: true },
      { path: "(index)", component: "Navigate", protected: true },
      { path: "despesas", component: "Despesas", protected: true },
    ]);
  });

  it("retorna vazio sem rotas", () => {
    expect(parseScreens("export const x = 1;")).toEqual([]);
  });
});
