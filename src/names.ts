/** "Primary/500" -> "primary-500"; remove acentos e símbolos. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Monta o nome base da variável CSS (sem o "--"). */
export function tokenName(prefix: string, kind: string, styleName: string): string {
  // "Shadow/Card" vira "card", não "shadow-card": o tipo já está no nome da variável.
  let slug = slugify(styleName);
  if (slug === kind) slug = "";
  else if (slug.startsWith(`${kind}-`)) slug = slug.slice(kind.length + 1);
  return [slugify(prefix), kind, slug].filter(Boolean).join("-");
}

/** Aceita a chave pura ou a URL completa do arquivo no Figma. */
export function extractFileKey(input: string): string {
  const match = input.match(/figma\.com\/(?:file|design|board|proto)\/([a-zA-Z0-9]+)/);
  return (match ? match[1] : input).trim();
}
