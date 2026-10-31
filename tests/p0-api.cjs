// check report validation, photo uploads and data source failures
// Run: mise exec -- node tests/p0-api.cjs
// Exercise the actual route with isolated storage/upstream adapters; no real records are written.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const photosDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tickwatch-photo-test-'))
const previousDirectory = process.env.SIGHTING_PHOTO_DIRECTORY
process.env.SIGHTING_PHOTO_DIRECTORY = photosDirectory
let stored = []
let localAvailable = true
let external = []
let externalAvailable = true
const storage = {
  listSightings: async () => { if (!localAvailable) throw Error(); return stored },
  insertSighting: async (input) => { if (!localAvailable) throw Error(); const row = { ...input, id: 'saved', source: 'community' }; stored.push(row); return row },
}
const createLoader = require('./load-ts.cjs')
const loader = () => createLoader({ overrides: { 'src/lib/mysql.ts': storage }, globals: {
  fetch: async () => { if (!externalAvailable) throw Error(); return Response.json(external) },
} })
const { POST } = loader()('src/app/(frontend)/api/sightings/route.ts')
const GET = request => loader()('src/app/(frontend)/api/sightings/route.ts').GET(request)
const valid = { observedAt: new Date().toISOString().slice(0, 10), locationName: 'Test Park', region: 'London', latitude: '51.5', longitude: '0', species: 'unknown', severity: 'low', notes: 'Test' }
const post = body => POST(new Request('http://test/api/sightings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }))
const postForm = (fields, file) => {
  const form = new FormData()
  for (const [field, value] of Object.entries(fields)) if (value !== undefined && value !== null) form.set(field, String(value))
  if (file) form.set('photo', file)
  return POST(new Request('http://test/api/sightings', { method: 'POST', body: form }))
}
const get = () => GET(new Request('http://test/api/sightings'))
;(async () => {
  for (const body of ['{', null, [], true, 42, '"string"']) {
    const response = await post(body)
    assert.equal(response.status, 400)
    assert.ok((await response.json()).errors.form)
  }
  for (const [field, values] of Object.entries({
    observedAt: ['2026-02-30', '2025-02-29', '9999-01-01', '2026-01-01T00:00:00Z', null, 1, []],
    locationName: [null, [], {}, 42, ' ', 'x'.repeat(121)],
    latitude: [true, [], {}, '0x33', -91, 91],
    longitude: [false, [], {}, -181, 181],
    region: [null, [], 'invalid'], species: [false, [], 'invalid'], severity: [null, [], 'invalid'], notes: [null, {}, [], 1, 'x'.repeat(1001)],
  })) {
    for (const value of values) {
      const response = await post({ ...valid, [field]: value })
      assert.equal(response.status, 400, `${field}: ${JSON.stringify(value)}`)
      assert.ok((await response.json()).errors[field], field)
    }
  }
  assert.equal(stored.length, 0)
  const response = await post({ ...valid, status: 'verified', source: 'elanco', id: 'forged' })
  assert.equal(response.status, 201)
  assert.equal(stored.length, 1)
  assert.equal(stored[0].longitude, 0)
  assert.equal(stored[0].source, 'community')
  assert.equal(stored[0].status, undefined)
  assert.equal((await (await get()).json()).data[0].id, 'local-id-saved')
  const sharp = require('sharp')
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#2a5' } }).png().toBuffer()
  const image = new File([png], 'tick.png', { type: 'image/png' })
  const uploaded = await postForm(valid, image)
  assert.equal(uploaded.status, 201)
  const uploadedReport = await uploaded.json()
  assert.match(uploadedReport.data.photoUrl, /^\/api\/sighting-photos\/[\da-f-]+\.webp$/)
  assert.equal(uploadedReport.data.photoWidth, 2)
  assert.equal(stored.at(-1).photoUrl, uploadedReport.data.photoUrl)
  const reportsWithPhotos = await (await get()).json()
  assert.equal(reportsWithPhotos.data[0].photoUrl, uploadedReport.data.photoUrl)
  const invalidPhoto = await postForm(valid, new File([Buffer.from('not an image')], 'invalid.png', { type: 'image/png' }))
  assert.equal(invalidPhoto.status, 400)
  assert.ok((await invalidPhoto.json()).errors.photo)
  const duplicatePhotos = new FormData()
  for (const [field, value] of Object.entries(valid)) duplicatePhotos.set(field, String(value))
  duplicatePhotos.append('photo', image)
  duplicatePhotos.append('photo', image)
  const duplicatePhotoResponse = await POST(new Request('http://test/api/sightings', { method: 'POST', body: duplicatePhotos }))
  assert.equal(duplicatePhotoResponse.status, 400)
  assert.ok((await duplicatePhotoResponse.json()).errors.photo)
  assert.equal(stored.length, 2)
  const oversizedPhoto = await postForm(valid, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))
  assert.equal(oversizedPhoto.status, 400)
  assert.ok((await oversizedPhoto.json()).errors.photo)
  const diskFailure = createLoader({ overrides: { 'src/lib/mysql.ts': storage, 'src/lib/sighting-photos.ts': { saveLocalPhoto: async () => { throw Error('Disk unavailable') } } } })('src/app/(frontend)/api/sightings/route.ts').POST
  const diskFailureForm = new FormData()
  for (const [field, value] of Object.entries(valid)) diskFailureForm.set(field, String(value))
  diskFailureForm.set('photo', image)
  const beforeDiskFailure = stored.length
  assert.equal((await diskFailure(new Request('http://test/api/sightings', { method: 'POST', body: diskFailureForm }))).status, 500)
  assert.equal(stored.length, beforeDiskFailure)
  const filesBeforeFailure = fs.readdirSync(photosDirectory)
  localAvailable = false
  assert.equal((await postForm(valid, image)).status, 500)
  localAvailable = true
  assert.deepEqual(fs.readdirSync(photosDirectory), filesBeforeFailure, 'Remove photos when database saving fails')
  for (const missing of [null, undefined, '', ' ']) {
    const response = await post({ ...valid, latitude: missing, longitude: missing })
    assert.equal(response.status, 201)
    const result = await response.json()
    assert.equal(result.data.latitude, null)
    assert.equal(result.data.longitude, null)
  }
  for (const [latitude, longitude] of [[-90, -180], [90, 180], [40.7128, -74.006]]) {
    const response = await post({ ...valid, latitude, longitude })
    assert.equal(response.status, 201)
    const saved = await response.json()
    assert.equal(saved.data.latitude, latitude)
    assert.equal(saved.data.longitude, longitude)
  }
  stored = stored.slice(-1)
  const roundTrip = await (await get()).json()
  assert.ok(roundTrip.data.some(row => row.latitude === 40.7128 && row.longitude === -74.006))
  assert.equal((await post({ ...valid, longitude: null })).status, 400)
  const partial = await post({ ...valid, latitude: '' })
  assert.equal(partial.status, 400)
  assert.match((await partial.json()).errors.latitude, /both latitude and longitude/)
  stored = [{ ...stored[0], id: 'sample-new-forest', species: 'hedgehog', locationName: 'New Forest', region: 'South East', observedAt: '2025-05-18T12:00:00Z' }]
  const hedgehogResults = await (await get()).json()
  assert.equal(hedgehogResults.data.length, 1)
  assert.equal(hedgehogResults.data[0].species, 'hedgehog')
  assert.equal(hedgehogResults.data[0].locationName, 'New Forest')
  stored = []
  for (const [local, upstream] of [[true,true],[true,false],[false,true],[false,false]]) {
    localAvailable = local; externalAvailable = upstream
    const result = await (await get()).json()
    assert.equal(result.meta.localAvailable, local)
    assert.equal(result.meta.externalAvailable, upstream)
    assert.deepEqual(result.data, [])
  }
  externalAvailable = true; external = { unexpected: [] }
  assert.equal((await (await get()).json()).meta.externalAvailable, false)
  assert.equal((await post(valid)).status, 500)

  // Browser multipart boundaries can contain uppercase letters and must keep their original case.
  localAvailable = true
  const webp = await sharp(png).webp().toBuffer()
  for (const photoBytes of [null, webp]) {
    const storedBefore = stored.length
    const boundary = '----WebKitFormBoundaryTickWatchAaBb123'
    const parts = Object.entries(valid).map(([name, value]) => Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ))
    if (photoBytes) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="tick_pic.webp"\r\nContent-Type: image/webp\r\n\r\n`))
      parts.push(photoBytes, Buffer.from('\r\n'))
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`))
    const response = await POST(new Request('http://test/api/sightings', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat(parts),
    }))
    const report = await response.json()
    assert.equal(response.status, 201, JSON.stringify(report))
    assert.equal(report.data.locationName, valid.locationName)
    assert.equal(report.data.latitude, Number(valid.latitude))
    if (photoBytes) assert.match(report.data.photoUrl, /^\/api\/sighting-photos\//)
    else assert.equal(report.data.photoUrl, undefined)
    assert.equal(stored.length, storedBefore + 1)
    assert.equal(stored.at(-1).locationName, valid.locationName)
    assert.equal(stored.at(-1).photoUrl, report.data.photoUrl)
  }
  // Uploaded photos must load through the backend and use generated filenames only.
  {
    const saved = await postForm(valid, image)
    assert.equal(saved.status, 201)
    const { data } = await saved.json()
    assert.match(data.photoUrl, /^\/api\/sighting-photos\/[\da-f-]+\.webp$/)
    const filename = data.photoUrl.split('/').at(-1)
    const { GET: getPhoto } = createLoader()('src/app/(frontend)/api/sighting-photos/[filename]/route.ts')
    const loaded = await getPhoto(new Request(`http://test${data.photoUrl}`), { params: Promise.resolve({ filename }) })
    assert.equal(loaded.status, 200)
    assert.equal(loaded.headers.get('content-type'), 'image/webp')
    assert.equal((await sharp(Buffer.from(await loaded.arrayBuffer())).metadata()).format, 'webp')
    for (const invalid of ['../secret.webp', 'invalid.webp', '00000000-0000-4000-8000-000000000000.webp']) {
      assert.equal((await getPhoto(new Request('http://test'), { params: Promise.resolve({ filename: invalid }) })).status, 404)
    }
    const beforeFailedSave = fs.readdirSync(photosDirectory)
    localAvailable = false
    assert.equal((await postForm(valid, image)).status, 500)
    assert.deepEqual(fs.readdirSync(photosDirectory), beforeFailedSave, 'Failed reports must not leave uploaded photos behind')
    localAvailable = true
    // The browser sends an empty file input when no photo is chosen.
    assert.equal((await postForm(valid, new File([], '', { type: 'application/octet-stream' }))).status, 201)
  }
  console.log('P0 API checks passed: JSON and multipart reports, field validation, image decoding/limits, backend photo storage, photo serving, orphan cleanup, save/read, source availability and failures.')
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  fs.rmSync(photosDirectory, { recursive: true, force: true })
  if (previousDirectory === undefined) delete process.env.SIGHTING_PHOTO_DIRECTORY
  else process.env.SIGHTING_PHOTO_DIRECTORY = previousDirectory
})
