export type ReflyDataUpdateType = "all" | "paper" | "folder" | "tag" | "team"

export interface ReflyDataUpdateDetail {
  type: ReflyDataUpdateType
  ids?: string[]
}

export const REFLY_DATA_UPDATED_EVENT = "refly-data-updated"

export function dispatchReflyDataUpdated(detail: ReflyDataUpdateDetail) {
  window.dispatchEvent(new CustomEvent(REFLY_DATA_UPDATED_EVENT, { detail }))
}

export function shouldHandleReflyDataUpdate(
  event: Event,
  types: ReflyDataUpdateType[],
) {
  if (!(event instanceof CustomEvent) || !event.detail?.type) {
    return true
  }

  return event.detail.type === "all" || types.includes(event.detail.type)
}
