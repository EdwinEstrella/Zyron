const fs = require('node:fs')
const path = require('node:path')
const { rcedit } = require('rcedit')

function findExeFiles (directory, matches = []) {
  if (!fs.existsSync(directory)) return matches

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      findExeFiles(fullPath, matches)
      continue
    }

    if (entry.isFile() && fullPath.toLowerCase().endsWith('.exe')) {
      matches.push(fullPath)
    }
  }

  return matches
}

async function main () {
  const projectDir = path.resolve(__dirname, '..')
  const iconPath = path.join(projectDir, 'logo.ico')
  const outDir = path.join(projectDir, 'out')

  if (!fs.existsSync(iconPath)) {
    throw new Error(`No se encontro el icono esperado en: ${iconPath}`)
  }

  const exeFiles = findExeFiles(outDir)

  if (exeFiles.length === 0) {
    console.log('No se encontraron .exe dentro de ./out para actualizar icono.')
    return
  }

  for (const exePath of exeFiles) {
    await rcedit(exePath, { icon: iconPath })
    console.log(`Icono aplicado en: ${exePath}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
