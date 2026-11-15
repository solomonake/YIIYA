import { getScanAccess } from "@/lib/scan-job-store";
import { getUserIdFromAuthHeader } from "@/lib/auth/verify-request";
import { verifyScanToken } from "./scan-capability";

/** Job IDs are locators, never credentials. No external dispatch or mutation here. */
export async function authorizeScanAccess(request: Request, scanId: string): Promise<Response | null> {
  const token = request.headers.get("x-yiiya-scan-token");
  const userId = await getUserIdFromAuthHeader(request);
  if (!userId && !token) return Response.json({ error: "Open the original scan link or sign in as its owner." }, { status: 401 });
  try {
    const access = await getScanAccess(scanId);
    if (access && ((userId && access.ownerId === userId) || verifyScanToken(token, access.tokenHash, access.expiresAt))) return null;
    return Response.json({ error: "Scan access is unavailable or expired. Open a new scan link." }, { status: 403 });
  } catch {
    return Response.json({ error: "Scan access could not be verified. Try again later." }, { status: 503 });
  }
}
