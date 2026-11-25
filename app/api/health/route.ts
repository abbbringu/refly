import { NextResponse } from "next/server"
import { isSelfHostedMode } from "@/lib/config/self-hosted"

export async function GET() {
  return NextResponse.json({
    status: "ok",
    mode: isSelfHostedMode() ? "self-hosted" : "cloud",
  })
}
