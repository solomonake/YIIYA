export type CoverageCell = {
  id: string;
  label: string;
  covered: boolean;
  confidence: number;
};

export type CoverageFrame = {
  coverage: CoverageCell[];
  confidence: number;
  previewDataUrl?: string;
  objectHint?: string;
  updatedAt: string;
};

const coverageLabels = [
  "front",
  "front-right",
  "right",
  "back-right",
  "back",
  "back-left",
  "left",
  "front-left"
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
