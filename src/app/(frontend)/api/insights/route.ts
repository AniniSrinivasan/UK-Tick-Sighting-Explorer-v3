import { sightingsResponse } from '@/lib/sightings-service'

// return reporting totals and trends
export async function GET(request: Request) {
  return sightingsResponse(request, true)
}
