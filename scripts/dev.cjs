/**
 * Dev loop: Tailwind in watch mode + Electron with live reload
 * (see startLiveReload in main.js). Ctrl+C stops both.
 */
const { spawn } = require('node:child_process')

const children = []
const run = (command, env = {}) => {
  const child = spawn(command, {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  })
  children.push(child)
  return child
}

const stopAll = (code = 0) => {
  children.forEach((c) => {
    if (!c.killed) c.kill()
  })
  process.exit(code)
}

// `--watch=always` keeps Tailwind alive even without an attached stdin.
run('npx tailwindcss -c ./tailwind.config.cjs -i ./styles/tailwind.css -o ./public/tailwind.css --watch=always')
const electron = run('npx electron-forge start', { ZYRON_LIVE_RELOAD: '1' })

electron.on('exit', (code) => stopAll(code ?? 0))
process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
