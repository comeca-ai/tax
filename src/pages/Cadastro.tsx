import { Link } from "react-router"

/** Placeholder — replaced by the real signup wizard in the backend/auth phase. */
export default function Cadastro() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-ink-950 px-6 text-center">
      <Link to="/">
        <img src="/logo.svg" alt="reembolsa.ia" className="h-8 w-auto" />
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-text-dark-100">Criar conta</h1>
        <p className="max-w-sm text-sm leading-relaxed text-text-dark-400">
          O cadastro (conta → empresa → confirmação) será ativado na próxima fase.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          to="/login"
          className="inline-flex h-11 items-center rounded-[10px] border border-line-dark px-5 text-sm font-semibold text-text-dark-100 transition hover:border-brand-400/60"
        >
          Já tenho conta
        </Link>
        <Link
          to="/"
          className="inline-flex h-11 items-center rounded-[10px] bg-brand-500 px-5 text-sm font-semibold text-white transition hover:bg-brand-500/90"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
