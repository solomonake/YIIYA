import type { Metadata } from "next";

import { RecoveryPanel } from "@/components/recovery-panel";

export const metadata: Metadata = {
  title: "Page not found | YIIYA",
  description: "This YIIYA page does not exist. Start from Photo Studio, the hosted studio or the guide."
};

/**
 * Shown for any address that is not a route. Next sends it with a 404 status
 * and a noindex robots tag.
 */
export default function NotFound() {
  return (
    <RecoveryPanel eyebrow="404" title="This page is not here.">
      <p>The address may be mistyped, or the page may have moved. Choose a starting point below.</p>
    </RecoveryPanel>
  );
}
