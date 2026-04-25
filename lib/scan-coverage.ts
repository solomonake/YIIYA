export type CoverageCell = {
  id: string;
  label: string;
  covered: boolean;
  confidence: number;
};

export type CoverageSilhouette = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CoverageFrame = {
  coverage: CoverageCell[];
  confidence: number;
  previewDataUrl?: string;
  objectHint?: string;
  updatedAt: string;
  depthScore?: number;
  guidance?: string;
  silhouette?: CoverageSilhouette;
};

const coverageLabels = [
  "top-left",
  "top-center",
  "top-right",
  "mid-left",
  "mid-center",
  "mid-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "front-depth",
  "mid-depth",
  "rear-depth"
];

export function emptyCoverage(): CoverageCell[] {
  return coverageLabels.map((label, index) => ({
    id: `coverage-${index}`,
    label,
    covered: false,
    confidence: 0
  }));
}

export function mergeCoverage(
  current: CoverageCell[],
  incoming: CoverageCell[]
): CoverageCell[] {
  return current.map((cell) => {
    const next = incoming.find((item) => item.id === cell.id);

    if (!next) {
      return cell;
    }

    return {
      ...cell,
      covered: cell.covered || next.covered,
      confidence: Math.max(cell.confidence, next.confidence)
    };
  });
}

export function coverageConfidence(cells: CoverageCell[]) {
  const filled = cells.filter((cell) => cell.covered).length;
  return Number((filled / Math.max(1, cells.length)).toFixed(2));
}

export function surfaceCoverageConfidence(cells: CoverageCell[]) {
  return coverageConfidence(cells.slice(0, 9));
}

export function clippedEdges(silhouette?: CoverageSilhouette | null) {
  if (!silhouette) {
    return {
      left: false,
      right: false,
      top: false,
      bottom: false
    };
  }

  const margin = 0.06;

  return {
    left: silhouette.x <= margin,
    right: silhouette.x + silhouette.width >= 1 - margin,
    top: silhouette.y <= margin,
    bottom: silhouette.y + silhouette.height >= 1 - margin
  };
}
