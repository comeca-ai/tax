import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"
import PoliticaUploadStep from "./PoliticaUploadStep"

vi.mock("react-dropzone", () => ({ useDropzone: () => ({ getRootProps: (p: unknown) => p, getInputProps: () => ({}), isDragActive: false, open: vi.fn() }) }))

it("arquivo selecionado não é apresentado como documento analisado", () => {
  const analisar = vi.fn()
  const html = renderToStaticMarkup(<PoliticaUploadStep item={{ nome: "politica.pdf", tamanho: 100, status: "pronto" }} onArquivo={() => {}} onAnalisar={analisar} onRemover={() => {}} processando={false} />)
  expect(html).toContain("Pronto para analisar")
  expect(html).not.toContain("Concluído")
  expect(analisar).not.toHaveBeenCalled()
})

it("falha de extração permanece falha e permite nova tentativa", () => {
  const html = renderToStaticMarkup(<PoliticaUploadStep item={{ nome: "politica.pdf", tamanho: 100, status: "falha", erro: "Não foi possível extrair" }} onArquivo={() => {}} onAnalisar={() => {}} onRemover={() => {}} processando={false} />)
  expect(html).toContain("Falha na leitura")
  expect(html).toContain("Não foi possível extrair")
  expect(html).not.toContain("Concluído")
})
