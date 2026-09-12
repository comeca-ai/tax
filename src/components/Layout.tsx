import { Outlet } from "react-router"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

/**
 * Landing layout: fixed dark Navbar (overlays the full-bleed hero, so no top
 * offset here — the hero owns its own centering) + <Outlet/> + dark Footer.
 */
export default function Layout() {
  return (
    <div className="min-h-[100dvh] bg-ink-950 text-text-dark-100">
      <Navbar />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
