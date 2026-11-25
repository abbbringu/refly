import { createClient } from "@/utils/supabase/client"

export interface RemoveFromFolderResult {
  removedCount: number
  failedIds: string[]
  errors: string[]
}

async function getDescendantFolderIds(
  supabase: ReturnType<typeof createClient>,
  rootFolderId: string,
): Promise<string[]> {
  const allIds = [rootFolderId]
  let currentIds = [rootFolderId]

  while (currentIds.length > 0) {
    const { data } = await supabase
      .from("folders")
      .select("id")
      .in("parent_id", currentIds)

    if (!data || data.length === 0) break

    currentIds = data.map((f: { id: string }) => f.id)
    allIds.push(...currentIds)
  }

  return allIds
}

export async function removePapersFromFolder(
  paperIds: string[],
  folderId: string,
): Promise<RemoveFromFolderResult> {
  const ids = Array.from(new Set(paperIds.filter(Boolean)))

  if (ids.length === 0) {
    return { removedCount: 0, failedIds: [], errors: [] }
  }

  const supabase = createClient()

  const folderIds = await getDescendantFolderIds(supabase, folderId)

  const { error, count } = await supabase
    .from("paper_folders")
    .delete({ count: "exact" })
    .in("paper_id", ids)
    .in("folder_id", folderIds)

  if (error) {
    return {
      removedCount: 0,
      failedIds: ids,
      errors: [error.message],
    }
  }

  return {
    removedCount: count ?? ids.length,
    failedIds: [],
    errors: [],
  }
}