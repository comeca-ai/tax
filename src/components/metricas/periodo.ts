export function periodoMetricas(de: string, ate: string) {
  if (![de, ate].every(v => /^\d{4}-\d{2}-\d{2}$/.test(v))) return null;
  const a = new Date(`${de}T00:00:00Z`),
    b = new Date(`${ate}T00:00:00Z`);
  if (
    !Number.isFinite(+a) ||
    !Number.isFinite(+b) ||
    a.toISOString().slice(0, 10) !== de ||
    b.toISOString().slice(0, 10) !== ate ||
    a > b
  )
    return null;
  b.setUTCDate(b.getUTCDate() + 1);
  return { inicio: a.toISOString(), fim: b.toISOString() };
}
