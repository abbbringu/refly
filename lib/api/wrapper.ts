import { NextResponse } from "next/server"
import { AppError, handleApiError } from "./errors"

export function apiRoute<Args extends unknown[], Return extends Response>(
  label: string,
  handler: (...args: Args) => Promise<Return>
): (...args: Args) => Promise<Return | NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args)
    } catch (error) {
      return handleApiError(error, label)
    }
  }
}
