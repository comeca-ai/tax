/** Transcreve somente campos explícitos do documento; a validação de DV é fiscal. */
export function extrairIdentidadeFiscalTexto(texto: string) {
  const candidatas = new Set<string>();
  const xml = /<(?:[\w.-]+:)?(?:NFe|nfeProc|infNFe)\b/.test(texto);
  if (xml) {
    for (const m of texto.matchAll(/<(?:[\w.-]+:)?infNFe\b[^>]*\bId\s*=\s*["']NFe(\d{44})["']/g)) candidatas.add(m[1]);
    for (const m of texto.matchAll(/<(?:[\w.-]+:)?chNFe\b[^>]*>\s*(\d{44})\s*<\/(?:[\w.-]+:)?chNFe\s*>/g)) candidatas.add(m[1]);
  } else {
    // Exige o rótulo: não concatena protocolos, números da nota ou valores soltos.
    for (const m of texto.matchAll(/chave\s+(?:de\s+)?acesso\s*[:-]?\s*(\d{44}|\d{4}(?:[ \t\r\n]+\d{4}){10})(?![\d]|[ \t]+\d{4}\b)/gi)) {
      candidatas.add(m[1].replace(/\s/g, ""));
    }
  }
  const dest = xml
    ? /<(?:[\w.-]+:)?dest\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?dest\s*>/.exec(texto)?.[1]
    : null;
  const cnpjDestinatario = dest
    ? /<(?:[\w.-]+:)?CNPJ\b[^>]*>\s*(\d{14})\s*<\/(?:[\w.-]+:)?CNPJ\s*>/.exec(dest)?.[1] ?? null
    : null;
  return {
    chaveAcesso: candidatas.size === 1 ? [...candidatas][0] : null,
    cnpjDestinatario,
    chaveAmbigua: candidatas.size > 1,
  };
}
