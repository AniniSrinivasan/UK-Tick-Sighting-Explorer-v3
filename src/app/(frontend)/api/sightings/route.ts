import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { insertSighting } from '@/lib/mysql'
import { regions, species, severity } from '@/lib/sightings-domain'
import { sightingsResponse } from '@/lib/sightings-service'
import { deleteLocalPhoto, saveLocalPhoto } from '@/lib/sighting-photos'

export const runtime = 'nodejs'

// upload size and image safety limits
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_REQUEST_BYTES = MAX_PHOTO_BYTES + 64 * 1024
const MAX_JSON_BYTES = 64 * 1024
const MAX_IMAGE_PIXELS = 40_000_000
const reportFields = ['observedAt', 'locationName', 'region', 'species', 'severity', 'latitude', 'longitude', 'notes'] as const

// read the request body without exceeding the size limit
async function readBoundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let bytesRead = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      if (bytesRead > limit) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, bytesRead)
}

type ReportPhoto = {
  data: Buffer
  name: string
  size: number
  width: number
  height: number
}

// validate the uploaded image, resize it and convert it to WebP
async function normalizePhoto(file: File): Promise<ReportPhoto | string> {
  if (!file.size) return 'Choose a non-empty image file.'
  if (file.size > MAX_PHOTO_BYTES) return 'Choose an image smaller than 5 MB.'
  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const options = { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' as const }
    const metadata = await sharp(bytes, options).metadata()
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) {
      return 'Choose a valid JPEG, PNG or WebP image.'
    }
    const { data, info } = await sharp(bytes, options)
      .rotate()
      .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
    if (data.length > MAX_PHOTO_BYTES) return 'This image is still too large after compression. Choose a smaller image.'
    return {
      data,
      name: `sighting-${randomUUID()}.webp`,
      size: data.length,
      width: info.width,
      height: info.height,
    }
  } catch {
    return 'This image could not be read. Choose a valid JPEG, PNG or WebP image.'
  }
}

// load sightings for the selected filters
export async function GET(request: Request) {
  return sightingsResponse(request)
}

// receive a new sighting with an optional photo
export async function POST(request: Request) {
  // Preserve the case-sensitive upload boundary; normalize only the media type.
  const contentType = request.headers.get('content-type') ?? ''
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase()
  const isMultipart = mediaType === 'multipart/form-data'
  const isJSON = mediaType === 'application/json'
  if (!isMultipart && !isJSON) {
    return Response.json({ error: 'Send a JSON or multipart report.', errors: { form: 'Unsupported request content type.' } }, { status: 400 })
  }

  const contentLength = Number(request.headers.get('content-length'))
  const bodyLimit = isMultipart ? MAX_REQUEST_BYTES : MAX_JSON_BYTES
  if (Number.isFinite(contentLength) && contentLength > bodyLimit) {
    const message = isMultipart ? 'The photo is too large. Choose an image smaller than 5 MB.' : 'The report body is too large.'
    return Response.json({ error: message, errors: { [isMultipart ? 'photo' : 'form']: message } }, { status: 413 })
  }

  let body: Record<string, unknown>
  let photo: File | undefined
  let bodyBytes: Buffer | null
  try {
    bodyBytes = await readBoundedBody(request, bodyLimit)
  } catch {
    return Response.json({ error: 'The report body could not be read.', errors: { form: 'Please retry your report.' } }, { status: 400 })
  }
  if (!bodyBytes) {
    const message = isMultipart ? 'The report or photo is too large.' : 'The report body is too large.'
    return Response.json({ error: message, errors: { form: message } }, { status: 413 })
  }
  // read form fields and the optional uploaded photo
  if (isMultipart) {
    let form: FormData
    try {
      const requestBody = new Uint8Array(bodyBytes.byteLength)
      requestBody.set(bodyBytes)
      form = await new Request(request.url, { method: 'POST', headers: { 'Content-Type': contentType }, body: requestBody }).formData()
    } catch {
      return Response.json({ error: 'Send a valid multipart report.', errors: { form: 'The request body could not be read.' } }, { status: 400 })
    }
    body = {}
    for (const field of reportFields) {
      const value = form.get(field)
      if (value instanceof File) {
        return Response.json({ error: 'Please check the highlighted fields.', errors: { [field]: 'Enter text for this field.' } }, { status: 400 })
      }
      if (value !== null) body[field] = value
    }
    const uploadedPhotos = form.getAll('photo')
    if (uploadedPhotos.length > 1) {
      return Response.json({ error: 'Please check the highlighted fields.', errors: { photo: 'Upload one photo per report.' } }, { status: 400 })
    }
    const uploadedPhoto = uploadedPhotos[0]
    if (uploadedPhoto instanceof File) {
      if (uploadedPhoto.name || uploadedPhoto.size) photo = uploadedPhoto
    } else if (uploadedPhoto !== undefined && uploadedPhoto !== '') {
      return Response.json({ error: 'Please check the highlighted fields.', errors: { photo: 'Choose an image file.' } }, { status: 400 })
    }
  } else {
    let input: unknown
    try {
      input = JSON.parse(bodyBytes.toString('utf8'))
    } catch {
      return Response.json({ error: 'Send a valid JSON report.', errors: { form: 'The request body is not valid JSON.' } }, { status: 400 })
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return Response.json({ error: 'Send a report object.', errors: { form: 'Expected a JSON object.' } }, { status: 400 })
    }
    body = input as Record<string, unknown>
    if (body.photo !== undefined) {
      return Response.json({ error: 'Upload photos using a multipart report.', errors: { photo: 'Choose an image file.' } }, { status: 400 })
    }
  }

  try {
    // validate report fields before saving
    const errors: Record<string, string> = {}
    const observedAt = typeof body.observedAt === 'string' ? body.observedAt : ''
    const date = new Date(observedAt)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observedAt) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== observedAt) {
      errors.observedAt = 'Choose a valid calendar date.'
    } else if (observedAt > new Date().toISOString().slice(0, 10)) {
      errors.observedAt = 'Date observed cannot be in the future.'
    }
    const locationName = typeof body.locationName === 'string' ? body.locationName.trim() : ''
    if (locationName.length < 2 || locationName.length > 120) errors.locationName = 'Enter a location between 2 and 120 characters.'
    const region = typeof body.region === 'string' ? body.region : ''
    const kind = typeof body.species === 'string' ? body.species : ''
    const activity = typeof body.severity === 'string' ? body.severity : ''
    if (!regions.includes(region)) errors.region = 'Choose a UK region.'
    if (!species.includes(kind)) errors.species = 'Choose a species.'
    if (!severity.includes(activity)) errors.severity = 'Choose an activity level.'
    // Accept JSON numbers and decimal strings from HTML number inputs, never coercible null/boolean/array values.
    const coordinate = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !value.trim()) ? null : typeof value === 'number' ? value :
      typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) ? Number(value) : NaN
    const latitude = coordinate(body.latitude)
    const longitude = coordinate(body.longitude)
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) errors.latitude = 'Enter a latitude between -90 and 90.'
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) errors.longitude = 'Enter a longitude between -180 and 180.'
    if ((latitude === null) !== (longitude === null)) {
      errors[latitude === null ? 'latitude' : 'longitude'] = 'Provide both latitude and longitude, or leave both blank.'
    }
    if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.trim().length > 1000)) errors.notes = 'Field notes must be text of at most 1000 characters.'
    if (photo && photo.size > MAX_PHOTO_BYTES) errors.photo = 'Choose an image smaller than 5 MB.'
    if (Object.keys(errors).length) return Response.json({ error: 'Please check the highlighted fields.', errors }, { status: 400 })

    const normalizedPhoto = photo ? await normalizePhoto(photo) : undefined
    if (typeof normalizedPhoto === 'string') {
      return Response.json({ error: 'Please check the highlighted fields.', errors: { photo: normalizedPhoto } }, { status: 400 })
    }

    let localPhoto: Awaited<ReturnType<typeof saveLocalPhoto>> | undefined
    try {
      // Store the processed photo on the backend before saving its report.
      if (normalizedPhoto) localPhoto = await saveLocalPhoto(normalizedPhoto.data)

      // save the report and its photo reference in MySQL
      const doc = await insertSighting({
        observedAt: date.toISOString(),
        locationName,
        region,
        latitude,
        longitude,
        species: kind,
        severity: activity,
        notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : undefined,
        photoUrl: localPhoto?.url,
        photoWidth: normalizedPhoto?.width,
        photoHeight: normalizedPhoto?.height,
      })
      return Response.json({ data: doc, message: 'Report received and awaiting verification.' }, { status: 201 })
    } catch (error) {
      if (localPhoto) {
        await deleteLocalPhoto(localPhoto.filename).catch(cleanupError => {
          console.error('Failed to remove an unattached local sighting photo:', cleanupError)
        })
      }
      throw error
    }
  } catch (error) {
    console.error('Could not save sighting report:', error)
    return Response.json({ error: 'We could not save this report. Please try again.' }, { status: 500 })
  }
}
