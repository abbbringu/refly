import { NextResponse } from "next/server"

export class AppError extends Error {
  statusCode: number
  clientMessage: string

  constructor(
    statusCode: number,
    clientMessage: string,
    internalMessage?: string
  ) {
    super(internalMessage || clientMessage)
    this.statusCode = statusCode
    this.clientMessage = clientMessage
    this.name = "AppError"
  }
}

export class UnauthorizedError extends AppError {
  constructor(clientMessage = "Unauthorized") {
    super(401, clientMessage)
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends AppError {
  constructor(clientMessage = "Forbidden") {
    super(403, clientMessage)
    this.name = "ForbiddenError"
  }
}

export class NotFoundError extends AppError {
  constructor(clientMessage = "Not found") {
    super(404, clientMessage)
    this.name = "NotFoundError"
  }
}

export class ValidationError extends AppError {
  constructor(clientMessage = "Invalid request") {
    super(400, clientMessage)
    this.name = "ValidationError"
  }
}

export class ConflictError extends AppError {
  constructor(clientMessage = "Conflict") {
    super(409, clientMessage)
    this.name = "ConflictError"
  }
}

export class InternalError extends AppError {
  constructor(internalMessage?: string) {
    super(
      500,
      "An unexpected error occurred. Please try again later.",
      internalMessage
    )
    this.name = "InternalError"
  }
}

export function handleApiError(
  error: unknown,
  routeLabel?: string
): NextResponse {
  const label = routeLabel ? `[${routeLabel}] ` : ""

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      console.error(
        `${label}API ${error.statusCode} error:`,
        error.message,
        error.stack
      )
    }
    return NextResponse.json(
      { error: error.clientMessage },
      { status: error.statusCode }
    )
  }

  if (error instanceof Error) {
    console.error(`${label}API 500 error:`, error.message)
    if (error.stack) {
      console.error(`${label}Stack:`, error.stack)
    }
  } else {
    console.error(`${label}API 500 error:`, error)
  }

  return NextResponse.json(
    { error: "An unexpected error occurred. Please try again later." },
    { status: 500 }
  )
}
