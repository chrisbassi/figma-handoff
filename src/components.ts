import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fetchFile } from "./figma.js";
import { slugify } from "./names.js";
import { buildElement, type Ctx, type Element } from "./nodes.js";
import { pascalCase, previewPage, toBlade, toCss, toHtml, toReact } from "./render.js";
import type { Config, DocNode } from "./types.js";

export interface Found {
  name: string;
  node: DocNode;
}

export interface Generated {
  name: string;
  slug: string;
  el: Element;
  css: string;
  html: string;
  warnings: string[];
}

/**
 * Percorre o arquivo atrás de componentes.
 * Conjuntos de variantes (COMPONENT_SET) viram um componente por variante: "Button/Size=Large".
 */
export function collectComponents(doc: DocNode): Found[] {
  const found: Found[] = [];
  const walk = (node: DocNode) => {
    if (node.visible === false) return;
    if (node.type === "COMPONENT") {
      found.push({ name: node.name, node });
      return;
    }
    if (node.type === "COMPONENT_SET") {
      for (const variant of node.children ?? []) {
        if (variant.type === "COMPONENT") found.push({ name: `${node.name}/${variant.name}`, node: variant });
      }
      return;
    }
    if (node.type === "INSTANCE") return;
    node.children?.forEach(walk);
  };
  walk(doc);
  return found;
}

export async function buildComponents(
  config: Config,
  token: string,
  only: string[] = [],
): Promise<{ components: Generated[]; warnings: string[]; fileName?: string }> {
  const file = await fetchFile(config.fileKey, token);
  const warnings: string[] = [];
  const needles = only.map((o) => o.toLowerCase());

  const found = collectComponents(file.document).filter(
    (f) => needles.length === 0 || needles.some((n) => f.name.toLowerCase().includes(n)),
  );
  if (found.length === 0) {
    warnings.push(
      needles.length
        ? "Nenhum componente bate com o filtro --only."
        : "Nenhum componente encontrado no arquivo. Os elementos precisam ser Components (Ctrl/Cmd + Alt + K).",
    );
  }

  const usedSlugs = new Set<string>();
  const components: Generated[] = [];

  for (const { name, node } of found) {
    let slug = slugify(name) || "componente";
    const base = slug;
    let i = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${i++}`;
    if (slug !== base) warnings.push(`Nome repetido "${name}": usando "${slug}".`);
    usedSlugs.add(slug);

    const local: string[] = [];
    const ctx: Ctx = {
      prefix: config.prefix,
      styles: file.styles ?? {},
      warnings: local,
      component: name,
      block: [slugify(config.prefix), slug].filter(Boolean).join("-"),
      usedClasses: new Set(),
    };
    const el = buildElement(node, null, ctx, true);
    if (!el) continue;
    warnings.push(...local);
    const own = `${name}: `;
    components.push({
      name,
      slug,
      el,
      css: toCss(el, name),
      html: toHtml(el),
      warnings: local.map((w) => (w.startsWith(own) ? w.slice(own.length) : w)),
    });
  }

  return { components, warnings, fileName: file.name };
}

const EXT = { html: ".html", blade: ".blade.php", react: ".tsx" } as const;

export const reactName = (name: string) => pascalCase(name) || "Componente";

export interface OutFile {
  name: string;
  content: string;
}

/** Monta os arquivos (sem escrever): um .css e um elemento por componente, mais o preview.html. */
export function componentFiles(config: Config, components: Generated[], tokensHref: string | null): OutFile[] {
  const files: OutFile[] = [];
  const { format } = config.components;
  for (const c of components) {
    files.push({ name: `${c.slug}.css`, content: c.css });
    if (format === "react") {
      const fn = reactName(c.name);
      files.push({ name: `${fn}${EXT.react}`, content: toReact(c.el, c.slug, fn) });
    } else {
      files.push({ name: `${c.slug}${EXT[format]}`, content: format === "blade" ? toBlade(c.el) : c.html });
    }
  }
  files.push({ name: "preview.html", content: previewPage(components, tokensHref) });
  return files;
}

/** Escreve os arquivos na pasta configurada. */
export function writeComponents(config: Config, components: Generated[], cwd = process.cwd()): string[] {
  const dir = resolve(cwd, config.components.output);
  const tokensHref = relative(dir, resolve(cwd, config.output)).split(sep).join("/");
  const files = componentFiles(config, components, tokensHref);
  for (const f of files) {
    const path = resolve(dir, f.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.content);
  }
  return files.map((f) => f.name);
}
