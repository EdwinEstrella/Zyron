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
let notificarActualizacionCache = null

// Tablas de negocio que requieren sincronización bidireccional estricta
const TABLAS_SINCRONIZABLES = [
  'app_settings',
  'customers',
  'products',
  'invoices',
  'payments',
  'role_catalog',
  'role_permissions',
  'warehouses'
]

const MARCA_INICIAL_PULL = new Date(0).toISOString()

/**
 * Registra el cliente del SDK (Supabase o InsForge) a ser utilizado para las peticiones de red.
 * @param {Object} cliente - Cliente de la base de datos (Supabase o InsForge).
 * @param {boolean} verbose - Habilitar logs verbosos.
 */
function establecerClienteInsforge(cliente, verbose = false) {
  clienteInsforge = cliente
  logueadoVerbose = verbose
}

function establecerNotificadorActualizacionCache(notificador) {
  notificarActualizacionCache = typeof notificador === 'function' ? notificador : null
}

const establecerClienteSupabase = establecerClienteInsforge

/**
 * Retorna la interfaz de base de datos del cliente activo (compatible con Supabase y InsForge).
 * @returns {Object|null}
 */
function obtenerBaseDatosRemota() {
  if (!clienteInsforge) return null
  return typeof clienteInsforge.from === 'function' ? clienteInsforge : clienteInsforge.database
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
 * @returns {Object} Metadatos de sincronización con cursores independientes por tabla.
 */
function leerMetadatosSincronizacion(tenantId) {
  const ruta = obtenerRutaMetadatos(tenantId)
  let metadatos = {}
  if (fs.existsSync(ruta)) {
    try {
      const contenidoRaw = fs.readFileSync(ruta, 'utf8')
      metadatos = JSON.parse(contenidoRaw || '{}')
    } catch (error) {
      console.error(`[Zyron:sync] Error leyendo metadatos para tenant ${tenantId}:`, error)
    }
  }

  // El cursor global anterior no es seguro: pudo avanzar tras una respuesta vacía
  // filtrada por RLS. Las tablas sin cursor vuelven a sincronizarse desde epoch.
  const cursores =
    metadatos.pull_cursors && typeof metadatos.pull_cursors === 'object'
      ? metadatos.pull_cursors
      : {}
  let migrado = cursores !== metadatos.pull_cursors
  for (const tabla of TABLAS_SINCRONIZABLES) {
    if (typeof cursores[tabla] !== 'string' || Number.isNaN(new Date(cursores[tabla]).getTime())) {
      cursores[tabla] = MARCA_INICIAL_PULL
      migrado = true
    }
  }
  metadatos.pull_cursors = cursores
  metadatos.pull_cursor_version = 2

  if (migrado) guardarMetadatosSincronizacion(tenantId, metadatos)
  return metadatos
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
    const db = obtenerBaseDatosRemota()
    if (!db) return false
    const rawResult = await db.from('permission_catalog').select('id').limit(1)
    return !rawResult.error
  } catch (_) {
    return false
  }
}

/**
 * Confirma una sesión autenticada antes de ejecutar operaciones de sincronización.
 * La conectividad de realtime o una respuesta de PostgREST no prueban autorización.
 * @returns {Promise<boolean>} True solo cuando el SDK confirma un usuario autenticado.
 */
async function validarSesionAutenticada() {
  if (!clienteInsforge?.auth) return false
  try {
    const respuesta =
      typeof clienteInsforge.auth.getUser === 'function'
        ? await clienteInsforge.auth.getUser()
        : typeof clienteInsforge.auth.getCurrentUser === 'function'
          ? await clienteInsforge.auth.getCurrentUser()
          : null
    return !respuesta?.error && Boolean(respuesta?.data?.user || respuesta?.user)
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
  delete copia._dirty_at
  if (localdb.tablaUsaUpdatedAt(fila.__tabla_sincronizacion || '')) {
    delete copia.__tabla_sincronizacion
    return copia
  }
  delete copia.updated_at
  delete copia.__tabla_sincronizacion
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
  const fallos = []

  for (const tabla in registrosSucios) {
    if (Object.prototype.hasOwnProperty.call(registrosSucios, tabla)) {
      const filas = registrosSucios[tabla]
      if (filas.length === 0) continue

      if (logueadoVerbose) {
        console.log(`[Zyron:sync] Subiendo ${filas.length} registros sucios en tabla: ${tabla}`)
      }

      if (tabla === 'warehouses') {
        for (const fila of filas) {
          try {
            const respuesta = await sincronizarAlmacen(tenantId, fila)
            if (respuesta.error) {
              fallos.push({ tabla, id: fila.id, error: respuesta.error })
              console.error(`[Zyron:sync] Error subiendo almacén ${fila.id}:`, respuesta.error)
              continue
            }
            await localdb.limpiarMarcaSucia(
              tenantId,
              tabla,
              respuesta.data.id,
              fila._dirty_at || fila.created_at
            )
            subidasExitosas += 1
          } catch (error) {
            fallos.push({ tabla, id: fila.id, error })
            console.error(`[Zyron:sync] Excepción subiendo almacén ${fila.id}:`, error)
          }
        }
        continue
      }

      // Preparar filas para upsert por lotes en el servidor
      const filasActuales = localdb.obtenerRegistrosSucios(tenantId)[tabla] || filas
      const filasLimpias = filasActuales.map((fila) =>
        limpiarRegistroParaServidor({ ...fila, __tabla_sincronizacion: tabla })
      )

      try {
        const db = obtenerBaseDatosRemota()
        if (!db) {
          fallos.push({ tabla, error: { message: 'No hay cliente remoto disponible.' } })
          continue
        }
        const respuesta = await db.from(tabla).upsert(filasLimpias)
        if (respuesta.error) {
          console.error(`[Zyron:sync] Error subiendo tabla ${tabla}:`, respuesta.error)
          fallos.push({ tabla, error: respuesta.error })
          continue
        }

        // Confirmar éxito limpiando flag localmente
        for (const fila of filasActuales) {
          await localdb.limpiarMarcaSucia(
            tenantId,
            tabla,
            fila.id,
            fila._dirty_at || fila.updated_at
          )
        }
        subidasExitosas += filas.length
      } catch (error) {
        console.error(`[Zyron:sync] Excepción subiendo tabla ${tabla}:`, error)
        fallos.push({ tabla, error })
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
        const db = obtenerBaseDatosRemota()
        if (!db) {
          fallos.push({
            tabla: item.tabla,
            id: item.id,
            error: { message: 'No hay cliente remoto disponible.' }
          })
          break
        }
        const respuesta = await db
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
            fallos.push({ tabla: item.tabla, id: item.id, error: respuesta.error })
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
        fallos.push({ tabla: item.tabla, id: item.id, error })
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
  return {
    ok: fallos.length === 0,
    subidasExitosas,
    eliminadosExitosos: eliminadosExitosos.length,
    fallos
  }
}

// Mapeo específico de columnas de fecha incremental por tabla.
// El libro mayor publicado no participa de LWW: se consulta remotamente y se
// crea solo mediante RPCs atómicas.
const COLUMNAS_FECHA_TABLA = {
  role_permissions: 'created_at',
  warehouses: 'created_at'
}

async function sincronizarAlmacen(tenantId, fila) {
  const db = obtenerBaseDatosRemota()
  if (!db || typeof db.rpc !== 'function') {
    return { error: { message: 'El cliente remoto no admite el RPC de almacenes.' } }
  }

  const respuesta = await db.rpc('zyron_sync_warehouse', {
    p_tenant_id: tenantId,
    p_local_id: fila.id,
    p_code: fila.code,
    p_label: fila.label,
    p_is_default: Boolean(fila.is_default),
    p_is_active: fila.is_active !== false
  })
  if (respuesta.error) return respuesta

  const almacenCanonico = Array.isArray(respuesta.data) ? respuesta.data[0] : respuesta.data
  if (!almacenCanonico?.id) {
    return { error: { message: 'El RPC de almacenes no devolvió un almacén canónico.' } }
  }

  await localdb.reconciliarIdAlmacen(tenantId, fila.id, almacenCanonico)
  return { data: almacenCanonico, error: null }
}

/**
 * Ejecuta el flujo Pull (descarga de cambios remotos posteriores a la última sincronización exitosa).
 * @param {string} tenantId - Identificador del inquilino.
 */
async function ejecutarFlujoPull(tenantId) {
  if (logueadoVerbose) {
    console.log(`[Zyron:sync] Iniciando ciclo Pull para tenant: ${tenantId}`)
  }

  const metadatos = leerMetadatosSincronizacion(tenantId)
  let descargasExitosas = 0
  const tablasActualizadas = new Set()
  const fallos = []

  for (const tabla of TABLAS_SINCRONIZABLES) {
    try {
      const columnaFecha = COLUMNAS_FECHA_TABLA[tabla] || 'updated_at'
      const ultimaSincronizacion = metadatos.pull_cursors[tabla]
      if (logueadoVerbose) {
        console.log(
          `[Zyron:sync] Descargando cambios de ${tabla} desde: ${ultimaSincronizacion} usando columna: ${columnaFecha}`
        )
      }

      const db = obtenerBaseDatosRemota()
      if (!db) break

      const respuesta = await db
        .from(tabla)
        .select('*')
        .eq('tenant_id', tenantId)
        .gt(columnaFecha, ultimaSincronizacion)

      if (respuesta.error) {
        console.error(`[Zyron:sync] Error descargando cambios de tabla ${tabla}:`, respuesta.error)
        fallos.push({ tabla, error: respuesta.error })
        continue
      }

      const remotos = respuesta.data || []
      if (remotos.length > 0) {
        if (logueadoVerbose) {
          console.log(
            `[Zyron:sync] Se encontraron ${remotos.length} cambios remotos en tabla ${tabla}`
          )
        }

        let fechaMasReciente = null
        let todasLasFechasSonValidas = true
        for (const reg of remotos) {
          await localdb.upsertRemotoLWW(tenantId, tabla, reg)
          const fechaFuente = reg[columnaFecha]
          if (typeof fechaFuente === 'string' && !Number.isNaN(new Date(fechaFuente).getTime())) {
            if (!fechaMasReciente || new Date(fechaFuente) > new Date(fechaMasReciente)) {
              fechaMasReciente = fechaFuente
            }
          } else {
            todasLasFechasSonValidas = false
          }
        }
        // Solo avanzamos tras persistir todas las filas y hasta la fecha devuelta por origen.
        if (todasLasFechasSonValidas && fechaMasReciente) {
          metadatos.pull_cursors[tabla] = fechaMasReciente
        }
        descargasExitosas += remotos.length
        tablasActualizadas.add(tabla)
      }
    } catch (error) {
      console.error(`[Zyron:sync] Excepción descargando cambios de tabla ${tabla}:`, error)
      fallos.push({ tabla, error })
    }
  }

  // 3. Sincronizar datos de la propia empresa (tabla tenants)
  try {
    const db = obtenerBaseDatosRemota()
    if (!db) {
      return {
        ok: false,
        descargasExitosas,
        fallos: [
          ...fallos,
          { tabla: 'tenants', error: { message: 'No hay cliente remoto disponible.' } }
        ]
      }
    }
    const respuestaTenant = await db.from('tenants').select('*').eq('id', tenantId).limit(1)
    if (!respuestaTenant.error && respuestaTenant.data && respuestaTenant.data.length > 0) {
      const registroEmpresa = respuestaTenant.data[0]
      await localdb.upsertRemotoLWW(tenantId, 'tenants', registroEmpresa)
    }
  } catch (errorTenant) {
    console.error(
      `[Zyron:sync] Excepción descargando datos de tenants para ${tenantId}:`,
      errorTenant
    )
    fallos.push({ tabla: 'tenants', error: errorTenant })
  }

  // 4. Sincronizar catálogo global de planes de servicio (tabla planes_servicio)
  try {
    const db = obtenerBaseDatosRemota()
    if (!db) {
      return {
        ok: false,
        descargasExitosas,
        fallos: [
          ...fallos,
          { tabla: 'planes_servicio', error: { message: 'No hay cliente remoto disponible.' } }
        ]
      }
    }
    const respuestaPlanes = await db.from('planes_servicio').select('*').eq('activo', true)
    if (!respuestaPlanes.error && respuestaPlanes.data) {
      for (const plan of respuestaPlanes.data) {
        await localdb.upsertRemotoLWW(tenantId, 'planes_servicio', plan)
      }
    }
  } catch (errorPlanes) {
    console.error(
      `[Zyron:sync] Excepción descargando planes_servicio para ${tenantId}:`,
      errorPlanes
    )
    fallos.push({ tabla: 'planes_servicio', error: errorPlanes })
  }

  guardarMetadatosSincronizacion(tenantId, metadatos)

  if (tablasActualizadas.size > 0 && notificarActualizacionCache) {
    notificarActualizacionCache({ tenantId, tables: [...tablasActualizadas] })
  }

  if (logueadoVerbose) {
    console.log(
      `[Zyron:sync] Finalizado ciclo Pull para ${tenantId}. Descargados y resueltos: ${descargasExitosas}`
    )
  }
  return { ok: fallos.length === 0, descargasExitosas, fallos }
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

  const sesionAutenticada = await validarSesionAutenticada()
  if (!sesionAutenticada) {
    if (logueadoVerbose) {
      console.log(
        `[Zyron:sync] Sin sesión autenticada. Sincronización omitida para tenant: ${tenantId}`
      )
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
  try {
    console.log(
      `[Zyron:sync] === Iniciando sincronización bidireccional activa para tenant: ${tenantId} ===`
    )

    // Primero, subir cambios locales acumulados (Push)
    const resultadoPush = await ejecutarFlujoPush(tenantId)

    // Segundo, descargar modificaciones del servidor (Pull)
    const resultadoPull = await ejecutarFlujoPull(tenantId)

    if (!resultadoPush.ok || !resultadoPull.ok) {
      console.error(
        `[Zyron:sync] Sincronización incompleta para ${tenantId}. Fallos: ${resultadoPush.fallos.length + resultadoPull.fallos.length}`
      )
      return false
    }

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
  establecerClienteSupabase,
  establecerNotificadorActualizacionCache,
  sincronizarInquilino,
  iniciarSincronizacionPeriodica,
  detenerSincronizacionPeriodica,
  detenerTodos,
  __testHooks: {
    sincronizandoPorTenant,
    temporizadoresSincronizacion,
    validarConectividad,
    validarSesionAutenticada,
    ejecutarFlujoPush,
    ejecutarFlujoPull,
    establecerNotificadorActualizacionCache,
    leerMetadatosSincronizacion,
    guardarMetadatosSincronizacion
  }
}
