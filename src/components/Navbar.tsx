import { useEffect, useState } from "react"
import { Link } from "react-router"
import { AnimatePresence, motion } from "framer-motion"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#tributos", label: "Tributos" },
  { href: "#matriz", label: "Matriz de elegibilidade" },
  { href: "#seguranca", label: "Segurança" },
  { href: "#faq", label: "FAQ" },
]

/** Landing navbar — dark, fixed 72px, backdrop-blur over ink-950/80 on scroll. */
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  return (
    <motion.header
      initial={{ y: -72, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 h-[72px] border-b transition-colors duration-300",
        scrolled ? "border-line-dark bg-ink-950/85 backdrop-blur-md" : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
        <Link to="/" aria-label="reembolsa.ia — início" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <img src="/logo.svg" alt="reembolsa.ia" className="h-7 w-auto" />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Navegação principal">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-text-dark-400 transition-colors hover:text-text-dark-100"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {/* AUTH-SLOT: rewired to useAuth() in Phase 5 */}
          <Link
            to="/login"
            className="inline-flex h-10 items-center rounded-[10px] border border-line-dark px-4 text-sm font-semibold text-text-dark-100 transition-colors hover:border-brand-400/50 hover:text-brand-400"
          >
            Entrar
          </Link>
          <Link
            id="navbar-cta"
            to="/cadastro"
            className="inline-flex h-10 items-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
          >
            Criar conta
          </Link>
        </div>

        <button
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen(!open)}
          className="flex h-10 w-10 items-center justify-center rounded-[10px] text-text-dark-100 lg:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 top-[72px] z-40 flex flex-col bg-ink-950 px-6 pb-8 pt-6 lg:hidden"
          >
            <nav className="flex flex-col gap-1" aria-label="Menu móvel">
              {LINKS.map((link, i) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.06 * i, duration: 0.3, ease: "easeOut" }}
                  className="border-b border-line-dark py-4 font-display text-2xl font-medium text-text-dark-100"
                >
                  {link.label}
                </motion.a>
              ))}
            </nav>
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.06 * LINKS.length, duration: 0.3, ease: "easeOut" }}
              className="mt-auto flex flex-col gap-3 pt-8"
            >
              {/* AUTH-SLOT: rewired to useAuth() in Phase 5 */}
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="inline-flex h-12 items-center justify-center rounded-[10px] border border-line-dark text-sm font-semibold text-text-dark-100"
              >
                Entrar
              </Link>
              <Link
                to="/cadastro"
                onClick={() => setOpen(false)}
                className="inline-flex h-12 items-center justify-center rounded-[10px] bg-brand-500 text-sm font-semibold text-white"
              >
                Criar conta
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
