const path = require('node:path')
const { rcedit } = require('rcedit')

// signAndEditExecutable is disabled, so electron-builder never embeds the icon.
// Patch the unpacked exe here, before NSIS packs it into the installer.
exports.default = async function afterPack (context) {
  if (context.electronPlatformName !== 'win32') return

  const { appInfo } = context.packager
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`)
  const iconPath = path.join(context.packager.projectDir, 'logo.ico')

  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      ProductName: appInfo.productName,
      FileDescription: appInfo.productName,
      CompanyName: appInfo.companyName || appInfo.productName
    },
    'file-version': appInfo.shortVersion || appInfo.version,
    'product-version': appInfo.shortVersion || appInfo.version
  })
  console.log(`afterPack: icon applied to ${exePath}`)
}
