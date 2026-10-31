import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common'

/** Compatibility proxy only. Next.js owns validation, data access and response shapes. */
@Injectable()
export class SightingsService {
  private async forward(path: string, query: Record<string, string | undefined> = {}, body?: unknown) {
    const origin = process.env.NEXT_BACKEND_URL
    if (!origin) throw new ServiceUnavailableException('Set NEXT_BACKEND_URL to the canonical Next.js server.')
    const url = new URL(`/api/${path}`, origin)
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value)
    let response: Response
    let result: object
    try {
      response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      })
      result = await response.json() as object
    } catch { throw new ServiceUnavailableException('Canonical backend is unavailable.') }
    if (!response.ok) throw new HttpException(result, response.status)
    return result
  }
  findAll(query: Record<string, string | undefined>) { return this.forward('sightings', query) }
  create(body: unknown) { return this.forward('sightings', {}, body ?? null) }
  insights(query: Record<string, string | undefined>) { return this.forward('insights', query) }
}
