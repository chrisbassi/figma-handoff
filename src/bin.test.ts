import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Regressão: "sh: figma-handoff: Permission denied" quando dist/cli.js sai do build sem bit de execução.
test("dist/cli.js sai do build executável", { skip: process.platform === "win32" }, () => {
  const mode = statSync(new URL("./cli.js", import.meta.url)).mode;
  assert.ok((mode & 0o111) !== 0, `modo ${(mode & 0o777).toString(8)} não tem bit de execução`);
});

// Regressão: a versão do --version vinha escrita à mão no cli.ts e divergia do package.json.
test("--version é a versão do package.json", () => {
  const cli = new URL("./cli.js", import.meta.url);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  const out = spawnSync(process.execPath, [fileURLToPath(cli), "--version"], { encoding: "utf8" });
  assert.equal(out.stdout.trim(), pkg.version);
});
