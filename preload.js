const { contextBridge, ipcRenderer } = require('electron')

const onMainEvent = (channel, callback) => {
  if (typeof callback !== 'function') return () => {}
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  getVersions: () => process.versions,
  savePdfFromHtml: (payload) => ipcRenderer.invoke('desktop:save-pdf-from-html', payload),
  onWindowMaximized: (callback) => onMainEvent('window-maximized', callback)
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
    resetPassword: (payload) => ipcRenderer.invoke('insforge:auth:resetPassword', payload),
    onSessionExpired: (callback) => onMainEvent('auth-session-expired', callback),
    onSessionRecovered: (callback) => onMainEvent('auth-session-recovered', callback)
  },
  database: {
    select: (payload) => ipcRenderer.invoke('insforge:db:select', payload),
    insert: (payload) => ipcRenderer.invoke('insforge:db:insert', payload),
    update: (payload) => ipcRenderer.invoke('insforge:db:update', payload),
    delete: (payload) => ipcRenderer.invoke('insforge:db:delete', payload),
    rpc: (payload) => ipcRenderer.invoke('insforge:db:rpc', payload)
  },
  accounting: {
    listAccounts: (payload) => ipcRenderer.invoke('accounting:accounts:list', payload),
    listJournalEntries: (payload) => ipcRenderer.invoke('accounting:journal-entries:list', payload),
    listJournalLines: (payload) => ipcRenderer.invoke('accounting:journal-lines:list', payload)
  },
  functions: {
    invoke: (payload) => ipcRenderer.invoke('insforge:functions:invoke', payload)
  },
  realtime: {
    connect: () => ipcRenderer.invoke('insforge:realtime:connect'),
    subscribe: (channel) => ipcRenderer.invoke('insforge:realtime:subscribe', channel),
    unsubscribe: (channel) => ipcRenderer.invoke('insforge:realtime:unsubscribe', channel),
    publish: (payload) => ipcRenderer.invoke('insforge:realtime:publish', payload),
    disconnect: () => ipcRenderer.invoke('insforge:realtime:disconnect'),
    status: () => ipcRenderer.invoke('insforge:realtime:status'),
    onStatusChanged: (callback) => onMainEvent('realtime-status-changed', callback),
    onDomainEvent: (callback) => onMainEvent('domain-event', callback)
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
