import { useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Lenis from "lenis"
import Hero from "@/components/landing/Hero"
import SocialProof from "@/components/landing/SocialProof"
import ComoFunciona from "@/components/landing/ComoFunciona"
import Tributos from "@/components/landing/Tributos"
import Matriz from "@/components/landing/Matriz"
import DashboardPreview from "@/components/landing/DashboardPreview"
import Seguranca from "@/components/landing/Seguranca"
import CtaBand from "@/components/landing/CtaBand"
import Faq from "@/components/landing/Faq"

gsap.registerPlugin(ScrollTrigger)

function DividerGlow() {
  return <div className="divider-glow mx-auto h-px max-w-[1200px]" aria-hidden />
}

export default function Home() {
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true })
    lenis.on("scroll", ScrollTrigger.update)
    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    // Route anchor clicks through Lenis for smooth scrolling
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]')
      if (!anchor) return
      const hash = anchor.getAttribute("href")
      if (!hash || hash === "#") return
      const target = document.querySelector(hash)
      if (!target) return
      event.preventDefault()
      lenis.scrollTo(target as HTMLElement, { offset: -72 })
    }
    document.addEventListener("click", onClick)

    return () => {
      document.removeEventListener("click", onClick)
      gsap.ticker.remove(raf)
      lenis.destroy()
    }
  }, [])

  return (
    <>
      <Hero />
      <SocialProof />
      <ComoFunciona />
      <DividerGlow />
      <Tributos />
      <DividerGlow />
      <Matriz />
      <DividerGlow />
      <DashboardPreview />
      <DividerGlow />
      <Seguranca />
      <CtaBand />
      <Faq />
    </>
  )
}
