// Gera o site do GitHub Pages em _site/ (landing + demonstração).
// A demonstração NÃO é um mockup: sobe um "Figma de mentira" com o arquivo de exemplo,
// roda o servidor real da ferramenta contra ele e guarda a resposta do scan como JSON estático.
// Rode com: npm run build:site (compila antes).
import http from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sample } from "../examples/sample-file.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "_site");
const fail = (msg) => {
  console.error(`build-site: ${msg}`);
  process.exit(1);
};

if (!existsSync(join(root, "dist/server.js"))) fail("dist/ não existe. Rode `npm run build` antes.");

// 1) Figma de mentira, servindo o arquivo de exemplo no formato da API REST.
const figma = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  res.setHeader("content-type", "application/json");
  if (url.pathname.endsWith("/styles")) return res.end(JSON.stringify({ meta: { styles: sample.styleList } }));
  if (url.pathname.endsWith("/nodes")) {
    const ids = (url.searchParams.get("ids") ?? "").split(",");
    return res.end(JSON.stringify({ nodes: Object.fromEntries(ids.map((id) => [id, sample.nodes[id] ?? null])) }));
  }
  if (/^\/files\/[^/]+$/.test(url.pathname)) return res.end(JSON.stringify(sample.file));
  res.statusCode = 404;
  res.end("{}");
});
await new Promise((ok) => figma.listen(0, "127.0.0.1", ok));
process.env.FIGMA_API_URL = `http://127.0.0.1:${figma.address().port}`; // lido na importação do módulo

// 2) Servidor real da ferramenta, apontado para o mock.
const { startServer } = await import(pathToFileURL(join(root, "dist/server.js")).href);
const scratch = mkdtempSync(join(tmpdir(), "handoff-site-"));
const ui = await startServer({ port: 0, cwd: scratch });

let scan;
try {
  const res = await fetch(`${ui.url}/api/scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileKey: "demo", token: "demo", prefix: "ds" }),
  });
  if (!res.ok) fail(`scan respondeu ${res.status}: ${await res.text()}`);
  scan = await res.json();
} finally {
  await ui.close();
  figma.closeAllConnections();
  figma.close();
  rmSync(scratch, { recursive: true, force: true });
}

// 3) Sanidade: se o pipeline quebrar, o build do site quebra (e o CI avisa).
if (scan.components.length < 9) fail(`esperava 9 componentes, vieram ${scan.components.length}.`);
if (scan.tokens.length < 7) fail(`esperava tokens de cor/texto/sombra, vieram ${scan.tokens.length}.`);
const card = scan.components.find((c) => c.slug === "card");
if (!card) fail("componente 'card' não apareceu no scan.");

// 4) Monta o site.
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "demo"), { recursive: true });
writeFileSync(join(out, ".nojekyll"), "");
writeFileSync(join(out, "demo/scan.json"), JSON.stringify(scan));

const ui_html = readFileSync(join(root, "ui/index.html"), "utf8");
if (!ui_html.includes('<html lang="pt-BR">')) fail("ui/index.html mudou: não achei <html lang=\"pt-BR\">.");
writeFileSync(join(out, "demo/index.html"), ui_html.replace('<html lang="pt-BR">', '<html lang="pt-BR" data-demo="./scan.json">'));

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const slug = process.env.GITHUB_REPOSITORY || `chrisbassi/${pkg.name}`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fill = {
  __REPO_SLUG__: slug,
  __REPO_URL__: `https://github.com/${slug}`,
  __VERSION__: pkg.version,
  __NAME__: pkg.name,
  __PREVIEW_CSS__: card.css,
  __PREVIEW_HTML__: card.html,
  __CODE_HTML__: esc(card.html),
  __CODE_CSS__: esc(card.css.replace(/^\/\*.*\*\/\n/, "")),
  __COMPONENT_COUNT__: String(scan.components.length),
};
let landing = readFileSync(join(root, "pages/index.html"), "utf8");
for (const [key, value] of Object.entries(fill)) landing = landing.split(key).join(value); // split/join: sem surpresas com "$"
const left = landing.match(/__[A-Z_]+__/g);
if (left) fail(`sobraram placeholders na landing: ${[...new Set(left)].join(", ")}`);
writeFileSync(join(out, "index.html"), landing);

console.log(`site gerado em _site/ (${scan.components.length} componentes, ${scan.tokens.length} tokens, ${scan.warnings.length} avisos)`);
