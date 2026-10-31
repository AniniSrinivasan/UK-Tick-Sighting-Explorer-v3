import { sightingsResponse } from '@/lib/sightings-service'

export async function GET(request: Request) {
  return sightingsResponse(request, true)
}
