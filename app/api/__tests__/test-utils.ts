export function jsonRequest(body: unknown, init: RequestInit = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...(init.headers || {}) },
    body: JSON.stringify(body),
    ...init,
  })
}

export async function responseJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

export function queryResult(result: { data?: unknown; error?: unknown }) {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    in: () => query,
    gte: () => query,
    order: () => query,
    limit: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    insert: () => query,
    update: () => query,
    upsert: () => Promise.resolve(result),
    delete: () => query,
    then: (resolve: (value: unknown) => void) => resolve(result),
  }
  return query
}
