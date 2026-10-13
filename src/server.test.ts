import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, makeZip } from "./zip.js";

const file = {
  name: "Meu Design System",
  styles: { "S:1": { name: "Primary/500", styleType: "FILL" } },
  document: {
    id: "0:0", name: "Document", type: "DOCUMENT",
    children: [{ id: "0:1", name: "Page", type: "CANVAS", children: [
      {
        id: "1:1", name: "Button", type: "COMPONENT", layoutMode: "HORIZONTAL",
        primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
        paddingLeft: 16, paddingRight: 16, paddingTop: 10, paddingBottom: 10, cornerRadius: 8,
        layoutSizingHorizontal: "HUG", layoutSizingVertical: "HUG", styles: { fill: "S:1" },
        fills: [{ type: "SOLID", color: { r: 0.2314, g: 0.5098, b: 0.9647 } }],
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
        children: [{
          id: "1:2", name: "Label", type: "TEXT", characters: "Comprar",
          style: { fontFamily: "Inter", fontSize: 16, fontWeight: 600, lineHeightPx: 24, textAutoResize: "WIDTH_AND_HEIGHT" },
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
          absoluteBoundingBox: { x: 16, y: 10, width: 60, height: 24 },
        }],
      },
      { id: "2:1", name: "Card", type: "COMPONENT", absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 80 }, children: [] },
    ] }],
  },
};

let figma: http.Server;
let ui: { url: string; close: () => Promise<void> };
let dir: string;

before(async () => {
  figma = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.headers["x-figma-token"] !== "tok") { res.statusCode = 403; return res.end("{}"); }
    if (req.url === "/files/abc") return res.end(JSON.stringify(file));
    if (req.url === "/files/abc/styles") return res.end(JSON.stringify({ meta: { styles: [] } }));
    res.statusCode = 404; res.end("{}");
  });
  await new Promise<void>((ok) => figma.listen(0, "127.0.0.1", ok));
  process.env.FIGMA_API_URL = `http://127.0.0.1:${(figma.address() as { port: number }).port}`;
  const { startServer } = await import("./server.js"); // depois do env: figma.ts lê na importação
  dir = mkdtempSync(join(tmpdir(), "ftui-"));
  ui = await startServer({ port: 0, cwd: dir });
});

after(async () => {
  await ui.close();
  figma.closeAllConnections();
  figma.close();
  rmSync(dir, { recursive: true, force: true });
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(ui.url + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("zip: crc32 conhecido e assinatura PK", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const z = makeZip([{ name: "a.txt", content: "oi" }]);
  assert.equal(z.subarray(0, 2).toString(), "PK");
});

test("a página é servida", async () => {
  const res = await fetch(ui.url + "/");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /figma-handoff/);
});

test("scan sem token → 400; token errado → 502 com mensagem do Figma", async () => {
  delete process.env.FIGMA_TOKEN;
  const a = await post("/api/scan", { fileKey: "abc" });
  assert.equal(a.status, 400);
  const b = await post("/api/scan", { fileKey: "abc", token: "errado" });
  assert.equal(b.status, 502);
  assert.match((await b.json() as { error: string }).error, /403/);
});

test("scan lista componentes com código nos três formatos e avisa que não há tokens", async () => {
  const res = await post("/api/scan", { fileKey: "https://www.figma.com/design/abc/Meu-DS?node-id=0-1", token: "tok", prefix: "ds" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.fileName, "Meu Design System");
  assert.deepEqual(body.components.map((c: any) => c.slug), ["button", "card"]);
  const button = body.components[0];
  assert.equal(button.cls, "ds-button");
  assert.match(button.html, /<button class="ds-button"/);
  assert.match(button.css, /var\(--ds-color-primary-500, #3b82f6\)/);
  assert.match(button.react, /export function Button/);
  assert.match(button.blade, /<button/);
  assert.equal(body.tokens.length, 0);
  assert.match(body.tokensNote, /estilo/i);
});

test("generate grava só o selecionado, no formato escolhido, e salva a config", async () => {
  const res = await post("/api/generate", { slugs: ["button"], format: "react", output: "./out/comp", saveConfig: true, mode: "disk" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.ok(body.configSaved);
  assert.ok(existsSync(join(dir, "out/comp/Button.tsx")));
  assert.ok(existsSync(join(dir, "out/comp/button.css")));
  assert.ok(!existsSync(join(dir, "out/comp/card.css")), "card não foi selecionado");
  const cfg = JSON.parse(readFileSync(join(dir, "figma-handoff.config.json"), "utf8"));
  assert.equal(cfg.fileKey, "abc");
  assert.equal(cfg.components.format, "react");
});

test("generate em modo zip devolve um ZIP", async () => {
  const res = await post("/api/generate", { slugs: ["button", "card"], format: "html", mode: "zip" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/zip");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), "PK");
  assert.ok(buf.includes(Buffer.from("components/button.html")));
});

test("segurança: caminho fora do projeto, host e origem estranhos são recusados", async () => {
  const a = await post("/api/generate", { slugs: ["button"], format: "html", output: "../fora", mode: "disk" });
  assert.equal(a.status, 400);
  assert.ok(!existsSync(join(dir, "../fora")));
  const raw = (headers: Record<string, string>, method = "GET", path = "/api/state") =>
    new Promise<number>((ok, bad) => {
      const u = new URL(ui.url);
      const r = http.request({ host: u.hostname, port: u.port, path, method, headers }, (res) => {
        res.resume();
        ok(res.statusCode ?? 0);
      });
      r.on("error", bad);
      r.end(method === "POST" ? "{}" : undefined);
    });
  const u = new URL(ui.url);
  assert.equal(await raw({ host: "evil.example" }), 403, "host estranho");
  assert.equal(await raw({ host: u.host, origin: "http://evil.example" }, "POST", "/api/generate"), 403, "origem estranha");
  assert.equal(await raw({ host: `localhost:${u.port}` }), 200, "localhost é permitido");
});
