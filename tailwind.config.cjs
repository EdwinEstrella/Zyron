const forms = require('@tailwindcss/forms')
const containerQueries = require('@tailwindcss/container-queries')

module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './renderer.js',
    './components/**/*.{html,js,css}',
    './fragments/**/*.{html,js}',
    './public/**/*.html'
  ],
  theme: {
    extend: {
      colors: {
        surface: '#e6ecf4',
        'on-surface': '#0f172a',
        'on-surface-variant': '#334155',
        primary: '#0f2744',
        'on-primary': '#ffffff',
        'primary-container': '#1e4976',
        'on-primary-container': '#bfdbfe',
        'primary-variant': '#1a3b61',
        outline: '#475569',
        'outline-variant': '#64748b',
        'surface-container': '#dfe7f1',
        'surface-container-low': '#eef2f8',
        'surface-container-lowest': '#ffffff',
        'surface-container-high': '#d3deec',
        'surface-container-highest': '#c4d3e6',
        tertiary: '#0f766e',
        'tertiary-container': '#115e59',
        'tertiary-fixed': '#ccfbf1',
        'tertiary-fixed-dim': '#5eead4',
        'on-tertiary-fixed-variant': '#134e4a',
        error: '#b91c1c',
        'error-container': '#fecaca',
        'on-error-container': '#7f1d1d',
        'surface-tint': '#3d5e80',
        'surface-dim': '#d5dde8',
        'on-primary-fixed-variant': '#1e3a5f',
        'on-primary-fixed': '#0f172a',
        'secondary-fixed': '#bfdbfe',
        'on-secondary-fixed': '#1e3a8a',
        accent: '#0284c7',
        'accent-soft': '#38bdf8'
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15,39,68,.14), 0 1px 3px rgba(15,39,68,.10)',
        md: '0 2px 4px rgba(15,39,68,.12), 0 4px 10px rgba(15,39,68,.10)',
        lg: '0 4px 8px rgba(15,39,68,.12), 0 12px 24px rgba(15,39,68,.14)'
      },
      fontFamily: {
        headline: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: [forms, containerQueries]
}
