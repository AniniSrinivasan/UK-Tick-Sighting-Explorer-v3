import type { CollectionConfig } from 'payload'

import { createFolderField, createTagField } from 'payload'

// configure photo uploads and media access
export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: ({ req }) => Boolean(req.user) || req.context?.sightingPhotoUpload === true,
    read: () => true,
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    createFolderField({ relationTo: 'folders' }),
    createTagField({ relationTo: 'tags' }),
  ],
  upload: {
    filesRequiredOnCreate: true,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
}
