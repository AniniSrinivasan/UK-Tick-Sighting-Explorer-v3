import type { CollectionConfig } from 'payload'

// organize CMS content using tags
export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'name',
  },
  tags: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
  ],
}
