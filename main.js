const { app, BrowserWindow, ipcMain, nativeImage } = require('electron/main')
const fs = require('node:fs')
const path = require('node:path')

let mainWindow = null

function resolveWindowIcon () {
  const pngPath = path.join(__dirname, 'logo.png')
  const icoPath = path.join(__dirname, 'logo.ico')

  try {
    if (fs.existsSync(pngPath)) {
      const image = nativeImage.createFromPath(pngPath)
      if (!image.isEmpty()) return image
    }
  } catch (_) {}

  try {
    if (fs.existsSync(icoPath)) {
      const image = nativeImage.createFromPath(icoPath)
      if (!image.isEmpty()) return image
    }
  } catch (_) {}

  return undefined
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    frame: false,
    titleBarStyle: 'hidden',
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadFile('index.html')

  // Notify renderer when window is maximized/unmaximized
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false)
  })
}

// Window controls handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
})

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close()
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})