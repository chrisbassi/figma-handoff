import test from "node:test";
import assert from "node:assert/strict";
import { collectComponents } from "./components.js";
import { buildElement, type Ctx } from "./nodes.js";
import { pascalCase, toBlade, toCss, toHtml, toReact } from "./render.js";
import type { DocNode } from "./types.js";

const white = { r: 1, g: 1, b: 1 };

const label: DocNode = {
  id: "1:2",
  name: "Label",
  type: "TEXT",
  characters: "Comprar {{ agora }}",
  fills: [{ type: "SOLID", color: white }],
  style: { fontFamily: "Inter", fontSize: 16, fontWeight: 600, lineHeightPx: 24, textAutoResize: "WIDTH_AND_HEIGHT" },
  absoluteBoundingBox: { x: 16, y: 10, width: 70, height: 24 },
  layoutSizingHorizontal: "HUG",
  layoutSizingVertical: "HUG",
};

const button: DocNode = {
  id: "1:1",
  name: "Button",
  type: "COMPONENT",
  layoutMode: "HORIZONTAL",
  primaryAxisAlignItems: "CENTER",
  counterAxisAlignItems: "CENTER",
  itemSpacing: 8,
  paddingLeft: 16,
  paddingRight: 16,
  paddingTop: 10,
  paddingBottom: 10,
  cornerRadius: 8,
  layoutSizingHorizontal: "HUG",
  layoutSizingVertical: "HUG",
  fills: [{ type: "SOLID", color: { r: 0.2314, g: 0.5098, b: 0.9647 } }],
  styles: { fill: "S:1" },
  absoluteBoundingBox: { x: 0, y: 0, width: 102, height: 44 },
  children: [label],
};

const ctx = (): Ctx => ({
  prefix: "ds",
  styles: { "S:1": { name: "Primary/500", styleType: "FILL" } },
  warnings: [],
  component: "Button",
  block: "ds-button",
  usedClasses: new Set(),
});

test("auto-layout vira flex com gap, padding e alinhamento explícito", () => {
  const el = buildElement(button, null, ctx(), true)!;
  assert.equal(el.tag, "button");
  assert.equal(el.css.display, "flex");
  assert.equal(el.css["flex-direction"], "row");
  assert.equal(el.css.gap, "8px");
  assert.equal(el.css.padding, "10px 16px");
  assert.equal(el.css["justify-content"], "center");
  assert.equal(el.css["align-items"], "center");
  assert.equal(el.css["border-radius"], "8px");
  assert.equal(el.css.width, undefined); // HUG
});

test("cor de estilo usa a variável do tokens.css com reserva literal", () => {
  const el = buildElement(button, null, ctx(), true)!;
  assert.equal(el.css.background, "var(--ds-color-primary-500, #3b82f6)");
});

test("texto vira span com tipografia e classe BEM", () => {
  const el = buildElement(button, null, ctx(), true)!;
  const text = el.children[0];
  assert.equal(text.tag, "span");
  assert.equal(text.cls, "ds-button__label");
  assert.equal(text.css["font-size"], "1rem");
  assert.equal(text.css["font-weight"], "600");
  assert.equal(text.css["line-height"], "1.5");
  assert.equal(text.css.color, "#ffffff");
  assert.equal(text.css["white-space"], "nowrap");
});

test("frame sem auto-layout posiciona filhos em absoluto", () => {
  const card: DocNode = {
    id: "2:1",
    name: "Card",
    type: "COMPONENT",
    absoluteBoundingBox: { x: 100, y: 100, width: 200, height: 100 },
    children: [
      { id: "2:2", name: "Box", type: "RECTANGLE", absoluteBoundingBox: { x: 110, y: 120, width: 50, height: 40 } },
    ],
  };
  const el = buildElement(card, null, ctx(), true)!;
  assert.equal(el.css.position, "relative");
  assert.equal(el.css.width, "200px");
  assert.equal(el.css.height, "100px");
  const box = el.children[0];
  assert.equal(box.css.position, "absolute");
  assert.equal(box.css.left, "10px");
  assert.equal(box.css.top, "20px");
});

test("vetor vira espaço reservado com aviso", () => {
  const c = ctx();
  const el = buildElement(
    { id: "3:1", name: "Icon", type: "VECTOR", absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 } },
    { id: "3:0", name: "Row", type: "FRAME", layoutMode: "HORIZONTAL" },
    c,
  )!;
  assert.equal(el.attrs["aria-hidden"], "true");
  assert.equal(el.css.width, "24px");
  assert.equal(c.warnings.length, 1);
});

test("nós invisíveis são ignorados", () => {
  assert.equal(buildElement({ id: "4:1", name: "x", type: "FRAME", visible: false }, null, ctx()), null);
});

test("collectComponents: pega componentes, abre variantes e ignora instâncias", () => {
  const doc: DocNode = {
    id: "0:0",
    name: "Document",
    type: "DOCUMENT",
    children: [
      {
        id: "0:1",
        name: "Page",
        type: "CANVAS",
        children: [
          button,
          {
            id: "5:1",
            name: "Badge",
            type: "COMPONENT_SET",
            children: [
              { id: "5:2", name: "Tone=Info", type: "COMPONENT" },
              { id: "5:3", name: "Tone=Danger", type: "COMPONENT" },
            ],
          },
          { id: "6:1", name: "Uso do botão", type: "INSTANCE" },
          { id: "7:1", name: "Frame solto", type: "FRAME", children: [] },
        ],
      },
    ],
  };
  assert.deepEqual(
    collectComponents(doc).map((f) => f.name),
    ["Button", "Badge/Tone=Info", "Badge/Tone=Danger"],
  );
});

test("renderização: html, blade (escapa {{), react e css", () => {
  const el = buildElement(button, null, ctx(), true)!;
  const html = toHtml(el);
  assert.match(html, /^<button class="ds-button" type="button">/);
  assert.match(html, /<span class="ds-button__label">Comprar \{\{ agora \}\}<\/span>/);
  assert.match(toBlade(el), /Comprar @\{\{ agora \}\}/);
  const jsx = toReact(el, "button", "Button");
  assert.match(jsx, /import "\.\/button\.css";/);
  assert.match(jsx, /className="ds-button"/);
  assert.match(jsx, /&#123;&#123; agora &#125;&#125;/);
  const css = toCss(el, "Button");
  assert.match(css, /\.ds-button \{/);
  assert.match(css, /\.ds-button__label \{/);
  assert.equal(pascalCase("Badge/Tone=Info"), "BadgeToneInfo");
});

test("instância aninhada chamada Button vira <button>, mas nunca dentro de outro <button>", () => {
  const instance = (name: string, children: DocNode[] = []): DocNode => ({
    id: `i:${name}`, name, type: "INSTANCE", layoutMode: "HORIZONTAL", children,
    absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 20 },
  });
  const card: DocNode = {
    id: "c:1", name: "Card", type: "COMPONENT", layoutMode: "VERTICAL",
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    children: [instance("Button"), instance("Badge")],
  };
  const el = buildElement(card, null, { ...ctx(), component: "Card", block: "ds-card" }, true)!;
  assert.equal(el.tag, "div");
  assert.equal(el.children[0].tag, "button");
  assert.equal(el.children[0].attrs.type, "button");
  assert.equal(el.children[0].css.cursor, "pointer");
  assert.equal(el.children[1].tag, "div", "Badge continua div");

  const nested = buildElement({ ...button, children: [instance("Button")] }, null, ctx(), true)!;
  assert.equal(nested.tag, "button");
  assert.equal(nested.children[0].tag, "div", "sem <button> dentro de <button>");
  assert.equal(new Set([undefined, false]).has(ctx().interactive), true, "ctx começa limpo");
});
