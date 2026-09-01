import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/api-logging";
import { getMaintenanceEnvelope } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export const GET = withApiLogging("maintenance.status", async function GET() {
  const payload = await getMaintenanceEnvelope();
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
});
