import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildComponents, componentFiles, reactName, writeComponents, type Generated } from "./components.js";
import { CONFIG_FILE, readConfigIfExists } from "./config.js";
import { generateCss } from "./css.js";
import { extractFileKey } from "./names.js";
import { toBlade, toReact } from "./render.js";
import { buildTokens } from "./tokens.js";
import type { ComponentFormat, Config, Token } from "./types.js";
import { makeZip } from "./zip.js";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Scan {
  config: Config;
  components: Generated[];
  tokens: Token[];
}

const INDEX = fileURLToPath(new URL("../ui/index.html", import.meta.url));
const FORMATS = ["html", "blade", "react"];

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((ok, bad) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 2_000_000) {
        bad(new HttpError(413, "Requisição grande demais."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        bad(new HttpError(400, "JSON inválido."));
      }
    });
    req.on("error", bad);
  });
}

function send(res: ServerResponse, status: number, body: string | Buffer, type: string, extra: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...extra });
  res.end(body);
}
const json = (res: ServerResponse, status: number, obj: unknown) =>
  send(res, status, JSON.stringify(obj), "application/json; charset=utf-8");

/** Só permite escrever dentro da pasta do projeto. */
function inside(cwd: string, path: string): string {
  const abs = resolve(cwd, path);
  if (abs !== cwd && !abs.startsWith(cwd + sep)) throw new HttpError(400, `Caminho fora do projeto: ${path}`);
  return abs;
}

const str = (v: unknown, def = "") => (typeof v === "string" ? v : def);

export function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* sem navegador: o usuário abre a URL na mão */
  }
}

export async function startServer(
  opts: { port?: number; cwd?: string } = {},
): Promise<{ url: string; port: number; close: () => Promise<void> }> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  let last: Scan | null = null;
  let actualPort = 0;

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // Anti DNS-rebinding / CSRF: só aceita falar com o próprio host local.
      const host = req.headers.host ?? "";
      if (host !== `127.0.0.1:${actualPort}` && host !== `localhost:${actualPort}`) {
        throw new HttpError(403, "Host não permitido.");
      }
      const origin = req.headers.origin;
      if (origin && origin !== `http://${host}`) throw new HttpError(403, "Origem não permitida.");

      const path = new URL(req.url ?? "/", "http://x").pathname;

      if (req.method === "GET" && path === "/") {
        return send(res, 200, readFileSync(INDEX), "text/html; charset=utf-8");
      }

      if (req.method === "GET" && path === "/api/state") {
        const cfg = readConfigIfExists(cwd);
        return json(res, 200, {
          hasConfig: !!cfg,
          hasEnvToken: !!process.env.FIGMA_TOKEN,
          fileKey: cfg?.fileKey ?? "",
          prefix: cfg?.prefix ?? "ds",
          format: cfg?.components.format ?? "html",
          componentsOutput: cfg?.components.output ?? "./src/components",
          tokensOutput: cfg?.output ?? "./src/css/tokens.css",
        });
      }

      if (req.method === "POST" && path === "/api/scan") {
        const body = await readBody(req);
        const fileKey = extractFileKey(str(body.fileKey));
        if (!fileKey) throw new HttpError(400, "Informe a URL ou a chave do arquivo do Figma.");
        const token = str(body.token).trim() || process.env.FIGMA_TOKEN || "";
        if (!token) throw new HttpError(400, "Informe o token do Figma (ou defina FIGMA_TOKEN no .env).");

        const saved = readConfigIfExists(cwd);
        const config: Config = {
          fileKey,
          output: saved?.output ?? "./src/css/tokens.css",
          prefix: typeof body.prefix === "string" ? body.prefix : (saved?.prefix ?? "ds"),
          components: saved?.components ?? { output: "./src/components", format: "html" },
        };

        let tokensNote: string | null = null;
        const tokensP = buildTokens(config, token).catch((e: Error) => {
          tokensNote = e.message;
          return { tokens: [] as Token[], warnings: [] as string[] };
        });
        let comp;
        try {
          comp = await buildComponents(config, token);
        } catch (e) {
          await tokensP;
          throw new HttpError(502, (e as Error).message);
        }
        const tok = await tokensP;
        if (!tok.tokens.length && !tokensNote) tokensNote = tok.warnings[0] ?? "Nenhum estilo publicado encontrado.";

        last = { config, components: comp.components, tokens: tok.tokens };
        return json(res, 200, {
          fileName: comp.fileName ?? "",
          warnings: comp.warnings,
          tokensNote,
          tokensWarnings: tok.warnings,
          tokensCss: tok.tokens.length ? generateCss(tok.tokens) : "",
          tokens: tok.tokens,
          components: comp.components.map((c) => ({
            slug: c.slug,
            name: c.name,
            cls: c.el.cls,
            css: c.css,
            html: c.html,
            blade: toBlade(c.el),
            react: toReact(c.el, c.slug, reactName(c.name)),
            reactFile: `${reactName(c.name)}.tsx`,
            warnings: c.warnings,
          })),
        });
      }

      if (req.method === "POST" && path === "/api/generate") {
        if (!last) throw new HttpError(400, "Carregue um arquivo do Figma primeiro.");
        const body = await readBody(req);
        const slugs = Array.isArray(body.slugs) ? body.slugs.map(String) : [];
        const chosen = last.components.filter((c) => slugs.includes(c.slug));
        const format = str(body.format, "html");
        if (!FORMATS.includes(format)) throw new HttpError(400, "Formato inválido.");
        const includeTokens = body.includeTokens === true && last.tokens.length > 0;
        if (!chosen.length && !includeTokens) throw new HttpError(400, "Nada selecionado.");

        const cfg: Config = {
          ...last.config,
          output: str(body.tokensOutput, last.config.output),
          components: {
            output: str(body.output, last.config.components.output),
            format: format as ComponentFormat,
          },
        };

        if (body.mode === "zip") {
          const files: Array<{ name: string; content: string }> = [];
          if (chosen.length) {
            for (const f of componentFiles(cfg, chosen, includeTokens ? "../tokens.css" : null)) {
              files.push({ name: `components/${f.name}`, content: f.content });
            }
          }
          if (includeTokens) files.push({ name: "tokens.css", content: generateCss(last.tokens) });
          return send(res, 200, makeZip(files), "application/zip", {
            "content-disposition": 'attachment; filename="figma-components.zip"',
          });
        }

        // Valida os caminhos antes de escrever qualquer coisa.
        inside(cwd, cfg.components.output);
        const tokensPath = inside(cwd, cfg.output);

        const written: string[] = [];
        if (chosen.length) {
          const dir = cfg.components.output.replace(/\/+$/, "");
          writeComponents(cfg, chosen, cwd).forEach((n) => written.push(`${dir}/${n}`));
        }
        if (includeTokens) {
          mkdirSync(dirname(tokensPath), { recursive: true });
          writeFileSync(tokensPath, generateCss(last.tokens));
          written.push(cfg.output);
        }
        let configSaved = false;
        if (body.saveConfig === true) {
          const out = { fileKey: cfg.fileKey, output: cfg.output, prefix: cfg.prefix, components: cfg.components };
          writeFileSync(resolve(cwd, CONFIG_FILE), JSON.stringify(out, null, 2) + "\n");
          configSaved = true;
        }
        return json(res, 200, { files: written, configSaved });
      }

      throw new HttpError(404, "Não encontrado.");
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      json(res, status, { error: (err as Error).message });
    }
  };

  if (!existsSync(INDEX)) throw new Error(`Arquivo da interface não encontrado: ${INDEX}`);

  const wanted = opts.port ?? 4173;
  for (let attempt = 0; attempt < 10; attempt++) {
    const server = createServer((req, res) => void handle(req, res));
    const port = wanted === 0 ? 0 : wanted + attempt;
    try {
      await new Promise<void>((ok, bad) => {
        server.once("error", bad);
        server.listen(port, "127.0.0.1", () => ok());
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") continue;
      throw e;
    }
    const addr = server.address();
    actualPort = typeof addr === "object" && addr ? addr.port : port;
    return {
      url: `http://127.0.0.1:${actualPort}`,
      port: actualPort,
      close: () => new Promise<void>((ok) => (server.closeAllConnections?.(), server.close(() => ok()))),
    };
  }
  throw new Error(`Nenhuma porta livre a partir de ${wanted}.`);
}
