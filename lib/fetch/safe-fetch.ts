import dns from "dns/promises"

export interface SafeFetchOptions {
  timeout?: number
  maxBytes?: number
  headers?: HeadersInit
  method?: string
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024

const BLOCKED_IPV4_RANGES: Array<{ prefix: number; bits: number }> = [
  { prefix: 0x7f000000, bits: 8 },
  { prefix: 0x0a000000, bits: 8 },
  { prefix: 0xac100000, bits: 12 },
  { prefix: 0xc0a80000, bits: 16 },
  { prefix: 0xa9fe0000, bits: 16 },
  { prefix: 0x00000000, bits: 8 },
  { prefix: 0x64400000, bits: 10 },
  { prefix: 0xc6120000, bits: 15 },
  { prefix: 0xc6336400, bits: 24 },
]

const BLOCKED_IPV6_RANGES: Array<{ prefix: bigint; bits: number }> = [
  { prefix: BigInt(1), bits: 128 },
  { prefix: BigInt(0xfe80), bits: 10 },
  { prefix: BigInt(0xfc00), bits: 7 },
  { prefix: BigInt(0xfd00), bits: 8 },
  { prefix: BigInt(0xfec0), bits: 10 },
  { prefix: BigInt(0xff00), bits: 8 },
]

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "local",
  "internal",
  "intranet",
  "private",
  " intranet",
])

const BLOCKED_HOSTNAME_SUFFIXES = new Set([
  ".local",
  ".localhost",
  ".internal",
  ".intranet",
  ".private",
  ".corp",
  ".lan",
  ".home",
  ".example",
  ".invalid",
  ".test",
])

export class SSRFError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SSRFError"
  }
}

function ipToInt32(ip: string): number {
  const parts = ip.split(".").map(Number.parseInt)
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]
}

function ipToBigInt(ip: string): bigint {
  const ipClean = ip.replaceAll(":", "")
  let result = BigInt(0)
  for (const char of ipClean) {
    result = result * BigInt(16) + BigInt(parseInt(char, 16))
  }
  return result
}

function isBlockedIPv4(ip: string): boolean {
  const int = ipToInt32(ip)
  for (const range of BLOCKED_IPV4_RANGES) {
    if ((int >>> (32 - range.bits)) === range.prefix >>> (32 - range.bits)) {
      if (range.bits === 24) {
        const masked = int & 0xffff0000
        if (masked === range.prefix) return true
      } else {
        return true
      }
    }
  }
  return false
}

function isBlockedIPv6(ip: string): boolean {
  if (ip === "::1") return true
  const normalized = ip.toLowerCase()
  if (normalized === "::" || normalized === "::/0") return true
  try {
    const ipInt = ipToBigInt(normalized)
    for (const range of BLOCKED_IPV6_RANGES) {
      if (range.bits === 128) {
        if (ipInt === range.prefix) return true
      } else {
        const shift = 128 - range.bits
        if (ipInt >> BigInt(shift) === range.prefix >> BigInt(shift)) {
          return true
        }
      }
    }
  } catch {
    return false
  }
  return false
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(lower)) return true
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (lower.endsWith(suffix)) return true
  }
  return false
}

function isBlockedIP(ip: string): boolean {
  if (ip.includes(":")) return isBlockedIPv6(ip)
  return isBlockedIPv4(ip)
}

export function validateUrlForSSRF(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SSRFError("Invalid URL")
  }

  const scheme = parsed.protocol.toLowerCase()
  if (scheme !== "http:" && scheme !== "https:") {
    throw new SSRFError(`Disallowed URL scheme: ${scheme}`)
  }

  if (parsed.username || parsed.password) {
    throw new SSRFError("URLs with credentials are not allowed")
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!hostname) {
    throw new SSRFError("Missing hostname")
  }

  if (isBlockedHostname(hostname)) {
    throw new SSRFError(`Blocked hostname: ${hostname}`)
  }

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isBlockedIPv4(hostname)) {
      throw new SSRFError(`Blocked IP address: ${hostname}`)
    }
  } else if (/^[0-9a-f]{0,4}:[^/]*$/.test(hostname) || hostname.includes("::")) {
    if (isBlockedIPv6(hostname)) {
      throw new SSRFError(`Blocked IP address: ${hostname}`)
    }
  }
}

async function resolveAndValidate(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SSRFError("Invalid URL")
  }

  const hostname = parsed.hostname
  if (!hostname) return

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isBlockedIPv4(hostname)) {
      throw new SSRFError(`Blocked IP address: ${hostname}`)
    }
    return
  }

  const isIPv6 = /^\\[?[0-9a-f]/i.test(hostname) || hostname.includes("::")
  if (isIPv6) {
    const normalized = hostname.replace(/[\[\]]/g, "")
    if (isBlockedIPv6(normalized)) {
      throw new SSRFError(`Blocked IP address: ${hostname}`)
    }
    return
  }

  try {
    const aRecords = await dns.resolve4(hostname)
    for (const ip of aRecords) {
      if (isBlockedIPv4(ip)) {
        throw new SSRFError(`Blocked IP address resolved from ${hostname}: ${ip}`)
      }
    }
  } catch {
    try {
      const aaaaRecords = await dns.resolve6(hostname)
      for (const ip of aaaaRecords) {
        if (isBlockedIPv6(ip)) {
          throw new SSRFError(`Blocked IP address resolved from ${hostname}: ${ip}`)
        }
      }
    } catch {
      throw new SSRFError(`Could not resolve hostname: ${hostname}`)
    }
  }
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number
): Promise<ArrayBuffer> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new SSRFError("Response has no body")
  }

  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        throw new SSRFError(`Response body exceeds ${maxBytes} bytes`)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const result = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result.buffer
}

export interface SafeFetchResult {
  response: Response
  arrayBuffer: ArrayBuffer
  headers: Headers
  finalUrl: string
}

export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  let currentUrl = url
  let finalUrl = url
  let response: Response | null = null

  validateUrlForSSRF(currentUrl)
  await resolveAndValidate(currentUrl)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    let redirectCount = 0
    const MAX_REDIRECTS = 10

    while (redirectCount < MAX_REDIRECTS) {
      response = await fetch(currentUrl, {
        method: options.method ?? "GET",
        headers: options.headers,
        redirect: "manual",
        signal: controller.signal,
      })

      if (response.status < 300 || response.status > 399) {
        break
      }

      const locationHeader = response.headers.get("location")
      if (!locationHeader) break

      redirectCount++
      const redirectUrl = new URL(locationHeader, currentUrl).toString()

      validateUrlForSSRF(redirectUrl)
      await resolveAndValidate(redirectUrl)

      finalUrl = redirectUrl
      currentUrl = redirectUrl
    }
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response) {
    throw new SSRFError("No response received")
  }

  const arrayBuffer = await readBodyWithLimit(response, maxBytes)

  const newResponse = new Response(arrayBuffer, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
  Object.defineProperty(newResponse, "url", { value: finalUrl })

  return {
    response: newResponse,
    arrayBuffer,
    headers: response.headers,
    finalUrl,
  }
}