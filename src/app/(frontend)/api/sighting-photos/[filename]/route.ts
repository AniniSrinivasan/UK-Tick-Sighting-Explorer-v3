import { readLocalPhoto } from '@/lib/sighting-photos'

export const runtime = 'nodejs'

// Serve a submitted photo from the local photo directory.
export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params
  const photo = await readLocalPhoto(filename)
  if (!photo) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(photo), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
