const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  getVersions: () => process.versions,
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', (_, isMaximized) => callback(isMaximized))
})

contextBridge.exposeInMainWorld('insforgeAPI', {
  config: () => ipcRenderer.invoke('insforge:config'),
  auth: {
    signUp: (payload) => ipcRenderer.invoke('insforge:auth:signUp', payload),
    signInWithPassword: (payload) => ipcRenderer.invoke('insforge:auth:signInWithPassword', payload),
    signOut: () => ipcRenderer.invoke('insforge:auth:signOut'),
    getCurrentUser: () => ipcRenderer.invoke('insforge:auth:getCurrentUser'),
    getProfile: (userId) => ipcRenderer.invoke('insforge:auth:getProfile', userId),
    setProfile: (profile) => ipcRenderer.invoke('insforge:auth:setProfile', profile),
    sendResetPasswordEmail: (payload) => ipcRenderer.invoke('insforge:auth:sendResetPasswordEmail', payload),
    exchangeResetPasswordToken: (payload) => ipcRenderer.invoke('insforge:auth:exchangeResetPasswordToken', payload),
    resetPassword: (payload) => ipcRenderer.invoke('insforge:auth:resetPassword', payload)
  },
  database: {
    select: (payload) => ipcRenderer.invoke('insforge:db:select', payload),
    insert: (payload) => ipcRenderer.invoke('insforge:db:insert', payload),
    update: (payload) => ipcRenderer.invoke('insforge:db:update', payload),
    delete: (payload) => ipcRenderer.invoke('insforge:db:delete', payload),
    rpc: (payload) => ipcRenderer.invoke('insforge:db:rpc', payload)
  },
  functions: {
    invoke: (payload) => ipcRenderer.invoke('insforge:functions:invoke', payload)
  },
  realtime: {
    connect: () => ipcRenderer.invoke('insforge:realtime:connect'),
    subscribe: (channel) => ipcRenderer.invoke('insforge:realtime:subscribe', channel),
    unsubscribe: (channel) => ipcRenderer.invoke('insforge:realtime:unsubscribe', channel),
    publish: (payload) => ipcRenderer.invoke('insforge:realtime:publish', payload),
    disconnect: () => ipcRenderer.invoke('insforge:realtime:disconnect')
  }
})

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }
})