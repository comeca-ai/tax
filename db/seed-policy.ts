/** Demo exige consentimento explícito e nunca é permitido em produção. */
export function senhaDemoAutorizada(
  source: Record<string, string | undefined>
): string | null {
  if (source.SEED_DEMO !== "true") return null;
  if (source.NODE_ENV !== "development" && source.NODE_ENV !== "test") {
    throw new Error(
      "SEED_DEMO exige NODE_ENV=development ou test; demo é proibido em produção."
    );
  }
  const senha = source.SEED_DEMO_PASSWORD;
  if (!senha || senha.trim().length < 12) {
    throw new Error(
      "SEED_DEMO_PASSWORD deve ser fornecida explicitamente com pelo menos 12 caracteres."
    );
  }
  return senha;
}
