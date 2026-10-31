import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Configure the app and its native Next.js image processing.
const nextConfig: NextConfig = {
  agentRules: false,
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
  enablePrerenderSourceMaps: false,
  experimental: {
    cpus: 2,
  },
}

export default nextConfig
