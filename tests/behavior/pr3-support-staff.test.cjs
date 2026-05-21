const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const raiz = path.resolve(__dirname, '../..')

test('la migracion de soporte y staff declara las funciones de seguridad y roles', () => {
  const carpetaMigraciones = path.join(raiz, 'migrations')
  const archivoMigracion = fs.readdirSync(carpetaMigraciones).find((archivo) => /support-staff-roles\.sql$/.test(archivo))
  assert.ok(archivoMigracion, 'El archivo de migracion de roles de staff y soporte debe existir')

  const sql = fs.readFileSync(path.join(carpetaMigraciones, archivoMigracion), 'utf8')

  // Validar que se redefinan las funciones de super administrador
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_super_admin/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_strict_super_admin/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.check_user_permission/i)

  // Validar que el rol global 'staff' este incluido en is_super_admin
  assert.match(sql, /global_role IN \('super_admin', 'staff'\)/i)

  // Validar que is_strict_super_admin sea exclusivo de super_admin
  assert.match(sql, /global_role = 'super_admin'/i)

  // Validar que no contenga declaraciones de transaccion explicitas incompatibles
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im)
})
