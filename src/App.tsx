import { Navigate, Route, Routes } from "react-router"
import { Toaster } from "@/components/ui/sonner"
import Layout from "@/components/Layout"
import AppShell from "@/components/app/AppShell"
import RequireAuth from "@/components/app/RequireAuth"
import Home from "@/pages/Home"
import Tese from "@/pages/Tese"
import Login from "@/pages/Login"
import Cadastro from "@/pages/Cadastro"
import Convite from "@/pages/Convite"
import Dashboard from "@/pages/app/Dashboard"
import Despesas from "@/pages/app/Despesas"
import NovaDespesa from "@/pages/app/NovaDespesa"
import EnvioRapido from "@/pages/app/EnvioRapido"
import Equipe from "@/pages/app/Equipe"
import Politica from "@/pages/app/Politica"
import Revisao from "@/pages/app/Revisao"
import Veiculos from "@/pages/app/Veiculos"
import Empresas from "@/pages/app/Empresas"
import Relatorios from "@/pages/app/Relatorios"
import Regras from "@/pages/app/Regras"

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/tese" element={<Tese />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/convite/:token" element={<Convite />} />
        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="despesas" element={<Despesas />} />
            <Route path="despesas/nova" element={<NovaDespesa />} />
            <Route path="rapido" element={<EnvioRapido />} />
            <Route path="equipe" element={<Equipe />} />
            <Route path="politica" element={<Politica />} />
            <Route path="revisao" element={<Revisao />} />
            <Route path="veiculos" element={<Veiculos />} />
            <Route path="empresas" element={<Empresas />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="regras" element={<Regras />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </>
  )
}
