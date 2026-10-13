# figma-handoff

[![CI](https://github.com/seu-usuario-do-github/figma-handoff/actions/workflows/ci.yml/badge.svg)](https://github.com/seu-usuario-do-github/figma-handoff/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)
![Node 20+](https://img.shields.io/badge/node-20%2B-339933)

Do Figma ao código. Carrega um arquivo do Figma, mostra a prévia de cada componente e gera um CSS próprio mais o HTML, o Blade ou o React. Também extrai cores, tipografia e sombras como variáveis CSS.

**[Ver a demonstração](https://seu-usuario-do-github.github.io/figma-handoff/demo/)** (arquivo de exemplo, roda no navegador, não precisa de token)

- **Lista os componentes antes de gerar qualquer coisa**, com prévia renderizada e a lista do que não foi convertido.
- **Funciona no plano grátis do Figma.** Lê o arquivo direto, sem exigir biblioteca publicada.
- **Um CSS por componente**, com classes em BEM a partir do nome das camadas.
- **Saída em HTML, Blade (Laravel) ou React (.tsx).**
- **Roda na sua máquina.** O token do Figma não passa por nenhum servidor de terceiros.

## Instalação

Precisa de Node.js 20 ou superior e de um [token pessoal do Figma](https://www.figma.com/developers/api#access-tokens) com permissão de leitura de arquivos (Settings, Security, Personal access tokens).

```bash
git clone https://github.com/seu-usuario-do-github/figma-handoff.git
cd figma-handoff
npm install
npm run ui
```

A interface abre em `http://127.0.0.1:4173`.

## Como usar a interface

1. Cole a URL do arquivo do Figma e o token. Se existir um `.env` com `FIGMA_TOKEN`, o token é opcional.
2. Clique em **Carregar componentes**. A página lista tudo com prévia renderizada.
3. Marque os componentes que quer (ou filtre por nome). Clique numa prévia para ver o código em HTML, CSS, React e Blade, trocar o fundo e copiar.
4. As abas **Tokens** e **Avisos** mostram as variáveis encontradas e o que não foi convertido.
5. Escolha o formato e clique em **Salvar no projeto** (grava na pasta, relativa a onde você rodou o comando) ou em **Baixar ZIP**.

## Linha de comando

Direto da pasta do projeto, use `node dist/cli.js` (rode `npm run build` antes). Se preferir o comando `figma-handoff`, rode `npm link` uma vez.

```bash
node dist/cli.js init                        # cria figma-handoff.config.json e guarda o token no .env
node dist/cli.js components                  # um CSS + um elemento por componente
node dist/cli.js components -f react         # Button.tsx + button.css
node dist/cli.js components -f blade         # button.blade.php + button.css
node dist/cli.js components --only button    # só os componentes com "button" no nome
node dist/cli.js components --list           # só lista, não escreve nada
node dist/cli.js sync                        # gera o tokens.css (--watch [minutos] re-sincroniza)
node dist/cli.js diff                        # o que mudou no Figma desde o último sync
node dist/cli.js ui -p 5000                  # interface em outra porta (--no-open não abre o navegador)
```

`diff` sai com código 1 quando há diferença, então serve em CI. O `.env` fica fora do git: o `init` adiciona ao `.gitignore`.

### Configuração

`figma-handoff.config.json` (todos os campos, menos `fileKey`, são opcionais):

```json
{
  "fileKey": "abc123XYZ",
  "output": "./src/css/tokens.css",
  "prefix": "ds",
  "components": { "output": "./src/components", "format": "html" }
}
```

O token vem de `FIGMA_TOKEN`, no `.env` ou no ambiente. Não commite o `.env`.

## O que o código gerado faz

Exemplo (trecho), a partir de um componente chamado `Button`:

```html
<button class="ds-button" type="button">
  <span class="ds-button__label">Comprar agora</span>
</button>
```

```css
.ds-button {
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  gap: 8px;
  padding: 10px 18px;
  justify-content: center;
  align-items: center;
  background: var(--ds-color-primary-600, #4b3fd6);
  border-radius: 10px;
}
```

- **Auto-layout vira flexbox:** direção, espaçamento, padding, alinhamento, quebra de linha e tamanhos fixo, hug e fill. Camadas fora de auto-layout ficam em `position: absolute`.
- **Classes em BEM**, a partir do nome das camadas: `.ds-button__label`. Camadas chamadas "Frame 12" geram `.ds-button__frame-12`, então nomear direito no Figma melhora o código.
- **Estilos do Figma viram variáveis** (`var(--ds-color-primary-600, #4b3fd6)`), com o valor literal de reserva. O componente funciona mesmo sem o `tokens.css`.
- **Tags semânticas:** o componente vira `<button>` se o nome tiver *button*, *btn* ou *botão*, e `<a>` se tiver *link*. Instâncias aninhadas com esses nomes também, e nunca um `<button>` dentro de outro.
- **Variantes** (Component Sets) viram um componente por variante: `Badge/Tone=Success` vira `badge-tone-success`.
- Rodar de novo reescreve os arquivos. O diff do git mostra o que o design mudou.

### Nomes dos tokens

| No Figma | Variável |
| --- | --- |
| Estilo de cor `Primary/600` | `--ds-color-primary-600` |
| Estilo de texto `Heading/H3` | `--ds-text-heading-h3-{family,size,weight,line-height,letter-spacing}` |
| Estilo de efeito `Shadow/Card` | `--ds-shadow-card` |

Acentos e símbolos são removidos. Um segmento inicial que repete o tipo (`Shadow/Card`) não é duplicado. Nomes repetidos ganham sufixo (`-2`) e um aviso.

### Conversões

- **Cor:** float de 0 a 1 vira hex; com transparência vira `rgba()`. Gradiente linear funciona.
- **Fonte:** px vira `rem` (base 16). Line-height vira número sem unidade. Letter-spacing vira `em`.
- **Sombras:** `DROP_SHADOW` e `INNER_SHADOW` viram `box-shadow`, e várias sombras são separadas por vírgula.

## Limitações

- **Ícones e vetores** viram um espaço reservado do tamanho certo, com aviso. Exportar SVG é o próximo passo.
- **O texto sai fixo**, igual ao do design, sem props. Instâncias e overrides não são interpretados.
- **Os tokens (`sync`, `diff` e a aba Tokens) dependem de estilos publicados** na biblioteca do arquivo, e publicar biblioteca é recurso de plano pago do Figma. Os componentes não dependem disso.
- **Layout sem auto-layout** reproduz o design em posição absoluta, então não é responsivo.
- Imagens de fundo e gradientes radiais são ignorados com aviso. Rotação, máscaras e *constraints* também.
- Espaçamento não existe como estilo no Figma, então não vira token.

## Segurança

A interface é um servidor local. Ele escuta só em `127.0.0.1`, recusa `Host` e `Origin` que não sejam os dele, só grava dentro da pasta do projeto e não guarda o token: ele vive só na requisição de carregamento. O Figma bloqueia chamadas direto do navegador, e é por isso que existe um servidor local em vez de um site.

## Desenvolvimento

```bash
npm install
npm test            # compila e roda os testes
npm run ui          # compila e abre a interface
npm run build:site  # gera o site do GitHub Pages em _site/
```

```
src/         código em TypeScript (conversão, servidor local, CLI) e os testes
ui/          a interface web (um arquivo HTML)
examples/    arquivo Figma de exemplo, no formato da API
pages/       a landing page do site
scripts/     build do site e ajuste de permissão do binário
```

### Site e demonstração

O GitHub Pages hospeda só arquivos estáticos, então a ferramenta em si não roda lá. O que vai para o Pages (`npm run build:site`) é a landing page e uma demonstração da interface. A demonstração **não é um mockup**: o script sobe um Figma de mentira com `examples/sample-file.mjs`, roda o servidor real contra ele e guarda a resposta como JSON. Se o pipeline quebrar, o build do site quebra, e o CI avisa.

Para publicar: em *Settings, Pages*, escolha *Source: GitHub Actions*. O workflow `.github/workflows/pages.yml` faz o resto a cada push na `main`.

### Erro `Permission denied` ao rodar o binário

O `npm run build` já liga o bit de execução do `dist/cli.js`. Se ainda aparecer, rode `npm run build` de novo ou `chmod +x dist/cli.js`, e confira se a pasta não está num disco montado com `noexec`.

## Roadmap

- Exportar ícones como SVG
- Props nos componentes (texto e variantes como parâmetros)
- Variantes como modificadores de uma única classe
- Tokens a partir do arquivo, sem precisar publicar a biblioteca
- Saída SCSS e JSON
- Publicar no npm, para `npx figma-handoff`

## Licença

[MIT](LICENSE), por Chris Bassi.
