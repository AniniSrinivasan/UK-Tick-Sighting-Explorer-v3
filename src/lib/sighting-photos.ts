import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const photoFilename = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/

function photoPath(filename: string) {
  if (!photoFilename.test(filename)) return null
  // Uploaded files belong to runtime storage and must not be bundled into the app.
  return path.join(/* turbopackIgnore: true */ process.env.SIGHTING_PHOTO_DIRECTORY || path.join(process.cwd(), '.data', 'sighting-photos'), filename)
}

// Save only the validated WebP produced by the report upload handler.
export async function saveLocalPhoto(data: Buffer) {
  const filename = `${randomUUID()}.webp`
  const destination = photoPath(filename)!
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, data, { flag: 'wx' })
  return { filename, url: `/api/sighting-photos/${filename}` }
}

// Remove a new photo if saving its report fails.
export async function deleteLocalPhoto(filename: string) {
  const destination = photoPath(filename)
  if (destination) await unlink(destination)
}

// Read uploaded photos using generated filenames only.
export async function readLocalPhoto(filename: string) {
  const destination = photoPath(filename)
  if (!destination) return null
  try {
    return await readFile(/* turbopackIgnore: true */ destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
