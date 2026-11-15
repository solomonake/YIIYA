import type { QualityReward } from "@/lib/scene/quality-reward";
import { assetStorageStatus } from "@/lib/assets/storage-status";

const labels: Record<string, string> = {
  usable_geometry_metadata: "Geometry counts and bounds",
  normal_attribute_present: "Normal data found",
  appearance_metadata_present: "Texture or vertex color data found",
  bounded_preview_complexity: "Within preview triangle budget"
};

export function AssetQualitySummary({ report, glbUrl }: { report?: QualityReward; glbUrl: string }) {
  const temporary = assetStorageStatus(glbUrl) === "temporary";
  if (!report && !temporary) return null;
  return (
    <>
    {temporary && <p className="mb-2 text-xs text-amber-300">This model uses temporary storage. Download it now to keep a copy.</p>}
    {report && (
    <details className="mb-3 text-xs text-zinc-300" onClick={event => event.stopPropagation()}>
      <summary className="cursor-pointer py-1">Mesh checks</summary>
      <ul className="mt-1 space-y-1">
        {report.checks.map(check => (
          <li key={check.name}>{check.passed ? "✓" : "—"} {labels[check.name] ?? check.name}</li>
        ))}
      </ul>
      <p className="mt-2 text-zinc-400">Photo match, unseen surfaces and printability have not been evaluated.</p>
    </details>
    )}
    </>
  );
}
