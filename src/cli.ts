#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { CONFIG_FILE, getToken, loadConfig, loadEnvFile } from "./config.js";
import { generateCss } from "./css.js";
import { compareVars, isEmpty, parseVars } from "./diff.js";
import { extractFileKey } from "./names.js";
import { buildComponents, writeComponents } from "./components.js";
import { openBrowser, startServer } from "./server.js";
import { buildTokens } from "./tokens.js";
import type { ComponentFormat, Config } from "./types.js";

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s: string) => paint(32, s);
const red = (s: string) => paint(31, s);
const yellow = (s: string) => paint(33, s);
const dim = (s: string) => paint(2, s);

async function generate(config: Config) {
  const { tokens, warnings } = await buildTokens(config, getToken());
  warnings.forEach((w) => console.warn(yellow(`! ${w}`)));
  return { tokens, css: generateCss(tokens) };
}

function readOutput(config: Config): string {
  const path = resolve(process.cwd(), config.output);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function printDiff(config: Config, css: string): boolean {
  const diff = compareVars(parseVars(readOutput(config)), parseVars(css));
  if (isEmpty(diff)) return false;
  for (const [n, v] of diff.added) console.log(green(`+ ${n}: ${v}`));
  for (const [n, v] of diff.removed) console.log(red(`- ${n}: ${v}`));
  for (const c of diff.changed) console.log(yellow(`~ ${c.name}: ${c.from} -> ${c.to}`));
  return true;
}

async function runSync(config: Config) {
  const { tokens, css } = await generate(config);
  if (tokens.length === 0) {
    console.log("Nada para escrever.");
    return;
  }
  const out = resolve(process.cwd(), config.output);
  const changed = readOutput(config) !== css;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, css);

  const count = (g: string) => tokens.filter((t) => t.group === g).length;
  const styles = new Set(tokens.filter((t) => t.group === "text").map((t) => t.name.replace(/-(family|size|weight|line-height|letter-spacing)$/, "")));
  console.log(green(`✔ ${count("color")} cores`));
  console.log(green(`✔ ${styles.size} estilos de texto`));
  console.log(green(`✔ ${count("shadow")} sombras`));
  console.log(`→ ${config.output} ${changed ? "atualizado" : dim("(sem mudanças)")}`);
}

function fail(err: unknown): never {
  console.error(red(`✖ ${(err as Error).message}`));
  process.exit(1);
}

const program = new Command();
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

program
  .name("figma-handoff")
  .description("Do Figma ao código: lista os componentes, gera CSS + HTML/Blade/React e extrai tokens.")
  .version(pkg.version);

program
  .command("init")
  .description(`Cria o ${CONFIG_FILE} e o .env`)
  .action(async () => {
    try {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = async (q: string, def = "") => (await rl.question(def ? `${q} (${def}): ` : `${q}: `)).trim() || def;

      const fileKey = extractFileKey(await ask("URL ou chave do arquivo no Figma"));
      const output = await ask("Arquivo de saída", "./src/css/tokens.css");
      const prefix = await ask("Prefixo das variáveis (opcional)", "ds");
      const needsToken = !existsSync(".env") || !/FIGMA_TOKEN\s*=\s*\S/.test(readFileSync(".env", "utf8"));
      const token = needsToken ? await ask("Token pessoal do Figma") : "";
      rl.close();

      if (!fileKey) throw new Error("A chave do arquivo é obrigatória.");
      writeFileSync(CONFIG_FILE, JSON.stringify(
          { fileKey, output, prefix, components: { output: "./src/components", format: "html" } },
          null,
          2,
        ) + "\n");
      console.log(green(`✔ ${CONFIG_FILE} criado`));

      if (token) {
        appendFileSync(".env", `${existsSync(".env") ? "\n" : ""}FIGMA_TOKEN=${token}\n`);
        console.log(green("✔ token salvo no .env"));
      }
      const gi = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
      if (!/^\.env$/m.test(gi)) {
        appendFileSync(".gitignore", `${gi && !gi.endsWith("\n") ? "\n" : ""}.env\n`);
        console.log(green("✔ .env adicionado ao .gitignore"));
      }
      console.log(dim("Próximo passo: figma-handoff sync"));
    } catch (err) {
      fail(err);
    }
  });

program
  .command("sync")
  .description("Busca os estilos no Figma e atualiza o CSS")
  .option("-w, --watch [minutos]", "re-sincroniza a cada N minutos (padrão 5)")
  .action(async (opts: { watch?: boolean | string }) => {
    try {
      loadEnvFile();
      const config = loadConfig();
      await runSync(config);
      if (opts.watch) {
        const minutes = opts.watch === true ? 5 : Math.max(1, Number(opts.watch) || 5);
        console.log(dim(`Observando a cada ${minutes} min. Ctrl+C pra sair.`));
        setInterval(() => runSync(config).catch((e) => console.error(red(`✖ ${e.message}`))), minutes * 60_000);
      }
    } catch (err) {
      fail(err);
    }
  });

program
  .command("diff")
  .description("Mostra o que mudou no Figma desde o último sync (exit 1 se houver diferença)")
  .action(async () => {
    try {
      loadEnvFile();
      const config = loadConfig();
      const { css } = await generate(config);
      if (!printDiff(config, css)) {
        console.log(green("✔ Tudo em dia, nada mudou."));
        return;
      }
      process.exitCode = 1;
    } catch (err) {
      fail(err);
    }
  });

program
  .command("components")
  .description("Gera um CSS e um elemento (HTML, Blade ou React) para cada componente do Figma")
  .option("-f, --format <formato>", "html | blade | react (padrão: o do config, ou html)")
  .option("-o, --output <pasta>", "pasta de saída (padrão: components.output do config)")
  .option("--only <nomes...>", "só componentes cujo nome contenha algum destes textos")
  .option("--list", "só lista os componentes encontrados, sem escrever nada")
  .action(async (opts: { format?: string; output?: string; only?: string[]; list?: boolean }) => {
    try {
      loadEnvFile();
      const config = loadConfig();
      if (opts.format) {
        if (!["html", "blade", "react"].includes(opts.format)) throw new Error("Formato inválido. Use html, blade ou react.");
        config.components.format = opts.format as ComponentFormat;
      }
      if (opts.output) config.components.output = opts.output;

      const { components, warnings } = await buildComponents(config, getToken(), opts.only);
      warnings.forEach((w) => console.warn(yellow(`! ${w}`)));
      if (components.length === 0) return;

      if (opts.list) {
        components.forEach((c) => console.log(`${c.slug}  ${dim(`(${c.name})`)}`));
        return;
      }
      const files = writeComponents(config, components);
      components.forEach((c) => console.log(green(`✔ ${c.name}`) + dim(`  .${c.el.cls}`)));
      console.log(`→ ${files.length} arquivos em ${config.components.output} ${dim("(abra o preview.html)")}`);
    } catch (err) {
      fail(err);
    }
  });

program
  .command("ui")
  .description("Abre a interface web local (lista e prévia dos componentes antes de gerar)")
  .option("-p, --port <porta>", "porta (padrão 4173)", "4173")
  .option("--no-open", "não abrir o navegador sozinho")
  .action(async (opts: { port: string; open: boolean }) => {
    try {
      loadEnvFile();
      const { url } = await startServer({ port: Number(opts.port) || 4173 });
      console.log(green(`✔ Interface em ${url}`));
      console.log(dim("Ctrl+C pra encerrar. O token só trafega entre o navegador e este processo local."));
      if (opts.open) openBrowser(url);
    } catch (err) {
      fail(err);
    }
  });

program.parseAsync();
