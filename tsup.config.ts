import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { defineConfig } from 'tsup'
import { generateDomainMatches } from './src/domains.js'

export default defineConfig((options) => {
  const dts = options.dts !== false
  const isFirefox = process.env.FIREFOX === '1'
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
      copyDirectory('src/public', 'dist')
      await generateManifest(isFirefox)
      if (!dts) {
        console.log(`${isFirefox ? 'Firefox' : 'Chrome'} extension build success`)
      }
    },
  }
})

function copyDirectory(src: string, dest: string) {
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
}

async function generateManifest(isFirefox = false) {
  const matches = generateDomainMatches()
  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'))
  const manifest = JSON.parse(readFileSync('src/public/manifest.json', 'utf-8'))

  manifest.version = packageJson.version
  manifest.description = packageJson.description
  manifest.content_scripts[0].matches = matches

  if (isFirefox) {
    // Firefox-specific manifest modifications
    manifest.background = {
      scripts: ['background.js'],
    }
    // Firefox-specific permissions or adjustments could go here
    manifest.browser_specific_settings = {
      gecko: {
        id: '{ai-prompts@flesler.com}',
        strict_min_version: '109.0',
      },
    }
  }

  writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2))
  console.log(`Generated ${isFirefox ? 'Firefox' : 'Chrome'} manifest with ${matches.length} domain patterns`)
}
