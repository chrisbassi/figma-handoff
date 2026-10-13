export type ComponentFormat = "html" | "blade" | "react";

export interface ComponentsConfig {
  output: string;
  format: ComponentFormat;
}

export interface Config {
  fileKey: string;
  output: string;
  prefix: string;
  components: ComponentsConfig;
}

export type TokenGroup = "color" | "text" | "shadow";

export interface Token {
  name: string;
  value: string;
  group: TokenGroup;
}

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface FigmaPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  gradientStops?: Array<{ position: number; color: FigmaColor }>;
  gradientHandlePositions?: Array<{ x: number; y: number }>;
}

export interface FigmaEffect {
  type: string;
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}

export interface FigmaTextStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  italic?: boolean;
  textAlignHorizontal?: string;
  textCase?: string;
  textDecoration?: string;
  textAutoResize?: string;
}

export interface FigmaNode {
  fills?: FigmaPaint[];
  effects?: FigmaEffect[];
  style?: FigmaTextStyle;
}

export interface StyleMeta {
  key: string;
  name: string;
  node_id: string;
  style_type: "FILL" | "TEXT" | "EFFECT" | "GRID";
}

export interface StyleRef {
  name: string;
  styleType: string;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Nó da árvore completa do arquivo (GET /files/:key). */
export interface DocNode extends FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: DocNode[];
  absoluteBoundingBox?: Box;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  layoutWrap?: string;
  layoutPositioning?: "AUTO" | "ABSOLUTE";
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";
  layoutGrow?: number;
  layoutAlign?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  counterAxisSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  strokeDashes?: number[];
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  opacity?: number;
  clipsContent?: boolean;
  characters?: string;
  styles?: Record<string, string>;
}

export interface FigmaFile {
  name?: string;
  document: DocNode;
  styles?: Record<string, StyleRef>;
}
