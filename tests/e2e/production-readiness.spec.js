const fs = require('node:fs')
const path = require('node:path')
const { test, expect } = require('@playwright/test')

const root = path.resolve(__dirname, '../..')

test('production readiness files are safe for packaging', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const files = packageJson.build.files

  expect(files).not.toContain('.env')
  expect(files).toEqual(expect.arrayContaining(['!.env', '!.env.*', '!**/.env', '!**/.env.*']))
  expect(files).toContain('.generated/insforge.json')
  expect(packageJson.build.extraResources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ from: '.generated/insforge.json', to: 'insforge.json' })
    ])
  )
  expect(packageJson.devDependencies.tailwindcss).toBe('3.4.17')
})

test('renderer uses bundled Tailwind output instead of CDN runtime', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

  expect(indexHtml).toContain('public/tailwind.css')
  expect(indexHtml).not.toContain('cdn.tailwindcss.com')
  expect(indexHtml).not.toContain('tailwind.config =')
  expect(fs.existsSync(path.join(root, 'public/tailwind.css'))).toBe(true)
})
