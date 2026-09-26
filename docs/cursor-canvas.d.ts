/**
 * Ambient types for Cursor Canvas (.canvas.tsx) files.
 * `cursor/canvas` is provided by the Cursor host at preview time — not an npm package.
 */
declare module "cursor/canvas" {
  import type { CSSProperties, FC, ReactNode } from "react";

  export type CanvasTextTone = "primary" | "secondary" | "tertiary";
  export type CanvasPillTone =
    | "success"
    | "info"
    | "neutral"
    | "warning"
    | "danger";
  export type CanvasStatTone = "success" | "info" | "warning";

  export type HostTheme = {
    bg: { elevated: string };
    text: { primary: string; secondary: string; tertiary: string };
    stroke: { tertiary: string; secondary: string };
    fill: { primary: string; tertiary: string; quaternary: string };
    accent: { primary: string };
    diff: { stripAdded: string };
  };

  export function useHostTheme(): HostTheme;

  type WithChildren = { children?: ReactNode };
  type StackProps = WithChildren & { gap?: number; style?: CSSProperties };
  type RowProps = StackProps & {
    align?: "center" | "start" | "end";
    wrap?: boolean;
  };
  type TextProps = WithChildren & {
    size?: "small" | "medium";
    tone?: CanvasTextTone;
  };
  type GridProps = WithChildren & { columns?: number; gap?: number };
  type StatProps = {
    value: ReactNode;
    label: ReactNode;
    tone?: CanvasStatTone;
  };
  type CalloutProps = WithChildren & {
    tone?: "info" | "warning" | "success";
    title?: ReactNode;
  };
  type PillProps = WithChildren & {
    tone?: CanvasPillTone;
    size?: "sm" | "md";
  };
  type TableProps = {
    headers: ReactNode[];
    rows: ReactNode[][];
    rowTone?: CanvasPillTone[];
  };

  export const Stack: FC<StackProps>;
  export const Row: FC<RowProps>;
  export const Spacer: FC;
  export const Text: FC<TextProps>;
  export const H1: FC<WithChildren>;
  export const H2: FC<WithChildren>;
  export const H3: FC<WithChildren>;
  export const Grid: FC<GridProps>;
  export const Stat: FC<StatProps>;
  export const Callout: FC<CalloutProps>;
  export const Divider: FC;
  export const Card: FC<WithChildren>;
  export const CardHeader: FC<WithChildren>;
  export const CardBody: FC<WithChildren>;
  export const Pill: FC<PillProps>;
  export const Table: FC<TableProps>;
}
