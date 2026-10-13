// O tsc grava dist/cli.js sem bit de execução (644). Quem roda "figma-handoff" direto,
// via npx ou npm link, recebe "Permission denied" se o npm não conseguir consertar isso.
// Ligar o bit aqui faz o build resolver sozinho, sem depender da versão do npm nem do dono da pasta.
import { chmodSync, existsSync } from "node:fs";

const bin = new URL("../dist/cli.js", import.meta.url);

if (!existsSync(bin)) {
  console.error("postbuild: dist/cli.js não existe. O tsc falhou?");
  process.exit(1);
}

try {
  chmodSync(bin, 0o755);
} catch (err) {
  // Windows ignora bits de execução, e uma pasta somente leitura não deve derrubar o build.
  console.warn(`postbuild: não consegui dar permissão de execução (${err.code ?? err.message}).`);
}
