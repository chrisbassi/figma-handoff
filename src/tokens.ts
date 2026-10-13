import { effectsToCss, fillToCss, textToTokens } from "./convert.js";
import { fetchNodes, fetchStyles } from "./figma.js";
import { tokenName } from "./names.js";
import type { Config, Token } from "./types.js";

export interface BuildResult {
  tokens: Token[];
  warnings: string[];
}

export async function buildTokens(config: Config, token: string): Promise<BuildResult> {
  const styles = await fetchStyles(config.fileKey, token);
  if (styles.length === 0) {
    return {
      tokens: [],
      warnings: [
        "Nenhum estilo encontrado. Os estilos precisam estar publicados na biblioteca do arquivo (Assets > Library > Publish).",
      ],
    };
  }

  const nodes = await fetchNodes(config.fileKey, styles.map((s) => s.node_id), token);
  const tokens: Token[] = [];
  const warnings: string[] = [];
  const usedBases = new Set<string>();

  const uniqueBase = (kind: string, styleName: string): string => {
    const base = tokenName(config.prefix, kind, styleName);
    let name = base;
    let i = 2;
    while (usedBases.has(name)) name = `${base}-${i++}`;
    if (name !== base) warnings.push(`Nome repetido "${styleName}": usando --${name}`);
    usedBases.add(name);
    return name;
  };

  for (const style of styles) {
    const node = nodes[style.node_id];
    if (!node) {
      warnings.push(`"${style.name}": nó não retornado pelo Figma, ignorado.`);
      continue;
    }

    if (style.style_type === "FILL") {
      const value = fillToCss(node);
      if (!value) {
        warnings.push(`"${style.name}": só cor sólida é suportada (gradiente/imagem ignorado).`);
        continue;
      }
      tokens.push({ name: uniqueBase("color", style.name), value, group: "color" });
    } else if (style.style_type === "TEXT") {
      const parts = textToTokens(node);
      if (!parts) {
        warnings.push(`"${style.name}": estilo de texto incompleto, ignorado.`);
        continue;
      }
      const base = uniqueBase("text", style.name);
      for (const [suffix, value] of parts) {
        tokens.push({ name: `${base}-${suffix}`, value, group: "text" });
      }
    } else if (style.style_type === "EFFECT") {
      const value = effectsToCss(node);
      if (!value) {
        warnings.push(`"${style.name}": nenhuma sombra encontrada (blur de layer não é suportado).`);
        continue;
      }
      tokens.push({ name: uniqueBase("shadow", style.name), value, group: "shadow" });
    }
    // GRID: ignorado de propósito.
  }

  return { tokens, warnings };
}
