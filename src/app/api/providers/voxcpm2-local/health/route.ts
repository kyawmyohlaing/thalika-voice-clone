import { NextResponse } from "next/server";
import { checkLocalVoxCPM2Health } from "@/lib/providers/voxcpm2-local-health";

export const runtime = "nodejs";

export async function GET() {
  const health = await checkLocalVoxCPM2Health();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
