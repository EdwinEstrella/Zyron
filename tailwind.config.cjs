const forms = require('@tailwindcss/forms')
const containerQueries = require('@tailwindcss/container-queries')

module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './components/**/*.{html,js,css}',
    './fragments/**/*.{html,js}',
    './public/**/*.html'
  ],
  theme: {
    extend: {
      colors: {
        surface: '#f4f7fb',
        'on-surface': '#0f172a',
        'on-surface-variant': '#475569',
        primary: '#0f2744',
        'primary-container': '#1e4976',
        'on-primary-container': '#bfdbfe',
        outline: '#64748b',
        'outline-variant': '#cbd5e1',
        'surface-container': '#e8eef6',
        'surface-container-low': '#f1f5f9',
        'surface-container-lowest': '#ffffff',
        'surface-container-high': '#dce7f4',
        tertiary: '#0f766e',
        'tertiary-container': '#115e59',
        'tertiary-fixed': '#ccfbf1',
        'tertiary-fixed-dim': '#5eead4',
        'on-tertiary-fixed-variant': '#134e4a',
        error: '#b91c1c',
        'error-container': '#fecaca',
        'on-error-container': '#7f1d1d',
        'surface-tint': '#3d5e80',
        'surface-dim': '#e2e8f0',
        'on-primary-fixed-variant': '#1e3a5f',
        'on-primary-fixed': '#0f172a',
        'secondary-fixed': '#bfdbfe',
        'on-secondary-fixed': '#1e3a8a'
      },
      fontFamily: {
        headline: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: [forms, containerQueries]
}
