import type { CollectionConfig } from 'payload'

// organize CMS media into folders
export const Folders: CollectionConfig = {
  slug: 'folders',
  admin: {
    useAsTitle: 'name',
  },
  folders: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
  ],
}
