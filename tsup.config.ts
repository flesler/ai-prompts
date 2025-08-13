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
      copyDirectory('src/public', 'dist')
      await generateManifest()
      if (!dts) {
        console.log('Chrome extension build success')
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

async function generateManifest() {
  const matches = generateDomainMatches()
  matches.push('*://x.com/i/grok*')
  matches.push('*://bing.com/chat*')

  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'))
  const manifest = JSON.parse(readFileSync('src/public/manifest.json', 'utf-8'))

  manifest.version = packageJson.version
  manifest.description = packageJson.description
  manifest.content_scripts[0].matches = matches

  writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2))
  console.log(`Generated manifest with ${matches.length} domain patterns`)
}
