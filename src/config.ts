import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentsConfig, Config } from "./types.js";

export const CONFIG_FILE = "figma-handoff.config.json";

export function loadConfig(cwd = process.cwd()): Config {
  const path = resolve(cwd, CONFIG_FILE);
  if (!existsSync(path)) {
    throw new Error(`${CONFIG_FILE} não encontrado. Rode "figma-handoff init" primeiro.`);
  }
  let raw: Partial<Config>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${CONFIG_FILE} não é um JSON válido.`);
  }
  if (!raw.fileKey) throw new Error(`"fileKey" ausente em ${CONFIG_FILE}.`);
  const comp = (raw as { components?: Partial<ComponentsConfig> }).components ?? {};
  const format = comp.format ?? "html";
  if (!["html", "blade", "react"].includes(format)) {
    throw new Error(`"components.format" inválido: "${format}". Use html, blade ou react.`);
  }
  return {
    fileKey: raw.fileKey,
    output: raw.output ?? "./tokens.css",
    prefix: raw.prefix ?? "",
    components: { output: comp.output ?? "./src/components", format },
  };
}

/** Parser mínimo de .env (KEY=VALUE), pra não depender do dotenv. */
export function loadEnvFile(cwd = process.cwd()): void {
  const path = resolve(cwd, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export function getToken(): string {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error("FIGMA_TOKEN não definido. Coloque no .env ou exporte na variável de ambiente.");
  }
  return token;
}

/** Config se existir e for válida; senão null. Usado pela interface. */
export function readConfigIfExists(cwd = process.cwd()): Config | null {
  try {
    return loadConfig(cwd);
  } catch {
    return null;
  }
}
