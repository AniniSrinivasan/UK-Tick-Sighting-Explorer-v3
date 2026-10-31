// Run: mise exec -- node tests/p0-api.cjs
// Exercise the actual route with isolated storage/upstream adapters; no real records are written.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
let stored = []
let localAvailable = true
let external = []
let externalAvailable = true
let failMediaCreate = false
const deletedMedia = []
const mediaPayload = {
  create: async ({ file, context, overrideAccess, user }) => {
    if (failMediaCreate) throw Error('media unavailable')
    assert.equal(file.mimetype, 'image/webp')
    assert.equal(context.sightingPhotoUpload, true)
    assert.equal(overrideAccess, false)
    assert.equal(user, null)
    return { id: 'media-photo', url: '/api/media/file/sighting.webp' }
  },
  delete: async ({ id }) => { deletedMedia.push(id) },
  logger: { error: () => {} },
}
const storage = {
  listSightings: async () => { if (!localAvailable) throw Error(); return stored },
  insertSighting: async (input) => { if (!localAvailable) throw Error(); const row = { ...input, id: 'saved', source: 'community' }; stored.push(row); return row },
}
const createLoader = require('./load-ts.cjs')
const loader = () => createLoader({ overrides: { 'src/lib/mysql.ts': storage, 'src/lib/payload.ts': { getPayloadClient: async () => mediaPayload } }, globals: {
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
    latitude: [true, [], {}, '0x33', 48, 62],
    longitude: [false, [], {}, -10, 3],
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
  assert.equal(uploadedReport.data.photoMediaId, 'media-photo')
  assert.equal(uploadedReport.data.photoUrl, '/api/media/file/sighting.webp')
  assert.equal(uploadedReport.data.photoWidth, 2)
  assert.equal(stored.at(-1).photoMediaId, 'media-photo')
  const reportsWithPhotos = await (await get()).json()
  assert.equal(reportsWithPhotos.data[0].photoUrl, '/api/media/file/sighting.webp')
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
  failMediaCreate = true
  assert.equal((await postForm(valid, image)).status, 500)
  failMediaCreate = false
  localAvailable = false
  assert.equal((await postForm(valid, image)).status, 500)
  localAvailable = true
  assert.deepEqual(deletedMedia, ['media-photo'])
  for (const missing of [null, undefined, '', ' ']) {
    const response = await post({ ...valid, latitude: missing, longitude: missing })
    assert.equal(response.status, 201)
    const result = await response.json()
    assert.equal(result.data.latitude, null)
    assert.equal(result.data.longitude, null)
  }
  const partial = await post({ ...valid, latitude: '' })
  assert.equal(partial.status, 201)
  assert.equal((await partial.json()).data.longitude, 0)
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
  console.log('P0 API checks passed: JSON and multipart reports, field validation, image decoding/limits, Media upload and association, orphan cleanup, save/read, source availability and failures.')
})().catch(error => { console.error(error); process.exitCode = 1 })
