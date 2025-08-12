import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { defineConfig } from 'tsup'
import { generateDomainMatches } from './src/domains.js'

export default defineConfig((options) => {
  const dts = options.dts !== false

  return {
    entry: {
      background: 'src/background.ts',
      content: 'src/content.ts',
      popup: 'src/popup.ts',
      options: 'src/options.ts',
    },
    format: ['iife'],
    globalName: 'Extension',
    platform: 'browser',
    target: 'chrome91',
    outDir: 'dist',
    clean: true,
    minify: !options.watch,
    dts: false,
    treeshake: true,
    silent: !dts,
    esbuildOptions(options) {
      options.legalComments = 'none'
      options.drop = ['debugger']
      options.entryNames = '[name]'
    },
    outExtension() {
      return { js: '.js' }
    },
    async onSuccess() {
      // Copy static files from src/public to dist (excluding manifests)
      copyDirectoryExcluding('src/public', 'dist', ['manifest.json'])

      // Generate manifest with dynamic domains
      await generateManifestWithDomains()

      if (!dts) {
        console.log('Chrome extension build success')
      }
    },
  }
})


function copyDirectory(src: string, dest: string) {
  try {
    mkdirSync(dest, { recursive: true })
    const items = readdirSync(src)

    for (const item of items) {
      const srcPath = join(src, item)
      const destPath = join(dest, item)

      if (statSync(srcPath).isDirectory()) {
        copyDirectory(srcPath, destPath)
      } else {
        copyFileSync(srcPath, destPath)
      }
    }
  } catch (error) {
    console.error('Error copying directory:', error)
  }
}

function copyDirectoryExcluding(src: string, dest: string, excludeFiles: string[]) {
  try {
    mkdirSync(dest, { recursive: true })
    const items = readdirSync(src)

    for (const item of items) {
      if (excludeFiles.includes(item)) {
        continue // Skip excluded files
      }

      const srcPath = join(src, item)
      const destPath = join(dest, item)

      if (statSync(srcPath).isDirectory()) {
        copyDirectory(srcPath, destPath)
      } else {
        copyFileSync(srcPath, destPath)
      }
    }
  } catch (error) {
    console.error('Error copying directory:', error)
  }
}

async function generateManifestWithDomains() {
  try {
    // Generate manifest match patterns from domains configuration
    const matches = generateDomainMatches()

    // Add specific paths for some platforms
    matches.push('*://x.com/i/grok*')
    matches.push('*://bing.com/chat*')
    matches.push('*://huggingface.co/chat*')
    matches.push('*://labs.google.com/search*')

    // Read package.json for version and description
    const packageContent = readFileSync('package.json', 'utf-8')
    const packageJson = JSON.parse(packageContent)

    // Read the Chrome manifest
    const manifestContent = readFileSync('src/public/manifest.json', 'utf-8')
    const manifest = JSON.parse(manifestContent)

    // Update version and description from package.json
    manifest.version = packageJson.version
    manifest.description = packageJson.description

    // Update content script matches
    if (manifest.content_scripts && manifest.content_scripts[0]) {
      manifest.content_scripts[0].matches = matches
    }

    // Write the updated manifest
    writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2))

    console.log(`Generated manifest with ${matches.length} domain patterns`)
  } catch (error) {
    console.error('Error generating manifest:', error)
    // Fallback to copying original manifest
    copyFileSync('src/public/manifest.json', 'dist/manifest.json')
  }
}
