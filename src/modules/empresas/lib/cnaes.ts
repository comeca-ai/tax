/**
 * Subconjunto da tabela CNAE 2.3 (CONCLA/IBGE) com as atividades mais comuns
 * entre pequenas empresas usuárias do motor de créditos.
 * Código no formato curto (ex.: "49.30-2").
 */
export type Cnae = {
  codigo: string
  descricao: string
}

export const CNAES: Cnae[] = [
  { codigo: "49.30-2", descricao: "Transporte rodoviário de carga, exceto produtos perigosos e mudanças, municipal" },
  { codigo: "49.21-1", descricao: "Transporte ferroviário de carga" },
  { codigo: "47.31-8", descricao: "Comércio varejista de combustíveis para veículos automotores" },
  { codigo: "46.81-8", descricao: "Comércio atacadista especializado em equipamentos e suprimentos de informática" },
  { codigo: "41.20-4", descricao: "Construção de edifícios" },
  { codigo: "42.11-1", descricao: "Construção de rodovias e ferrovias" },
  { codigo: "43.30-4", descricao: "Obras de acabamento" },
  { codigo: "33.12-1", descricao: "Manutenção e reparação de máquinas e equipamentos mecânicos" },
  { codigo: "69.11-7", descricao: "Atividades jurídicas, exceto cartórios" },
  { codigo: "69.20-6", descricao: "Atividades de contabilidade" },
  { codigo: "80.11-1", descricao: "Atividades de vigilância e segurança privada" },
  { codigo: "86.21-6", descricao: "Atividade médica ambulatorial com recursos para realização de procedimentos cirúrgicos" },
  { codigo: "62.01-5", descricao: "Desenvolvimento de programas de computador sob encomenda" },
  { codigo: "62.02-3", descricao: "Desenvolvimento e licenciamento de programas de computador customizáveis" },
  { codigo: "62.09-1", descricao: "Suporte técnico, manutenção e outros serviços em tecnologia da informação" },
  { codigo: "73.11-4", descricao: "Agências de publicidade" },
  { codigo: "73.20-1", descricao: "Pesquisas de mercado e de opinião pública" },
  { codigo: "70.20-4", descricao: "Atividades de consultoria em gestão empresarial, exceto consultoria técnica específica" },
  { codigo: "85.99-6", descricao: "Atividades de ensino, não especificadas anteriormente" },
  { codigo: "56.11-2", descricao: "Restaurantes e similares" },
  { codigo: "56.20-1", descricao: "Serviços ambulantes de alimentação" },
  { codigo: "55.10-8", descricao: "Hotéis e similares" },
  { codigo: "47.12-1", descricao: "Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios" },
  { codigo: "47.71-2", descricao: "Comércio varejista de vestuário e acessórios" },
  { codigo: "47.51-2", descricao: "Comércio varejista especializado de equipamentos e suprimentos de informática" },
  { codigo: "47.72-5", descricao: "Comércio varejista de cosméticos, produtos de perfumaria e de higiene pessoal" },
  { codigo: "46.69-3", descricao: "Comércio atacadista de mercadorias em geral, sem predominância de alimentos ou de insumos agropecuários" },
  { codigo: "46.31-1", descricao: "Comércio atacadista de leite e laticínios" },
  { codigo: "46.37-1", descricao: "Comércio atacadista especializado em produtos alimentícios, não especificados anteriormente" },
  { codigo: "46.93-1", descricao: "Comércio atacadista de mercadorias em geral, com predominância de insumos agropecuários" },
  { codigo: "53.20-2", descricao: "Entregas rápidas" },
  { codigo: "52.11-7", descricao: "Armazéns gerais - emissão de warrant" },
  { codigo: "52.29-0", descricao: "Atividades auxiliares dos transportes, não especificadas anteriormente" },
  { codigo: "82.11-3", descricao: "Serviços combinados de escritório e apoio administrativo" },
  { codigo: "82.30-0", descricao: "Serviços de organização de feiras, congressos, exposições e festas" },
  { codigo: "86.30-5", descricao: "Atividade médica ambulatorial restrita a consultas" },
  { codigo: "86.50-0", descricao: "Atividades de profissionais da área de saúde, exceto médicos e odontólogos" },
  { codigo: "86.40-2", descricao: "Atividades de serviços de complementação diagnóstica e terapêutica" },
  { codigo: "71.11-1", descricao: "Serviços de arquitetura" },
  { codigo: "71.12-0", descricao: "Serviços de engenharia" },
  { codigo: "74.90-1", descricao: "Atividades profissionais, científicas e técnicas, não especificadas anteriormente" },
  { codigo: "96.02-5", descricao: "Cabeleireiros, manicure e pedicure" },
  { codigo: "93.13-1", descricao: "Clubes sociais, esportivos e similares" },
  { codigo: "47.41-3", descricao: "Comércio varejista especializado de eletrodomésticos e equipamentos de áudio e vídeo" },
  { codigo: "25.42-0", descricao: "Fabricação de artigos de serralheria, exceto esquadrias" },
  { codigo: "10.91-1", descricao: "Fabricação de açúcar em bruto" },
]

/** Busca por código ou descrição (sem acento, case-insensitive). */
export function buscarCnaes(termo: string, limite = 30): Cnae[] {
  const t = normalizar(termo.trim())
  if (!t) return CNAES.slice(0, limite)
  return CNAES.filter(
    (c) => normalizar(c.codigo).includes(t) || normalizar(c.descricao).includes(t),
  ).slice(0, limite)
}

export function cnaePorCodigo(codigo: string): Cnae | undefined {
  return CNAES.find((c) => c.codigo === codigo)
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}
