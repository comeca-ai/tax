import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import QueryError from "./QueryError"

it("erro de consulta não é apresentado como fila vazia nem indicador zero", () => {
  const html = renderToStaticMarkup(<QueryError titulo="Fila indisponível" onRetry={() => {}} />)
  expect(html).toContain('role="alert"')
  expect(html).toContain("Nenhum resultado está confirmado")
  expect(html).toContain("Tentar novamente")
  expect(html).not.toContain("Fila vazia")
})
