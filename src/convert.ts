import type { FigmaColor, FigmaNode } from "./types.js";

/** Número limpo: 1.5000 -> "1.5", 0 -> "0". */
export function num(value: number, digits = 3): string {
  return String(Number(value.toFixed(digits)));
}

const hex = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0");

/** O Figma entrega cor em float 0..1. Opaco vira hex, transparente vira rgba(). */
export function toColor(color: FigmaColor, opacity = 1): string {
  const alpha = (color.a ?? 1) * opacity;
  if (alpha >= 0.999) {
    return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
  }
  const c = (v: number) => Math.round(v * 255);
  return `rgba(${c(color.r)}, ${c(color.g)}, ${c(color.b)}, ${num(alpha, 2)})`;
}

/** Só cor sólida é suportada. Retorna null se for gradiente, imagem etc. */
export function fillToCss(node: FigmaNode): string | null {
  const fill = node.fills?.find((f) => f.visible !== false);
  if (!fill || fill.type !== "SOLID" || !fill.color) return null;
  return toColor(fill.color, fill.opacity ?? 1);
}

/** Estilo de texto vira uma lista [sufixo, valor]. */
export function textToTokens(node: FigmaNode): Array<[string, string]> | null {
  const s = node.style;
  if (!s || !s.fontFamily || !s.fontSize) return null;

  const out: Array<[string, string]> = [
    ["family", `"${s.fontFamily}", sans-serif`],
    ["size", `${num(s.fontSize / 16)}rem`],
  ];
  if (s.fontWeight) out.push(["weight", String(s.fontWeight)]);
  if (s.lineHeightPx) out.push(["line-height", num(s.lineHeightPx / s.fontSize)]);
  if (s.letterSpacing) out.push(["letter-spacing", `${num(s.letterSpacing / s.fontSize)}em`]);
  return out;
}

/** Sombras (drop e inner) viram um box-shadow. Blur de layer é ignorado. */
export function effectsToCss(node: FigmaNode): string | null {
  const shadows = (node.effects ?? [])
    .filter((e) => e.visible !== false)
    .filter((e) => e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW")
    .map((e) => {
      const x = num(e.offset?.x ?? 0);
      const y = num(e.offset?.y ?? 0);
      const blur = num(e.radius ?? 0);
      const spread = num(e.spread ?? 0);
      const color = e.color ? toColor(e.color) : "rgba(0, 0, 0, 0.25)";
      const inset = e.type === "INNER_SHADOW" ? "inset " : "";
      return `${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`;
    });
  return shadows.length ? shadows.join(", ") : null;
}
