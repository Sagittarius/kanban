import { NextResponse } from "next/server";
import { getMaintenanceEnvelope } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getMaintenanceEnvelope();
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
