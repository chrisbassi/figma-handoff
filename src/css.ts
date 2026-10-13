import type { Token, TokenGroup } from "./types.js";

const TITLES: Record<TokenGroup, string> = {
  color: "Cores",
  text: "Tipografia",
  shadow: "Sombras",
};

/** Sem timestamp de propósito: rodar o sync sem mudança no design não suja o git. */
export function generateCss(tokens: Token[]): string {
  const sections: string[] = [];
  for (const group of ["color", "text", "shadow"] as TokenGroup[]) {
    const items = tokens
      .filter((t) => t.group === group)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (items.length === 0) continue;
    const lines = items.map((t) => `  --${t.name}: ${t.value};`);
    sections.push(`  /* ${TITLES[group]} */\n${lines.join("\n")}`);
  }
  return `/* Gerado por figma-handoff. Não edite à mão. */\n:root {\n${sections.join("\n\n")}\n}\n`;
}
