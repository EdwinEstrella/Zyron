const fs = require('fs')
let html = fs.readFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', 'utf8')

// Modifying the updateSessionNoticeBanner logic
html = html.replace(
  /const updateSessionNoticeBanner = \(\) => \{[\s\S]*?sessionNoticeBanner\.classList\.add\('hidden'\);\r?\n\};/g,
  `const updateSessionNoticeBanner = () => {
    if (!sessionNoticeBanner) return;
    if (state.realtimeStatus?.degraded && state.appUser && !isTenantPendingApproval()) {
        zyronLog('realtime:degraded_silent', 'Realtime is in degraded mode. Connection will be retried automatically.');
    }
    sessionNoticeBanner.textContent = '';
    sessionNoticeBanner.classList.add('hidden');
};`
)

fs.writeFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', html, 'utf8')
console.log('Realtime banner silenced successfully!')
