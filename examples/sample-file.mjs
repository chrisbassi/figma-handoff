// Arquivo do Figma de exemplo, no mesmo formato que a API REST devolve.
// Serve para a demonstração do site e para testar o pipeline sem token.
// Escrito com funções pequenas para ficar legível: cada componente é um bloco.

const rgb = (r, g, b, a) => ({ r: r / 255, g: g / 255, b: b / 255, ...(a === undefined ? {} : { a }) });

export const COLORS = {
  primary: rgb(75, 63, 214),
  primarySoft: rgb(238, 236, 255),
  primaryLine: rgb(199, 194, 250),
  ink: rgb(22, 26, 46),
  muted: rgb(92, 99, 125),
  line: rgb(216, 219, 230),
  white: rgb(255, 255, 255),
  ok: rgb(21, 128, 61),
  okBg: rgb(220, 252, 231),
  warn: rgb(161, 98, 7),
  warnBg: rgb(254, 243, 199),
  danger: rgb(185, 28, 28),
  dangerBg: rgb(254, 226, 226),
};

let seq = 0;
const nid = () => `${++seq}:${seq}`;
const solid = (color) => ({ type: "SOLID", color });
const box = (x, y, width, height) => ({ x, y, width, height });

const text = (name, characters, o) => ({
  id: nid(),
  name,
  type: "TEXT",
  characters,
  fills: [solid(o.color)],
  style: {
    fontFamily: "Inter",
    fontSize: o.size,
    fontWeight: o.weight,
    lineHeightPx: o.lh,
    textAutoResize: o.resize ?? "WIDTH_AND_HEIGHT",
  },
  styles: { text: o.textStyle, fill: o.fillStyle },
  layoutSizingHorizontal: o.h ?? "HUG",
  layoutSizingVertical: "HUG",
  absoluteBoundingBox: box(o.x ?? 0, o.y ?? 0, o.w ?? 80, o.lh),
});

const vector = (name, size) => ({
  id: nid(),
  name,
  type: "VECTOR",
  layoutSizingHorizontal: "FIXED",
  layoutSizingVertical: "FIXED",
  absoluteBoundingBox: box(0, 0, size, size),
});

const frame = (name, type, o, children = []) => ({
  id: nid(),
  name,
  type,
  layoutMode: o.dir ?? "HORIZONTAL",
  primaryAxisAlignItems: o.main ?? "MIN",
  counterAxisAlignItems: o.cross ?? "MIN",
  itemSpacing: o.gap ?? 0,
  paddingTop: o.pad?.[0] ?? 0,
  paddingRight: o.pad?.[1] ?? 0,
  paddingBottom: o.pad?.[2] ?? 0,
  paddingLeft: o.pad?.[3] ?? 0,
  layoutSizingHorizontal: o.h ?? "HUG",
  layoutSizingVertical: o.v ?? "HUG",
  fills: o.fill ? [solid(o.fill)] : [],
  strokes: o.stroke ? [solid(o.stroke)] : undefined,
  strokeWeight: o.stroke ? (o.strokeWeight ?? 1) : undefined,
  cornerRadius: o.radius,
  effects: o.effects,
  styles: o.styles,
  absoluteBoundingBox: box(0, 0, o.w ?? 100, o.height ?? 40),
  children,
});

const TEXT_LABEL = { size: 15, weight: 600, lh: 20, textStyle: "T:label" };

const button = (variant, { type = "COMPONENT", name, h } = {}) => {
  const primary = variant === "Primary";
  return frame(
    name ?? `Variant=${variant}`,
    type,
    {
      main: "CENTER",
      cross: "CENTER",
      gap: 8,
      pad: [10, 18, 10, 18],
      radius: 10,
      h,
      fill: primary ? COLORS.primary : COLORS.white,
      stroke: primary ? undefined : COLORS.primary,
      strokeWeight: 1.5,
      styles: primary ? { fill: "F:primary" } : { stroke: "F:primary" },
    },
    [
      text("Label", "Comprar agora", {
        ...TEXT_LABEL,
        color: primary ? COLORS.white : COLORS.primary,
        fillStyle: primary ? undefined : "F:primary",
        w: 100,
      }),
    ],
  );
};

const badge = (tone, label, { type = "COMPONENT", name } = {}) => {
  const palette = { Success: [COLORS.okBg, COLORS.ok], Warning: [COLORS.warnBg, COLORS.warn], Danger: [COLORS.dangerBg, COLORS.danger] }[tone];
  return frame(
    name ?? `Tone=${tone}`,
    type,
    { main: "CENTER", cross: "CENTER", pad: [4, 10, 4, 10], radius: 999, fill: palette[0] },
    [text("Text", label, { size: 12, weight: 600, lh: 16, color: palette[1], w: 60 })],
  );
};

const buttonSet = {
  id: nid(),
  name: "Button",
  type: "COMPONENT_SET",
  children: [button("Primary"), button("Secondary")],
};

const badgeSet = {
  id: nid(),
  name: "Badge",
  type: "COMPONENT_SET",
  children: [badge("Success", "Disponível"), badge("Warning", "Em revisão"), badge("Danger", "Esgotado")],
};

const card = frame(
  "Card",
  "COMPONENT",
  {
    dir: "VERTICAL",
    gap: 12,
    pad: [20, 20, 20, 20],
    radius: 16,
    h: "FIXED",
    w: 320,
    fill: COLORS.white,
    stroke: COLORS.line,
    effects: [
      { type: "DROP_SHADOW", color: rgb(22, 26, 46, 0.1), offset: { x: 0, y: 8 }, radius: 24, spread: 0 },
    ],
    styles: { effect: "E:card" },
  },
  [
    badge("Success", "Disponível", { type: "INSTANCE", name: "Badge" }),
    text("Title", "Plano profissional", { size: 20, weight: 600, lh: 28, color: COLORS.ink, textStyle: "T:h3", fillStyle: "F:ink", w: 200 }),
    text("Body", "Componentes ilimitados, tokens e a prévia de cada peça antes de gerar o código.", {
      size: 15,
      weight: 400,
      lh: 22,
      color: COLORS.muted,
      textStyle: "T:body",
      fillStyle: "F:muted",
      h: "FILL",
      resize: "HEIGHT",
      w: 280,
    }),
    button("Primary", { type: "INSTANCE", name: "Button", h: "FILL" }),
  ],
);

const input = frame(
  "Input",
  "COMPONENT",
  { cross: "CENTER", pad: [12, 14, 12, 14], radius: 10, h: "FIXED", w: 280, fill: COLORS.white, stroke: COLORS.line },
  [text("Placeholder", "voce@empresa.com.br", { size: 15, weight: 400, lh: 22, color: COLORS.muted, textStyle: "T:body", fillStyle: "F:muted", w: 160 })],
);

// Sem auto-layout de propósito: mostra o caminho de posição absoluta.
const avatar = {
  id: nid(),
  name: "Avatar",
  type: "COMPONENT",
  layoutMode: "NONE",
  layoutSizingHorizontal: "FIXED",
  layoutSizingVertical: "FIXED",
  cornerRadius: 20,
  fills: [solid(COLORS.primarySoft)],
  absoluteBoundingBox: box(0, 0, 40, 40),
  children: [text("Initials", "AB", { size: 15, weight: 600, lh: 20, color: COLORS.primary, textStyle: "T:label", fillStyle: "F:primary", x: 11, y: 10, w: 18 })],
};

// Dois vetores de propósito: mostram o aviso de ícones.
const alert = frame(
  "Alert",
  "COMPONENT",
  { cross: "CENTER", gap: 12, pad: [14, 16, 14, 16], radius: 12, h: "FIXED", w: 360, fill: COLORS.primarySoft, stroke: COLORS.primaryLine },
  [
    vector("Icon", 20),
    text("Message", "Arquivo carregado: 9 componentes encontrados.", {
      size: 15, weight: 400, lh: 22, color: COLORS.ink, textStyle: "T:body", fillStyle: "F:ink", h: "FILL", resize: "HEIGHT", w: 260,
    }),
    vector("Close", 16),
  ],
);

const document_ = {
  id: "0:0",
  name: "Document",
  type: "DOCUMENT",
  children: [{ id: "0:1", name: "Componentes", type: "CANVAS", children: [buttonSet, badgeSet, card, input, avatar, alert] }],
};

// Estilos publicados (o que alimenta os tokens).
const styleNodes = {
  "900:1": { fills: [solid(COLORS.primary)] },
  "900:2": { fills: [solid(COLORS.ink)] },
  "900:3": { fills: [solid(COLORS.muted)] },
  "900:4": { style: { fontFamily: "Inter", fontSize: 20, fontWeight: 600, lineHeightPx: 28 } },
  "900:5": { style: { fontFamily: "Inter", fontSize: 15, fontWeight: 400, lineHeightPx: 22 } },
  "900:6": { style: { fontFamily: "Inter", fontSize: 15, fontWeight: 600, lineHeightPx: 20 } },
  "900:7": { effects: [{ type: "DROP_SHADOW", color: rgb(22, 26, 46, 0.1), offset: { x: 0, y: 8 }, radius: 24, spread: 0 }] },
};

const published = [
  ["F:primary", "Primary/600", "900:1", "FILL"],
  ["F:ink", "Ink/900", "900:2", "FILL"],
  ["F:muted", "Muted/500", "900:3", "FILL"],
  ["T:h3", "Heading/H3", "900:4", "TEXT"],
  ["T:body", "Body/Regular", "900:5", "TEXT"],
  ["T:label", "Label/Medium", "900:6", "TEXT"],
  ["E:card", "Shadow/Card", "900:7", "EFFECT"],
];

export const sample = {
  file: {
    name: "Design system de exemplo",
    styles: Object.fromEntries(published.map(([id, name, , styleType]) => [id, { name, styleType }])),
    document: document_,
  },
  styleList: published.map(([key, name, node_id, style_type]) => ({ key, name, node_id, style_type })),
  nodes: Object.fromEntries(Object.entries(styleNodes).map(([id, document]) => [id, { document }])),
};
