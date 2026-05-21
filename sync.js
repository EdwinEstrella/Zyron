/**
 * @file sync.js
 * @description Motor de sincronización bidireccional asíncrona y automática para Zyron.
 * Realiza Push (subida de sucios y eliminaciones) y Pull (bajada de remotos) con Last-Write-Wins.
 * CERO INGLÉS en comentarios, logs y variables.
 */

const fs = require('node:fs')
const path = require('node:path')
const localdb = require('./localdb')

// Estado interno del motor de sincronización
const sincronizandoPorTenant = new Map() // tenantId -> booleano
const temporizadoresSincronizacion = new Map() // tenantId -> Timer
let clienteInsforge = null
let logueadoVerbose = false

// Tablas de negocio que requieren sincronización bidireccional estricta
const TABLAS_SINCRONIZABLES = [
  'app_settings',
  'customers',
  'products',
  'invoices',
  'payments',
  'accounting_accounts',
  'accounting_journal_entries',
  'accounting_journal_lines',
  'role_catalog',
  'role_permissions'
]

/**
 * Registra el cliente del SDK de InsForge a ser utilizado para las peticiones de red.
 * @param {Object} cliente - Cliente de la base de datos de InsForge.
 * @param {boolean} verbose - Habilitar logs verbosos.
 */
function establecerClienteInsforge(cliente, verbose = false) {
  clienteInsforge = cliente
  logueadoVerbose = verbose
}

/**
 * Obtiene la ruta del archivo de metadatos de sincronización del tenant.
 * @param {string} tenantId - Identificador del inquilino.
 * @returns {string} Ruta absoluta del JSON de metadatos.
 */
function obtenerRutaMetadatos(tenantId) {
  // Obtenemos la ruta usando el hook de test de localdb
  const rutaArchivoTabla = localdb.__testHooks.obtenerRutaArchivo(
    tenantId,
    '_metadata_sincronizacion'
  )
  return rutaArchivoTabla
}

/**
 * Lee los metadatos de sincronización de un tenant.
 * @param {string} tenantId - Identificador del inquilino.
 * @returns {Object} Metadatos de sincronización ({ last_pulled_at, last_pushed_at }).
 */
function leerMetadatosSincronizacion(tenantId) {
  const ruta = obtenerRutaMetadatos(tenantId)
  if (fs.existsSync(ruta)) {
    try {
      const contenidoRaw = fs.readFileSync(ruta, 'utf8')
      return JSON.parse(contenidoRaw || '{}')
    } catch (error) {
      console.error(`[Zyron:sync] Error leyendo metadatos para tenant ${tenantId}:`, error)
    }
  }
  return { last_pulled_at: new Date(0).toISOString() } // Epoch por defecto
}

/**
 * Guarda los metadatos de sincronización de un tenant.
 * @param {string} tenantId - Identificador del inquilino.
 * @param {Object} metadatos - Nuevos metadatos.
 */
function guardarMetadatosSincronizacion(tenantId, metadatos) {
  const ruta = obtenerRutaMetadatos(tenantId)
  try {
    fs.writeFileSync(ruta, JSON.stringify(metadatos, null, 2), 'utf8')
  } catch (error) {
    console.error(`[Zyron:sync] Error guardando metadatos para tenant ${tenantId}:`, error)
  }
}

/**
 * Valida de forma rápida si la red está disponible y el cliente responde.
 * @returns {Promise<boolean>} True si hay conexión activa.
 */
async function validarConectividad() {
  if (!clienteInsforge) return false
  try {
    // Ping ligero a la API de InsForge a través del cliente auth o realtime
    if (typeof clienteInsforge.realtime?.status === 'function') {
      // Estado de conexión del realtime es un gran indicador
      const status = await clienteInsforge.realtime.status()
      if (status && status.ok !== false) return true
    }
    // Fallback: consulta ultra ligera a una tabla de sistema remota
    const rawResult = await clienteInsforge.database
      .from('permission_catalog')
      .select('id')
      .limit(1)
    return !rawResult.error
  } catch (_) {
    return false
  }
}

/**
 * Limpia y prepara un registro local removiendo propiedades de control local-first
 * para poder guardarlo en el servidor remoto sin generar errores de esquema.
 * @param {Object} fila - Registro local.
 * @returns {Object} Registro limpio.
 */
function limpiarRegistroParaServidor(fila) {
  const copia = { ...fila }
  // Eliminar flags locales que no existen en las columnas del backend
  delete copia._dirty
  return copia
}

/**
 * Ejecuta el flujo Push (subida de modificaciones y eliminaciones locales).
 * @param {string} tenantId - Identificador del inquilino.
 */
async function ejecutarFlujoPush(tenantId) {
  if (logueadoVerbose) {
    console.log(`[Zyron:sync] Iniciando ciclo Push para tenant: ${tenantId}`)
  }

  // 1. Procesar registros modificados o nuevos (_dirty = true)
  const registrosSucios = localdb.obtenerRegistrosSucios(tenantId)
  let subidasExitosas = 0

  for (const tabla in registrosSucios) {
    if (Object.prototype.hasOwnProperty.call(registrosSucios, tabla)) {
      const filas = registrosSucios[tabla]
      if (filas.length === 0) continue

      if (logueadoVerbose) {
        console.log(`[Zyron:sync] Subiendo ${filas.length} registros sucios en tabla: ${tabla}`)
      }

      // Preparar filas para upsert por lotes en el servidor
      const filasLimpias = filas.map(limpiarRegistroParaServidor)

      try {
        const respuesta = await clienteInsforge.database.from(tabla).upsert(filasLimpias)
        if (respuesta.error) {
          console.error(`[Zyron:sync] Error subiendo tabla ${tabla}:`, respuesta.error)
          continue
        }

        // Confirmar éxito limpiando flag localmente
        for (const fila of filas) {
          await localdb.limpiarMarcaSucia(tenantId, tabla, fila.id, fila.updated_at)
        }
        subidasExitosas += filas.length
      } catch (error) {
        console.error(`[Zyron:sync] Excepción subiendo tabla ${tabla}:`, error)
      }
    }
  }

  // 2. Procesar eliminaciones pendientes
  const eliminaciones = localdb.asegurarEliminacionesCargadas(tenantId)
  const eliminadosExitosos = []

  if (eliminaciones.length > 0) {
    if (logueadoVerbose) {
      console.log(`[Zyron:sync] Procesando ${eliminaciones.length} eliminaciones offline...`)
    }

    for (const item of eliminaciones) {
      try {
        const respuesta = await clienteInsforge.database
          .from(item.tabla)
          .delete()
          .eq('id', item.id)
          .eq('tenant_id', tenantId)

        if (respuesta.error) {
          // Si el registro ya no existe en el servidor (404 o PGRST116), lo consideramos exitoso
          const statusErr = respuesta.error.status || respuesta.error.statusCode
          if (statusErr === 404 || respuesta.error.code === 'PGRST116') {
            eliminadosExitosos.push(item)
          } else {
            console.error(
              `[Zyron:sync] Error eliminando ID ${item.id} en ${item.tabla}:`,
              respuesta.error
            )
          }
        } else {
          eliminadosExitosos.push(item)
        }
      } catch (error) {
        console.error(`[Zyron:sync] Excepción eliminando ID ${item.id} en ${item.tabla}:`, error)
      }
    }

    if (eliminadosExitosos.length > 0) {
      await localdb.limpiarEliminacionesProcesadas(tenantId, eliminadosExitosos)
    }
  }

  if (logueadoVerbose) {
    console.log(
      `[Zyron:sync] Finalizado ciclo Push para ${tenantId}. Subidos: ${subidasExitosas}, Eliminados: ${eliminadosExitosos.length}`
    )
  }
}

/**
 * Ejecuta el flujo Pull (descarga de cambios remotos posteriores a la última sincronización exitosa).
 * @param {string} tenantId - Identificador del inquilino.
 * @param {string} inicioCicloTimestamp - Marca de tiempo ISO tomada al iniciar este ciclo.
 */
async function ejecutarFlujoPull(tenantId, inicioCicloTimestamp) {
  if (logueadoVerbose) {
    console.log(`[Zyron:sync] Iniciando ciclo Pull para tenant: ${tenantId}`)
  }

  const metadatos = leerMetadatosSincronizacion(tenantId)
  const ultimaSincronizacion = metadatos.last_pulled_at || new Date(0).toISOString()
  let descargasExitosas = 0
  let erroresRegistrados = false

  for (const tabla of TABLAS_SINCRONIZABLES) {
    try {
      if (logueadoVerbose) {
        console.log(`[Zyron:sync] Descargando cambios de ${tabla} desde: ${ultimaSincronizacion}`)
      }

      const respuesta = await clienteInsforge.database
        .from(tabla)
        .select('*')
        .eq('tenant_id', tenantId)
        .gt('updated_at', ultimaSincronizacion)

      if (respuesta.error) {
        console.error(`[Zyron:sync] Error descargando cambios de tabla ${tabla}:`, respuesta.error)
        erroresRegistrados = true
        continue
      }

      const remotos = respuesta.data || []
      if (remotos.length > 0) {
        if (logueadoVerbose) {
          console.log(
            `[Zyron:sync] Se encontraron ${remotos.length} cambios remotos en tabla ${tabla}`
          )
        }

        for (const reg of remotos) {
          await localdb.upsertRemotoLWW(tenantId, tabla, reg)
        }
        descargasExitosas += remotos.length
      }
    } catch (error) {
      console.error(`[Zyron:sync] Excepción descargando cambios de tabla ${tabla}:`, error)
      erroresRegistrados = true
    }
  }

  // Si se completaron todas las consultas sin errores, actualizamos el timestamp del Pull exitoso
  if (!erroresRegistrados) {
    metadatos.last_pulled_at = inicioCicloTimestamp
    guardarMetadatosSincronizacion(tenantId, metadatos)
    if (logueadoVerbose) {
      console.log(
        `[Zyron:sync] Pull exitoso. Metadatos de última sincronización actualizados a: ${inicioCicloTimestamp}`
      )
    }
  }

  if (logueadoVerbose) {
    console.log(
      `[Zyron:sync] Finalizado ciclo Pull para ${tenantId}. Descargados y resueltos: ${descargasExitosas}`
    )
  }
}

/**
 * Ejecuta una sincronización bidireccional completa (Push + Pull) de forma atómica para un inquilino.
 * @param {string} tenantId - Identificador del inquilino.
 * @returns {Promise<boolean>} True si la sincronización fue exitosa.
 */
async function sincronizarInquilino(tenantId) {
  if (!tenantId) return false
  if (sincronizandoPorTenant.get(tenantId)) {
    if (logueadoVerbose) {
      console.log(`[Zyron:sync] Sincronización en curso omitida para tenant: ${tenantId}`)
    }
    return false
  }

  const enLinea = await validarConectividad()
  if (!enLinea) {
    if (logueadoVerbose) {
      console.log(`[Zyron:sync] Sin conectividad. Sincronización omitida para tenant: ${tenantId}`)
    }
    return false
  }

  sincronizandoPorTenant.set(tenantId, true)
  const inicioCiclo = new Date().toISOString()

  try {
    console.log(
      `[Zyron:sync] === Iniciando sincronización bidireccional activa para tenant: ${tenantId} ===`
    )

    // Primero, subir cambios locales acumulados (Push)
    await ejecutarFlujoPush(tenantId)

    // Segundo, descargar modificaciones del servidor (Pull)
    await ejecutarFlujoPull(tenantId, inicioCiclo)

    console.log(`[Zyron:sync] === Sincronización completada con éxito para tenant: ${tenantId} ===`)
    return true
  } catch (error) {
    console.error(
      `[Zyron:sync] Error crítico durante la sincronización del tenant ${tenantId}:`,
      error
    )
    return false
  } finally {
    sincronizandoPorTenant.set(tenantId, false)
  }
}

/**
 * Registra y arranca un temporizador de sincronización periódica en segundo plano para un inquilino.
 * @param {string} tenantId - Identificador del inquilino.
 * @param {number} intervaloSegundos - Intervalo de tiempo en segundos (por defecto 30).
 */
function iniciarSincronizacionPeriodica(tenantId, intervaloSegundos = 30) {
  if (!tenantId) return

  // Detener temporizador previo si existe
  detenerSincronizacionPeriodica(tenantId)

  if (logueadoVerbose) {
    console.log(
      `[Zyron:sync] Registrando bucle de sincronización cada ${intervaloSegundos}s para tenant: ${tenantId}`
    )
  }

  // Ejecución inmediata inicial
  sincronizarInquilino(tenantId)

  const timer = setInterval(() => {
    sincronizarInquilino(tenantId)
  }, intervaloSegundos * 1000)

  // Asegurar que el proceso principal de Electron no quede bloqueado al cerrar ventanas
  if (typeof timer.unref === 'function') {
    timer.unref()
  }

  temporizadoresSincronizacion.set(tenantId, timer)
}

/**
 * Detiene el bucle periódico de sincronización para un inquilino.
 * @param {string} tenantId - Identificador del inquilino.
 */
function detenerSincronizacionPeriodica(tenantId) {
  if (!tenantId) return
  const timer = temporizadoresSincronizacion.get(tenantId)
  if (timer) {
    clearInterval(timer)
    temporizadoresSincronizacion.delete(tenantId)
    if (logueadoVerbose) {
      console.log(`[Zyron:sync] Sincronización periódica detenida para tenant: ${tenantId}`)
    }
  }
}

/**
 * Detiene todos los bucles de sincronización activos.
 */
function detenerTodos() {
  for (const tenantId of temporizadoresSincronizacion.keys()) {
    detenerSincronizacionPeriodica(tenantId)
  }
  sincronizandoPorTenant.clear()
}

module.exports = {
  establecerClienteInsforge,
  sincronizarInquilino,
  iniciarSincronizacionPeriodica,
  detenerSincronizacionPeriodica,
  detenerTodos,
  __testHooks: {
    sincronizandoPorTenant,
    temporizadoresSincronizacion,
    validarConectividad,
    ejecutarFlujoPush,
    ejecutarFlujoPull,
    leerMetadatosSincronizacion,
    guardarMetadatosSincronizacion
  }
}
