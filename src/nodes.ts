import { effectsToCss, num, textToTokens, toColor } from "./convert.js";
import { slugify, tokenName } from "./names.js";
import type { DocNode, FigmaPaint, StyleRef } from "./types.js";

export interface Element {
  tag: string;
  cls: string;
  css: Record<string, string>;
  attrs: Record<string, string>;
  text?: string;
  children: Element[];
}

export interface Ctx {
  prefix: string;
  styles: Record<string, StyleRef>;
  warnings: string[];
  component: string;
  block: string;
  usedClasses: Set<string>;
  /** true enquanto estamos dentro de um <button> ou <a>: evita elementos interativos aninhados. */
  interactive?: boolean;
}

type Sizing = "FIXED" | "HUG" | "FILL";

const px = (v: number) => (Math.abs(v) < 0.005 ? "0" : `${num(v, 2)}px`);
const isAuto = (n: DocNode) => n.layoutMode === "HORIZONTAL" || n.layoutMode === "VERTICAL";

const JUSTIFY: Record<string, string> = {
  MIN: "flex-start",
  CENTER: "center",
  MAX: "flex-end",
  SPACE_BETWEEN: "space-between",
};
const ALIGN: Record<string, string> = {
  MIN: "flex-start",
  CENTER: "center",
  MAX: "flex-end",
  BASELINE: "baseline",
};
const VECTORS = new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "REGULAR_POLYGON"]);

// ---------- cores ----------

/** Em Figma, o último preenchimento visível é o que fica por cima. */
function topPaint(paints?: FigmaPaint[]): FigmaPaint | undefined {
  const visible = (paints ?? []).filter((p) => p.visible !== false);
  return visible[visible.length - 1];
}

function solid(paints?: FigmaPaint[]): string | null {
  const p = topPaint(paints);
  return p && p.type === "SOLID" && p.color ? toColor(p.color, p.opacity ?? 1) : null;
}

/** Se a cor vem de um estilo do Figma, usa a variável do tokens.css com a cor literal de reserva. */
function tokenColor(value: string, styleId: string | undefined, ctx: Ctx): string {
  const ref = styleId ? ctx.styles[styleId] : undefined;
  if (ref && ref.styleType === "FILL") {
    return `var(--${tokenName(ctx.prefix, "color", ref.name)}, ${value})`;
  }
  return value;
}

function linearGradient(p: FigmaPaint): string | null {
  const handles = p.gradientHandlePositions;
  if (!handles || handles.length < 2 || !p.gradientStops?.length) return null;
  const [a, b] = handles;
  const angle = Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90);
  const stops = p.gradientStops
    .map((s) => `${toColor(s.color, p.opacity ?? 1)} ${num(s.position * 100, 1)}%`)
    .join(", ");
  return `linear-gradient(${(angle + 360) % 360}deg, ${stops})`;
}

function background(node: DocNode, ctx: Ctx): string | null {
  const p = topPaint(node.fills);
  if (!p) return null;
  if (p.type === "SOLID" && p.color) {
    return tokenColor(toColor(p.color, p.opacity ?? 1), node.styles?.fill, ctx);
  }
  if (p.type === "GRADIENT_LINEAR") {
    const g = linearGradient(p);
    if (g) return g;
  }
  ctx.warnings.push(`${ctx.component}: "${node.name}" tem preenchimento ${p.type} (não suportado), ignorado.`);
  return null;
}

// ---------- tamanho e posição ----------

function resolveSizing(node: DocNode, parent: DocNode | null): { h: Sizing; v: Sizing } {
  const inAuto = !!parent && isAuto(parent) && node.layoutPositioning !== "ABSOLUTE";
  const row = parent?.layoutMode === "HORIZONTAL";

  // Arquivos antigos não trazem layoutSizing*: deduz de layoutGrow/layoutAlign e dos modos de eixo.
  const legacy = (horizontal: boolean): Sizing => {
    if (inAuto) {
      const main = horizontal === row;
      if (main && node.layoutGrow === 1) return "FILL";
      if (!main && node.layoutAlign === "STRETCH") return "FILL";
    }
    if (node.type === "TEXT") {
      const r = node.style?.textAutoResize;
      if (r === "WIDTH_AND_HEIGHT") return "HUG";
      return horizontal ? "FIXED" : "HUG";
    }
    if (isAuto(node)) {
      const primaryIsHorizontal = node.layoutMode === "HORIZONTAL";
      const mode = horizontal === primaryIsHorizontal ? node.primaryAxisSizingMode : node.counterAxisSizingMode;
      if (mode === "AUTO") return "HUG";
    }
    return "FIXED";
  };

  return {
    h: node.layoutSizingHorizontal ?? legacy(true),
    v: node.layoutSizingVertical ?? legacy(false),
  };
}

function sizeCss(node: DocNode, parent: DocNode | null, css: Record<string, string>, absolute: boolean): void {
  let { h, v } = resolveSizing(node, parent);
  if (absolute) {
    if (h === "FILL") h = "FIXED";
    if (v === "FILL") v = "FIXED";
  }
  const box = node.absoluteBoundingBox;
  const inAuto = !!parent && isAuto(parent) && !absolute;
  const row = parent?.layoutMode === "HORIZONTAL";

  if (h === "FIXED" && box) css.width = px(box.width);
  if (v === "FIXED" && box && node.type !== "TEXT") css.height = px(box.height);

  if (inAuto) {
    if (h === "FILL") {
      if (row) css.flex = "1 1 0";
      else css["align-self"] = "stretch";
    }
    if (v === "FILL") {
      if (!row) css.flex = "1 1 0";
      else css["align-self"] = "stretch";
    }
    const mainFixed = row ? h === "FIXED" : v === "FIXED";
    if (mainFixed) css["flex-shrink"] = "0";
  }
}

function paddingCss(n: DocNode): string | null {
  const t = n.paddingTop ?? 0;
  const r = n.paddingRight ?? 0;
  const b = n.paddingBottom ?? 0;
  const l = n.paddingLeft ?? 0;
  if (!t && !r && !b && !l) return null;
  if (t === r && r === b && b === l) return px(t);
  if (t === b && l === r) return `${px(t)} ${px(r)}`;
  return `${px(t)} ${px(r)} ${px(b)} ${px(l)}`;
}

// ---------- construção ----------

function uniqueClass(ctx: Ctx, base: string): string {
  let name = base;
  let i = 2;
  while (ctx.usedClasses.has(name)) name = `${base}-${i++}`;
  ctx.usedClasses.add(name);
  return name;
}

function rootTag(componentName: string): string {
  const n = slugify(componentName);
  if (/(^|-)(button|btn|botao)(-|$)/.test(n)) return "button";
  if (/(^|-)link(-|$)/.test(n)) return "a";
  return "div";
}

function textCss(node: DocNode, el: Element, ctx: Ctx): void {
  const css = el.css;
  const s = node.style ?? {};
  const ref = node.styles?.text ? ctx.styles[node.styles.text] : undefined;
  const base = ref && ref.styleType === "TEXT" ? tokenName(ctx.prefix, "text", ref.name) : null;
  const PROP: Record<string, string> = {
    family: "font-family",
    size: "font-size",
    weight: "font-weight",
    "line-height": "line-height",
    "letter-spacing": "letter-spacing",
  };
  for (const [suffix, value] of textToTokens({ style: s }) ?? []) {
    css[PROP[suffix]] = base ? `var(--${base}-${suffix}, ${value})` : value;
  }
  if (s.italic) css["font-style"] = "italic";

  const color = solid(node.fills);
  if (color) css.color = tokenColor(color, node.styles?.fill, ctx);

  const align = { CENTER: "center", RIGHT: "right", JUSTIFIED: "justify" }[s.textAlignHorizontal ?? ""];
  if (align) css["text-align"] = align;
  const transform = { UPPER: "uppercase", LOWER: "lowercase", TITLE: "capitalize" }[s.textCase ?? ""];
  if (transform) css["text-transform"] = transform;
  const decoration = { UNDERLINE: "underline", STRIKETHROUGH: "line-through" }[s.textDecoration ?? ""];
  if (decoration) css["text-decoration"] = decoration;
  if (s.textAutoResize === "WIDTH_AND_HEIGHT") css["white-space"] = "nowrap";
}

export function buildElement(node: DocNode, parent: DocNode | null, ctx: Ctx, root = false): Element | null {
  if (node.visible === false) return null;

  const cls = root ? ctx.block : uniqueClass(ctx, `${ctx.block}__${slugify(node.name) || node.type.toLowerCase()}`);
  const tag = root ? rootTag(ctx.component) : node.type === "INSTANCE" && !ctx.interactive ? rootTag(node.name) : "div";
  const el: Element = { tag, cls, css: {}, attrs: {}, children: [] };
  const css = el.css;
  const box = node.absoluteBoundingBox;
  const absolute = !!parent && (!isAuto(parent) || node.layoutPositioning === "ABSOLUTE");

  if (absolute && box && parent?.absoluteBoundingBox) {
    css.position = "absolute";
    css.left = px(box.x - parent.absoluteBoundingBox.x);
    css.top = px(box.y - parent.absoluteBoundingBox.y);
  }

  if (node.type === "TEXT") {
    if (!root) el.tag = "span";
    textCss(node, el, ctx);
    sizeCss(node, parent, css, absolute);
    el.text = node.characters ?? "";
    return el;
  }

  if (VECTORS.has(node.type)) {
    ctx.warnings.push(
      `${ctx.component}: "${node.name}" é um vetor/ícone (${node.type}); gerei só um espaço reservado. Exporte como SVG.`,
    );
    el.tag = "span";
    el.attrs["aria-hidden"] = "true";
    css.display = "inline-block";
    if (box) {
      css.width = px(box.width);
      css.height = px(box.height);
    }
    css["flex-shrink"] = "0";
    return el;
  }

  if (node.type === "LINE") {
    const color = solid(node.strokes);
    css.width = px(box?.width ?? 0);
    css.height = "0";
    if (color && node.strokeWeight) {
      css["border-top"] = `${px(node.strokeWeight)} ${node.strokeDashes?.length ? "dashed" : "solid"} ${color}`;
    }
    return el;
  }

  css["box-sizing"] = "border-box";

  if (isAuto(node)) {
    css.display = "flex";
    css["flex-direction"] = node.layoutMode === "VERTICAL" ? "column" : "row";
    if (node.layoutWrap === "WRAP") css["flex-wrap"] = "wrap";
    if (node.itemSpacing) css.gap = px(node.itemSpacing);
    if (node.layoutWrap === "WRAP" && node.counterAxisSpacing) {
      css["row-gap"] = px(node.counterAxisSpacing);
    }
    const pad = paddingCss(node);
    if (pad) css.padding = pad;
    const justify = JUSTIFY[node.primaryAxisAlignItems ?? "MIN"];
    if (justify && justify !== "flex-start") css["justify-content"] = justify;
    // CSS usa "stretch" por padrão; o Figma usa "MIN". Por isso é sempre explícito.
    css["align-items"] = ALIGN[node.counterAxisAlignItems ?? "MIN"] ?? "flex-start";
  }

  sizeCss(node, parent, css, absolute);

  const bg = background(node, ctx);
  if (bg) css.background = bg;

  const stroke = solid(node.strokes);
  if (stroke && node.strokeWeight) {
    css.border = `${px(node.strokeWeight)} ${node.strokeDashes?.length ? "dashed" : "solid"} ${tokenColor(
      stroke,
      node.styles?.stroke,
      ctx,
    )}`;
  }

  if (node.type === "ELLIPSE") {
    css["border-radius"] = "50%";
  } else if (node.rectangleCornerRadii?.length === 4) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    css["border-radius"] = tl === tr && tr === br && br === bl ? px(tl) : `${px(tl)} ${px(tr)} ${px(br)} ${px(bl)}`;
  } else if (node.cornerRadius) {
    css["border-radius"] = px(node.cornerRadius);
  }

  const shadow = effectsToCss(node);
  if (shadow) {
    const ref = node.styles?.effect ? ctx.styles[node.styles.effect] : undefined;
    css["box-shadow"] =
      ref && ref.styleType === "EFFECT" ? `var(--${tokenName(ctx.prefix, "shadow", ref.name)}, ${shadow})` : shadow;
  }
  const blur = (node.effects ?? []).find((e) => e.visible !== false && e.type === "LAYER_BLUR");
  if (blur) css.filter = `blur(${px(blur.radius ?? 0)})`;
  const bgBlur = (node.effects ?? []).find((e) => e.visible !== false && e.type === "BACKGROUND_BLUR");
  if (bgBlur) css["backdrop-filter"] = `blur(${px(bgBlur.radius ?? 0)})`;

  if (node.opacity !== undefined && node.opacity < 1) css.opacity = num(node.opacity, 2);
  if (node.clipsContent) css.overflow = "hidden";

  const wasInteractive = ctx.interactive;
  if (el.tag === "button" || el.tag === "a") ctx.interactive = true;
  for (const child of node.children ?? []) {
    const childEl = buildElement(child, node, ctx);
    if (childEl) el.children.push(childEl);
  }
  ctx.interactive = wasInteractive;
  if (!css.position && el.children.some((c) => c.css.position === "absolute")) css.position = "relative";

  if (el.tag === "button") {
    el.attrs.type = "button";
    css.cursor = "pointer";
    if (!css.border) css.border = "0";
    if (!css.background) css.background = "none";
  } else if (el.tag === "a") {
    el.attrs.href = "#";
    css["text-decoration"] = "none";
    css.color = "inherit";
  }

  return el;
}
