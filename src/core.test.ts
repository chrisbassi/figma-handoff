import test from "node:test";
import assert from "node:assert/strict";
import { effectsToCss, fillToCss, textToTokens, toColor } from "./convert.js";
import { generateCss } from "./css.js";
import { compareVars, parseVars } from "./diff.js";
import { extractFileKey, slugify, tokenName } from "./names.js";

test("toColor converte float 0..1 em hex", () => {
  assert.equal(toColor({ r: 0.2314, g: 0.5098, b: 0.9647 }), "#3b82f6");
});

test("toColor usa rgba quando há transparência", () => {
  assert.equal(toColor({ r: 0, g: 0, b: 0, a: 0.12 }), "rgba(0, 0, 0, 0.12)");
  assert.equal(toColor({ r: 1, g: 1, b: 1 }, 0.5), "rgba(255, 255, 255, 0.5)");
});

test("fillToCss ignora gradiente", () => {
  assert.equal(fillToCss({ fills: [{ type: "GRADIENT_LINEAR" }] }), null);
  assert.equal(fillToCss({ fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] }), "#ff0000");
});

test("textToTokens gera rem, line-height unitless e letter-spacing em", () => {
  const out = textToTokens({
    style: { fontFamily: "Inter", fontSize: 18, fontWeight: 600, lineHeightPx: 27, letterSpacing: 0.36 },
  });
  assert.deepEqual(out, [
    ["family", '"Inter", sans-serif'],
    ["size", "1.125rem"],
    ["weight", "600"],
    ["line-height", "1.5"],
    ["letter-spacing", "0.02em"],
  ]);
});

test("effectsToCss junta sombras e trata inner", () => {
  const css = effectsToCss({
    effects: [
      { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 2 }, radius: 8, spread: 0 },
      { type: "INNER_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.5 }, offset: { x: 0, y: 1 }, radius: 1, spread: 0 },
    ],
  });
  assert.equal(css, "0px 2px 8px 0px rgba(0, 0, 0, 0.12), inset 0px 1px 1px 0px rgba(0, 0, 0, 0.5)");
});

test("nomes", () => {
  assert.equal(slugify("Primária / 500"), "primaria-500");
  assert.equal(tokenName("ds", "color", "Primary/500"), "ds-color-primary-500");
  assert.equal(tokenName("", "color", "Primary/500"), "color-primary-500");
  assert.equal(tokenName("ds", "shadow", "Shadow/Card"), "ds-shadow-card", "não repete o tipo");
  assert.equal(tokenName("ds", "color", "Color/Primary 500"), "ds-color-primary-500");
  assert.equal(tokenName("ds", "shadow", "Shadowy"), "ds-shadow-shadowy", "só remove segmento inteiro");
  assert.equal(tokenName("ds", "text", "Text"), "ds-text");
  assert.equal(extractFileKey("https://www.figma.com/design/abc123XYZ/Meu-DS?node-id=0-1"), "abc123XYZ");
  assert.equal(extractFileKey("abc123XYZ"), "abc123XYZ");
});

test("css gerado é estável e o diff enxerga mudanças", () => {
  const a = generateCss([
    { name: "color-b", value: "#000000", group: "color" },
    { name: "color-a", value: "#ffffff", group: "color" },
  ]);
  assert.ok(a.indexOf("--color-a") < a.indexOf("--color-b"));
  const b = generateCss([
    { name: "color-a", value: "#eeeeee", group: "color" },
    { name: "color-c", value: "#123456", group: "color" },
  ]);
  const d = compareVars(parseVars(a), parseVars(b));
  assert.deepEqual(d.added, [["--color-c", "#123456"]]);
  assert.deepEqual(d.removed, [["--color-b", "#000000"]]);
  assert.deepEqual(d.changed, [{ name: "--color-a", from: "#ffffff", to: "#eeeeee" }]);
});
