import type { FigmaFile, FigmaNode, StyleMeta } from "./types.js";

const API = process.env.FIGMA_API_URL ?? "https://api.figma.com/v1";

export class FigmaError extends Error {}

async function request<T>(path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: { "X-Figma-Token": token } });
  } catch (err) {
    throw new FigmaError(`Não consegui falar com o Figma: ${(err as Error).message}`);
  }
  if (res.status === 403) {
    throw new FigmaError("O Figma recusou o token (403). Está válido e com acesso a esse arquivo?");
  }
  if (res.status === 404) {
    throw new FigmaError("Arquivo não encontrado (404). Confira a fileKey.");
  }
  if (res.status === 429) {
    throw new FigmaError("Limite de requisições do Figma atingido (429). Tente de novo em instantes.");
  }
  if (!res.ok) {
    throw new FigmaError(`O Figma respondeu ${res.status} ${res.statusText}.`);
  }
  return (await res.json()) as T;
}

/** Estilos PUBLICADOS na biblioteca do arquivo. */
export async function fetchStyles(fileKey: string, token: string): Promise<StyleMeta[]> {
  const data = await request<{ meta?: { styles?: StyleMeta[] } }>(`/files/${fileKey}/styles`, token);
  return data.meta?.styles ?? [];
}

/** Busca os nós em lotes para não estourar o tamanho da URL. */
export async function fetchNodes(
  fileKey: string,
  ids: string[],
  token: string,
): Promise<Record<string, FigmaNode>> {
  const result: Record<string, FigmaNode> = {};
  const BATCH = 50;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const query = encodeURIComponent(chunk.join(","));
    const data = await request<{ nodes: Record<string, { document: FigmaNode } | null> }>(
      `/files/${fileKey}/nodes?ids=${query}`,
      token,
    );
    for (const [id, entry] of Object.entries(data.nodes ?? {})) {
      if (entry?.document) result[id] = entry.document;
    }
  }
  return result;
}

/** Arquivo inteiro com a árvore de nós. Funciona no plano grátis, sem publicar nada. */
export async function fetchFile(fileKey: string, token: string): Promise<FigmaFile> {
  return request<FigmaFile>(`/files/${fileKey}`, token);
}
