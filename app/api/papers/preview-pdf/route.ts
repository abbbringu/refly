import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rateLimit = checkApiRateLimit(request, user.id, "default")
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit)
  }

  const paperId = request.nextUrl.searchParams.get("paperId")
  if (!paperId) {
    return NextResponse.json({ error: "Missing paperId" }, { status: 400 })
  }

  const { data: paper, error: paperError } = await supabase
    .from("papers")
    .select("id")
    .eq("id", paperId)
    .single()

  if (paperError || !paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 })
  }

  const { data: file, error: fileError } = await supabase
    .from("paper_files")
    .select("file_path, file_name")
    .eq("paper_id", paperId)
    .eq("mime_type", "application/pdf")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (fileError || !file?.file_path) {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 })
  }

  const { data: pdfBlob, error: downloadError } = await supabase.storage
    .from("papers")
    .download(file.file_path)

  if (downloadError || !pdfBlob) {
    return NextResponse.json({ error: "Failed to load PDF" }, { status: 500 })
  }

  const fileName = (file.file_name || "paper.pdf").replace(/"/g, "")

  return new NextResponse(pdfBlob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, max-age=120",
    },
  })
}
