export type Lab = [number, number, number];
export interface PaletteColor { lab: Lab; hex: string; weight: number }
export interface FrameDescriptor {
  weight: number;
  layout: number[][];
  mask: number[];
  edges: number[];
  silhouetteInformative: boolean;
}
export interface VisualDescriptor {
  palette: PaletteColor[];
  histogram: number[];
  frames: FrameDescriptor[];
  animated: boolean;
  sampledFrames: number;
  empty: boolean;
  phash: string | null;
}
export interface Distances {
  histogram: number;
  color: number;
  layout: number;
  silhouette: number | null;
  edges: number | null;
  visual: number;
}
export interface SimilarityNeighbor { id: string; distance: number; components: Distances }
export interface SimilarityEntry {
  palette: PaletteColor[];
  color: SimilarityNeighbor[];
  visual: SimilarityNeighbor[];
}
export interface SimilarityIndex {
  version: string;
  catalogHash: string;
  entries: Record<string, SimilarityEntry>;
}
