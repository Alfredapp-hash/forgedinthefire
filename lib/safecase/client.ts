export class SafecaseRequestError extends Error {
  status: number
  payload: Record<string, unknown>

  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message)
    this.name = 'SafecaseRequestError'
    this.status = status
    this.payload = payload
  }
}

export async function safecaseFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new SafecaseRequestError(
      (data as { error?: string }).error || 'SafeCase request failed',
      res.status,
      (data as Record<string, unknown>) || {},
    )
  }
  return data as T
}
