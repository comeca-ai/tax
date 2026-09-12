import { Link } from "react-router"

const PRODUCT_LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#tributos", label: "Tributos" },
  { href: "#matriz", label: "Matriz de elegibilidade" },
  { href: "#seguranca", label: "Segurança" },
  { href: "#faq", label: "FAQ" },
]

const LEGAL_LINKS = ["Termos de uso", "Privacidade (LGPD)", "Aviso jurídico"]

/** Dark landing footer: 4 columns + mono bottom bar. */
export default function Footer() {
  return (
    <footer className="border-t border-line-dark bg-ink-950">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-16 md:grid-cols-4">
        <div className="flex flex-col gap-4">
          <img src="/logo.svg" alt="reembolsa.ia" className="h-7 w-auto self-start" />
          <p className="max-w-[240px] text-sm leading-relaxed text-text-dark-400">
            Motor de recuperação tributária para pequenas empresas.
          </p>
          <img src="/logo-mark.svg" alt="" className="h-6 w-6 opacity-60" />
        </div>
        <nav aria-label="Produto" className="flex flex-col gap-3">
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-dark-400">Produto</span>
          {PRODUCT_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="w-fit text-sm text-text-dark-400 underline-offset-4 transition-colors hover:text-text-dark-100 hover:underline"
            >
              {link.label}
            </a>
          ))}
          <Link
            to="/tese"
            className="w-fit text-sm text-text-dark-400 underline-offset-4 transition-colors hover:text-text-dark-100 hover:underline"
          >
            A Tese
          </Link>
        </nav>
        <nav aria-label="Conta" className="flex flex-col gap-3">
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-dark-400">Conta</span>
          <Link to="/login" className="w-fit text-sm text-text-dark-400 underline-offset-4 transition-colors hover:text-text-dark-100 hover:underline">
            Entrar
          </Link>
          <Link to="/cadastro" className="w-fit text-sm text-text-dark-400 underline-offset-4 transition-colors hover:text-text-dark-100 hover:underline">
            Criar conta
          </Link>
        </nav>
        <nav aria-label="Legal" className="flex flex-col gap-3">
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-dark-400">Legal</span>
          {LEGAL_LINKS.map((label) => (
            <span key={label} className="w-fit cursor-pointer text-sm text-text-dark-400 underline-offset-4 transition-colors hover:text-text-dark-100 hover:underline">
              {label}
            </span>
          ))}
        </nav>
      </div>
      <div className="border-t border-line-dark">
        <p className="mx-auto max-w-[1200px] px-6 py-5 font-mono text-[11px] tracking-[0.02em] text-text-dark-400">
          © 2025 reembolsa.ia · não é aconselhamento jurídico · regras com base legal versionada até 2033
        </p>
      </div>
    </footer>
  )
}
