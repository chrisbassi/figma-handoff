import type { Element } from "./nodes.js";

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => escHtml(s).replace(/"/g, "&quot;");

/** Em JSX, { e } são sintaxe; < > & viram entidades. */
const escJsx = (s: string) => escHtml(s).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");

function open(el: Element, jsx: boolean): string {
  const attrs = [`${jsx ? "className" : "class"}="${el.cls}"`];
  for (const [k, v] of Object.entries(el.attrs)) attrs.push(`${k}="${escAttr(v)}"`);
  return `<${el.tag} ${attrs.join(" ")}>`;
}

function render(el: Element, depth: number, jsx: boolean): string {
  const pad = "  ".repeat(depth);
  if (el.text !== undefined) {
    const br = jsx ? "<br />" : "<br>";
    const text = (jsx ? escJsx(el.text) : escHtml(el.text)).replace(/\n/g, br);
    return `${pad}${open(el, jsx)}${text}</${el.tag}>`;
  }
  if (el.children.length === 0) return `${pad}${open(el, jsx)}</${el.tag}>`;
  const inner = el.children.map((c) => render(c, depth + 1, jsx)).join("\n");
  return `${pad}${open(el, jsx)}\n${inner}\n${pad}</${el.tag}>`;
}

export const toHtml = (el: Element): string => render(el, 0, false);

/** Blade: igual ao HTML, mas escapando {{ e {!! para o Blade não interpretar o texto do design. */
export const toBlade = (el: Element): string =>
  toHtml(el).replace(/\{\{/g, "@{{").replace(/\{!!/g, "@{!!");

export function toCss(el: Element, componentName: string): string {
  const rules: string[] = [];
  const walk = (e: Element) => {
    const lines = Object.entries(e.css).map(([k, v]) => `  ${k}: ${v};`);
    if (lines.length) rules.push(`.${e.cls} {\n${lines.join("\n")}\n}`);
    e.children.forEach(walk);
  };
  walk(el);
  return `/* Gerado por figma-handoff (componente: ${componentName}). Não edite à mão. */\n${rules.join("\n\n")}\n`;
}

export function pascalCase(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const pascal = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  return /^[0-9]/.test(pascal) ? `C${pascal}` : pascal;
}

export function toReact(el: Element, slug: string, fnName: string): string {
  return `import "./${slug}.css";

export function ${fnName}() {
  return (
${render(el, 2, true)}
  );
}

export default ${fnName};
`;
}

export interface PreviewItem {
  name: string;
  slug: string;
  html: string;
}

export function previewPage(items: PreviewItem[], tokensHref: string | null): string {
  const links = [
    ...(tokensHref ? [`<link rel="stylesheet" href="${escAttr(tokensHref)}">`] : []),
    ...items.map((i) => `<link rel="stylesheet" href="./${i.slug}.css">`),
  ].join("\n  ");
  const sections = items
    .map(
      (i) => `    <section>
      <h2>${escHtml(i.name)}</h2>
      <div class="stage">
${i.html
  .split("\n")
  .map((l) => `        ${l}`)
  .join("\n")}
      </div>
    </section>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Componentes</title>
  ${links}
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 32px; background: #f4f4f5; color: #18181b; }
    h1 { margin: 0 0 24px; font-size: 20px; }
    section { margin-bottom: 24px; }
    h2 { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: #52525b; }
    .stage { background: #fff; border: 1px dashed #d4d4d8; border-radius: 8px; padding: 24px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Componentes gerados do Figma</h1>
${sections}
</body>
</html>
`;
}
