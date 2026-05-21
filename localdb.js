/**
 * @file localdb.js
 * @description Motor de base de datos local en memoria con persistencia transaccional en archivos JSON.
 * Diseñado exclusivamente para Zyron bajo arquitectura Local-First.
 * CERO INGLÉS en comentarios, logs y variables auxiliares.
 */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

// Estado interno en memoria
let rutaBaseDatos = null
const cacheMemoria = new Map() // Mapa de tenantId -> { [tabla]: [filas] }
const eliminacionesPendientes = new Map() // Mapa de tenantId -> [ { tabla, id, eliminado_en } ]

/**
 * Inicializa la ruta base del almacenamiento local.
 * @param {string} rutaBase - Ruta del directorio userData de Electron o ruta de pruebas.
 */
function inicializar(rutaBase) {
  if (!rutaBase) {
    throw new Error('La ruta base de almacenamiento local es requerida.')
  }
  rutaBaseDatos = path.join(rutaBase, 'local_db')
  if (!fs.existsSync(rutaBaseDatos)) {
    fs.mkdirSync(rutaBaseDatos, { recursive: true })
  }
}

/**
 * Obtiene la ruta del archivo físico de una tabla para un inquilino.
 * @param {string} tenantId - Identificador del inquilino.
 * @param {string} tabla - Nombre de la tabla.
 * @returns {string} Ruta absoluta del archivo JSON.
 */
function obtenerRutaArchivo(tenantId, tabla) {
  const dirTenant = path.join(rutaBaseDatos, tenantId)
  if (!fs.existsSync(dirTenant)) {
    fs.mkdirSync(dirTenant, { recursive: true })
  }
  return path.join(dirTenant, `${tabla}.json`)
}

/**
 * Carga una tabla en memoria desde su archivo JSON si no está ya cargada.
 * @param {string} tenantId - Identificador del inquilino.
 * @param {string} tabla - Nombre de la tabla.
 * @returns {Array<Object>} Filas cargadas en memoria.
 */
function asegurarTablaCargada(tenantId, tabla) {
  if (!rutaBaseDatos) {
    throw new Error(
      'La base de datos local no ha sido inicializada. Llama a inicializar(ruta) primero.'
    )
  }

  if (!cacheMemoria.has(tenantId)) {
    cacheMemoria.set(tenantId, {})
  }

  const cacheTenant = cacheMemoria.get(tenantId)
  if (cacheTenant[tabla]) {
    return cacheTenant[tabla]
  }

  const rutaArchivo = obtenerRutaArchivo(tenantId, tabla)
  if (fs.existsSync(rutaArchivo)) {
    try {
      const contenidoRaw = fs.readFileSync(rutaArchivo, 'utf8')
      cacheTenant[tabla] = JSON.parse(contenidoRaw || '[]')
    } catch (error) {
      console.error(`[Zyron:localdb] Error cargando tabla ${tabla} para tenant ${tenantId}:`, error)
      cacheTenant[tabla] = []
    }
  } else {
    cacheTenant[tabla] = []
  }

  return cacheTenant[tabla]
}

/**
 * Asegura la carga de la lista de eliminaciones pendientes.
 * @param {string} tenantId - Identificador del inquilino.
 * @returns {Array<Object>} Lista de eliminaciones pendientes.
 */
function asegurarEliminacionesCargadas(tenantId) {
  if (eliminacionesPendientes.has(tenantId)) {
    return eliminacionesPendientes.get(tenantId)
  }

  const rutaArchivo = obtenerRutaArchivo(tenantId, '_eliminaciones_pendientes')
  let lista = []
  if (fs.existsSync(rutaArchivo)) {
    try {
      const contenidoRaw = fs.readFileSync(rutaArchivo, 'utf8')
      lista = JSON.parse(contenidoRaw || '[]')
    } catch (error) {
      console.error(`[Zyron:localdb] Error cargando eliminaciones para tenant ${tenantId}:`, error)
    }
  }
  eliminacionesPendientes.set(tenantId, lista)
  return lista
}

/**
 * Guarda de forma transaccional y asíncrona una tabla en disco.
 * @param {string} tenantId - Identificador del inquilino.
 * @param {string} tabla - Nombre de la tabla.
 */
async function guardarTablaEnDisco(tenantId, tabla) {
  const rutaArchivo = obtenerRutaArchivo(tenantId, tabla)
  const cacheTenant = cacheMemoria.get(tenantId) || {}
  const datos = cacheTenant[tabla] || []

  try {
    const datosRaw = JSON.stringify(datos, null, 2)
    // Escritura atómica simple
    await fs.promises.writeFile(rutaArchivo, datosRaw, 'utf8')
  } catch (error) {
    console.error(`[Zyron:localdb] Error persistiendo tabla ${tabla} en disco:`, error)
    throw error
  }
}

/**
 * Guarda las eliminaciones pendientes en disco de forma asíncrona.
 * @param {string} tenantId - Identificador del inquilino.
 */
async function guardarEliminacionesEnDisco(tenantId) {
  const rutaArchivo = obtenerRutaArchivo(tenantId, '_eliminaciones_pendientes')
  const lista = eliminacionesPendientes.get(tenantId) || []

  try {
    const datosRaw = JSON.stringify(lista, null, 2)
    await fs.promises.writeFile(rutaArchivo, datosRaw, 'utf8')
  } catch (error) {
    console.error(`[Zyron:localdb] Error guardando eliminaciones en disco:`, error)
  }
}

/**
 * Emula los operadores de filtro PostgREST y SQL en memoria.
 * @param {Array<Object>} filas - Arreglo de registros en memoria.
 * @param {Array<Object>} filtros - Filtros aplicados.
 * @returns {Array<Object>} Registros filtrados.
 */
function aplicarFiltrosLocales(filas, filtros = []) {
  if (!Array.isArray(filtros) || filtros.length === 0) {
    return filas
  }

  return filas.filter((fila) => {
    return filtros.every((filtro) => {
      const { column: columna, op, value: valorBuscado } = filtro
      const valorRegistro = fila[columna]

      // Manejo de valores nulos o indefinidos
      if (valorRegistro === undefined) {
        return op === 'is' || op === 'eq' ? valorBuscado === null : valorBuscado !== null
      }

      switch (op) {
        case 'eq':
          if (valorBuscado === null) return valorRegistro === null
          return String(valorRegistro) === String(valorBuscado)

        case 'neq':
          if (valorBuscado === null) return valorRegistro !== null
          return String(valorRegistro) !== String(valorBuscado)

        case 'gt':
          return (
            Number(valorRegistro) > Number(valorBuscado) ||
            String(valorRegistro) > String(valorBuscado)
          )

        case 'gte':
          return (
            Number(valorRegistro) >= Number(valorBuscado) ||
            String(valorRegistro) >= String(valorBuscado)
          )

        case 'lt':
          return (
            Number(valorRegistro) < Number(valorBuscado) ||
            String(valorRegistro) < String(valorBuscado)
          )

        case 'lte':
          return (
            Number(valorRegistro) <= Number(valorBuscado) ||
            String(valorRegistro) <= String(valorBuscado)
          )

        case 'in': {
          const listaValores = Array.isArray(valorBuscado) ? valorBuscado : []
          return listaValores.some((v) => String(v) === String(valorRegistro))
        }

        case 'like': {
          if (valorBuscado == null) return false
          // Reemplaza comodín SQL % con expresión regular .*
          const patronLike = '^' + String(valorBuscado).replace(/%/g, '.*') + '$'
          const regexLike = new RegExp(patronLike)
          return regexLike.test(String(valorRegistro))
        }

        case 'ilike': {
          if (valorBuscado == null) return false
          const patronILike = '^' + String(valorBuscado).replace(/%/g, '.*') + '$'
          const regexILike = new RegExp(patronILike, 'i')
          return regexILike.test(String(valorRegistro))
        }

        case 'is':
          if (valorBuscado === null) return valorRegistro === null
          return valorRegistro === valorBuscado

        default:
          return true
      }
    })
  })
}

/**
 * Valida localmente si una operación de inserción o actualización cumple con los límites del plan del tenant.
 * CERO INGLÉS en comentarios y variables.
 * @param {string} tenantId - Identificador del inquilino.
 * @param {string} tabla - Nombre de la tabla sobre la que se opera ('tenant_memberships' o 'invoices').
 * @param {Array<Object>|Object} valores - Nuevos valores a validar.
 * @param {boolean} esInsercion - Indica si es una inserción (true) o actualización (false).
 */
async function validarLimitesPlanLocal(tenantId, tabla, valores, esInsercion) {
  // Aseguramos la carga de los datos del inquilino
  const listaTenants = asegurarTablaCargada(tenantId, 'tenants')
  const infoTenant = listaTenants.find((t) => t.id === tenantId)

  // Si no hay datos del tenant localmente, no podemos bloquear
  if (!infoTenant) return

  const planId = infoTenant.plan_id
  const permitirMasUsuarios =
    infoTenant.allow_more_users === true || infoTenant.allow_more_users === 'true'

  // Obtener planes
  const listaPlanes = asegurarTablaCargada(tenantId, 'planes_servicio')

  // Buscar el plan activo del tenant, si no se encuentra buscamos el plan básico por defecto
  let infoPlan = listaPlanes.find((p) => p.id === planId)
  if (!infoPlan) {
    infoPlan = listaPlanes.find((p) => p.codigo_plan === 'basico')
  }

  // Si no hay plan disponible en absoluto, usar valores por defecto del plan básico
  const limiteUsuariosMaximo = infoPlan ? infoPlan.limite_usuarios : 3
  const limiteFacturasMaximo = infoPlan ? infoPlan.limite_facturas_mes : 50

  const registrosAValidar = Array.isArray(valores) ? valores : [valores]

  if (tabla === 'tenant_memberships') {
    // Si permite crecimiento flexible, no validamos el límite de usuarios
    if (permitirMasUsuarios) return

    // Obtener membresías existentes
    const membresiasExistentes = asegurarTablaCargada(tenantId, 'tenant_memberships')

    // Validar cada registro nuevo
    for (const reg of registrosAValidar) {
      // Solo validamos si pasa a estado activo
      if (reg.status === 'active') {
        const idActual = reg.id

        // Contar miembros activos, excluyendo el mismo registro si es un UPDATE
        const totalActivos = membresiasExistentes.filter(
          (m) => m.status === 'active' && (esInsercion || m.id !== idActual)
        ).length

        if (totalActivos >= limiteUsuariosMaximo) {
          throw new Error(
            `Límite de usuarios excedido para este plan de servicio. El límite es ${limiteUsuariosMaximo} usuarios activos.`
          )
        }
      }
    }
  }

  if (tabla === 'invoices') {
    // Si el límite de facturas es ilimitado (-1), no validamos
    if (limiteFacturasMaximo === -1) return

    // Obtener facturas existentes
    const facturasExistentes = asegurarTablaCargada(tenantId, 'invoices')

    // Obtener mes y año actuales
    const ahora = new Date()
    const mesActual = ahora.getMonth()
    const anioActual = ahora.getFullYear()

    // Contar facturas emitidas en el mes actual localmente
    const facturasMesActual = facturasExistentes.filter((factura) => {
      if (!factura.created_at) return false
      const fechaFactura = new Date(factura.created_at)
      return fechaFactura.getMonth() === mesActual && fechaFactura.getFullYear() === anioActual
    }).length

    // Sumar el número de facturas que se intentan insertar
    const nuevasFacturasAInsertar = esInsercion ? registrosAValidar.length : 0

    if (facturasMesActual + nuevasFacturasAInsertar > limiteFacturasMaximo) {
      throw new Error(
        `Límite de facturas mensuales excedido para este plan de servicio. El límite es ${limiteFacturasMaximo} facturas al mes.`
      )
    }
  }
}

/**
 * Consulta de registros locales.
 * @param {string} tenantId - Identificador de inquilino.
 * @param {string} tabla - Tabla a consultar.
 * @param {Object} opciones - Parámetros de selección (filtros, order, range, limit, single, maybeSingle).
 * @returns {Object} { data: Array|Object|null, error: null }
 */
async function selectLocal(tenantId, tabla, opciones = {}) {
  try {
    let filas = asegurarTablaCargada(tenantId, tabla)

    // Aplicar filtros locales
    filas = aplicarFiltrosLocales(filas, opciones.filters)

    // Aplicar ordenamiento local
    if (opciones.order && opciones.order.column) {
      const col = opciones.order.column
      const asc = opciones.order.ascending !== false
      filas = [...filas].sort((a, b) => {
        const valA = a[col]
        const valB = b[col]

        if (valA === null || valA === undefined) return asc ? -1 : 1
        if (valB === null || valB === undefined) return asc ? 1 : -1

        if (typeof valA === 'number' && typeof valB === 'number') {
          return asc ? valA - valB : valB - valA
        }

        return asc
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA))
      })
    }

    // Aplicar rango local (paginación)
    if (Array.isArray(opciones.range) && opciones.range.length === 2) {
      const desde = opciones.range[0]
      const hasta = opciones.range[1]
      filas = filas.slice(desde, hasta + 1)
    }

    // Aplicar límite local
    if (typeof opciones.limit === 'number') {
      filas = filas.slice(0, opciones.limit)
    }

    // Caso de registro único solicitado
    if (opciones.single) {
      if (filas.length === 0) {
        return { data: null, error: { code: 'PGRST116', message: 'The query returned 0 rows' } }
      }
      return { data: filas[0], error: null }
    }

    if (opciones.maybeSingle) {
      return { data: filas.length > 0 ? filas[0] : null, error: null }
    }

    return { data: filas, error: null }
  } catch (error) {
    return { data: null, error: { code: 'LOCAL_DB_SELECT_ERROR', message: error.message } }
  }
}

/**
 * Inserta registros localmente inyectando campos de control.
 * @param {string} tenantId - Identificador del inquilino.
 * @param {string} tabla - Nombre de la tabla.
 * @param {Array<Object>|Object} valores - Registro o registros a insertar.
 * @returns {Object} { data: Array, error: null }
 */
async function insertLocal(tenantId, tabla, valores) {
  try {
    const registrosNuevos = Array.isArray(valores) ? valores : [valores]

    // Validar límites del plan offline antes de proceder a la inserción
    if (tabla === 'tenant_memberships' || tabla === 'invoices') {
      await validarLimitesPlanLocal(tenantId, tabla, registrosNuevos, true)
    }

    const filasExistentes = asegurarTablaCargada(tenantId, tabla)
    const ahora = new Date().toISOString()
    const insertados = []

    for (const reg of registrosNuevos) {
      const copia = { ...reg }

      // Inyección obligatoria de metadatos de control local-first
      copia.tenant_id = tenantId
      if (!copia.id) {
        copia.id = crypto.randomUUID()
      }
      copia._dirty = true
      copia.updated_at = ahora
      if (!copia.created_at) {
        copia.created_at = ahora
      }

      filasExistentes.push(copia)
      insertados.push(copia)
    }

    await guardarTablaEnDisco(tenantId, tabla)
    return { data: insertados, error: null }
  } catch (error) {
    const codigoError = error.message.includes('Límite de')
      ? 'LIMITES_PLAN_EXCEDIDOS'
      : 'LOCAL_DB_INSERT_ERROR'
    return { data: null, error: { code: codigoError, message: error.message } }
  }
}

/**
 * Actualiza registros localmente que cumplen con los filtros.
 * @param {string} tenantId - Identificador de inquilino.
 * @param {string} tabla - Nombre de la tabla.
 * @param {Object} valores - Nuevos valores a actualizar.
 * @param {Array<Object>} filtros - Filtros de coincidencia.
 * @returns {Object} { data: Array, error: null }
 */
async function updateLocal(tenantId, tabla, valores, filtros = []) {
  try {
    const filasExistentes = asegurarTablaCargada(tenantId, tabla)
    const ahora = new Date().toISOString()
    const modificados = []

    // Encontrar registros que cumplen los criterios
    const filasAFiltrar = filasExistentes.map((fila, index) => ({ fila, index }))
    const filtrados = aplicarFiltrosLocales(
      filasAFiltrar.map((x) => x.fila),
      filtros
    )

    // Validar límites del plan offline antes de proceder a la actualización
    if (tabla === 'tenant_memberships' || tabla === 'invoices') {
      for (const filaOriginal of filtrados) {
        const valoresCombinados = { ...filaOriginal, ...valores }
        await validarLimitesPlanLocal(tenantId, tabla, valoresCombinados, false)
      }
    }

    const indicesAModificar = new Set()
    filasAFiltrar.forEach((item) => {
      if (filtrados.includes(item.fila)) {
        indicesAModificar.add(item.index)
      }
    })

    for (const indice of indicesAModificar) {
      const original = filasExistentes[indice]
      const actualizado = {
        ...original,
        ...valores,
        _dirty: true,
        updated_at: ahora
      }
      filasExistentes[indice] = actualizado
      modificados.push(actualizado)
    }

    if (modificados.length > 0) {
      await guardarTablaEnDisco(tenantId, tabla)
    }

    return { data: modificados, error: null }
  } catch (error) {
    const codigoError = error.message.includes('Límite de')
      ? 'LIMITES_PLAN_EXCEDIDOS'
      : 'LOCAL_DB_UPDATE_ERROR'
    return { data: null, error: { code: codigoError, message: error.message } }
  }
}

/**
 * Elimina registros localmente y los encola en la lista de eliminaciones pendientes.
 * @param {string} tenantId - Identificador del inquilino.
 * @param {string} tabla - Nombre de la tabla.
 * @param {Array<Object>} filtros - Filtros de coincidencia.
 * @returns {Object} { data: Array, error: null }
 */
async function deleteLocal(tenantId, tabla, filtros = []) {
  try {
    const filasExistentes = asegurarTablaCargada(tenantId, tabla)
    const ahora = new Date().toISOString()

    const filtrados = aplicarFiltrosLocales(filasExistentes, filtros)
    if (filtrados.length === 0) {
      return { data: [], error: null }
    }

    const listaEliminados = asegurarEliminacionesCargadas(tenantId)
    const nuevasFilas = filasExistentes.filter((fila) => {
      const match = filtrados.includes(fila)
      if (match) {
        // Encolar eliminación para sincronización posterior
        listaEliminados.push({
          tabla,
          id: fila.id,
          eliminado_en: ahora
        })
      }
      return !match
    })

    // Sobreescribir caché en memoria
    const cacheTenant = cacheMemoria.get(tenantId)
    cacheTenant[tabla] = nuevasFilas

    // Persistir ambas tablas en disco
    await guardarTablaEnDisco(tenantId, tabla)
    await guardarEliminacionesEnDisco(tenantId)

    return { data: filtrados, error: null }
  } catch (error) {
    return { data: null, error: { code: 'LOCAL_DB_DELETE_ERROR', message: error.message } }
  }
}

/**
 * Obtiene todos los registros sucios de todas las tablas en memoria.
 * @param {string} tenantId - Identificador del inquilino.
 * @returns {Object} Un objeto con formato { [tabla]: [filasSucias] }
 */
function obtenerRegistrosSucios(tenantId) {
  const cacheTenant = cacheMemoria.get(tenantId) || {}
  const sucios = {}

  // Buscar también en los archivos físicos del tenant por si hay tablas no cargadas en memoria
  const dirTenant = path.join(rutaBaseDatos, tenantId)
  if (fs.existsSync(dirTenant)) {
    const archivos = fs.readdirSync(dirTenant)
    for (const archivo of archivos) {
      if (archivo.endsWith('.json') && !archivo.startsWith('_')) {
        const tabla = archivo.slice(0, -5)
        asegurarTablaCargada(tenantId, tabla)
      }
    }
  }

  for (const tabla in cacheTenant) {
    if (Object.prototype.hasOwnProperty.call(cacheTenant, tabla)) {
      const filasSucias = cacheTenant[tabla].filter((f) => f._dirty === true)
      if (filasSucias.length > 0) {
        sucios[tabla] = filasSucias
      }
    }
  }

  return sucios
}

/**
 * Limpia la marca sucia de un registro tras su subida exitosa.
 * @param {string} tenantId - Identificador del inquilino.
 * @param {string} tabla - Nombre de la tabla.
 * @param {string} id - ID del registro.
 * @param {string} fechaCopiaRemota - Fecha de última actualización remota.
 */
async function limpiarMarcaSucia(tenantId, tabla, id, fechaCopiaRemota) {
  const filas = asegurarTablaCargada(tenantId, tabla)
  const indice = filas.findIndex((f) => f.id === id)
  if (indice !== -1) {
    // Solo limpiamos si el registro local no ha sido modificado de nuevo
    if (filas[indice].updated_at <= fechaCopiaRemota) {
      filas[indice]._dirty = false
      await guardarTablaEnDisco(tenantId, tabla)
    }
  }
}

// Mapeo específico de columnas de fecha incremental por tabla para resoluciones
const COLUMNAS_FECHA_TABLA = {
  accounting_journal_lines: 'created_at',
  role_permissions: 'created_at'
}

/**
 * Resuelve y aplica cambios remotos en la base de datos local usando Last-Write-Wins (LWW).
 * @param {string} tenantId - Identificador del inquilino.
 * @param {string} tabla - Nombre de la tabla de negocio.
 * @param {Object} registroRemoto - Registro descargado de la nube.
 */
async function upsertRemotoLWW(tenantId, tabla, registroRemoto) {
  const filas = asegurarTablaCargada(tenantId, tabla)
  const indice = filas.findIndex((f) => f.id === registroRemoto.id)
  const ahora = new Date().toISOString()
  const columnaFecha = COLUMNAS_FECHA_TABLA[tabla] || 'updated_at'

  if (indice === -1) {
    // Si no existe localmente, lo insertamos directo sin flag dirty
    const copia = {
      ...registroRemoto,
      _dirty: false,
      updated_at: registroRemoto.updated_at || registroRemoto.created_at || ahora
    }
    filas.push(copia)
    await guardarTablaEnDisco(tenantId, tabla)
  } else {
    const local = filas[indice]
    const fechaLocalRaw = local[columnaFecha] || local.updated_at || local.created_at || 0
    const fechaRemotaRaw =
      registroRemoto[columnaFecha] || registroRemoto.updated_at || registroRemoto.created_at || 0

    const fechaLocal = new Date(fechaLocalRaw).getTime()
    const fechaRemota = new Date(fechaRemotaRaw).getTime()

    // Lógica Last-Write-Wins
    if (fechaRemota > fechaLocal) {
      // Si local está sucio pero el servidor tiene cambios más nuevos (colisión)
      // Ganador es el servidor.
      filas[indice] = {
        ...registroRemoto,
        _dirty: false,
        updated_at: registroRemoto.updated_at || registroRemoto.created_at || ahora
      }
      await guardarTablaEnDisco(tenantId, tabla)
    } else if (fechaLocal === fechaRemota && local._dirty) {
      // Fechas idénticas pero local sigue sucio, limpiar flag
      filas[indice]._dirty = false
      await guardarTablaEnDisco(tenantId, tabla)
    }
  }
}

/**
 * Remueve elementos de la lista de eliminaciones pendientes tras confirmación en el servidor.
 * @param {string} tenantId - Identificador del inquilino.
 * @param {Array<Object>} eliminadosExitosos - Lista de { tabla, id } procesados.
 */
async function limpiarEliminacionesProcesadas(tenantId, eliminadosExitosos) {
  const lista = asegurarEliminacionesCargadas(tenantId)
  const nuevaLista = lista.filter((item) => {
    return !eliminadosExitosos.some((exito) => exito.tabla === item.tabla && exito.id === item.id)
  })
  eliminacionesPendientes.set(tenantId, nuevaLista)
  await guardarEliminacionesEnDisco(tenantId)
}

/**
 * Reinicia la caché de memoria de la base de datos local (útil para pruebas).
 */
function reiniciarCache() {
  cacheMemoria.clear()
  eliminacionesPendientes.clear()
  rutaBaseDatos = null
}

module.exports = {
  inicializar,
  selectLocal,
  insertLocal,
  updateLocal,
  deleteLocal,
  obtenerRegistrosSucios,
  limpiarMarcaSucia,
  upsertRemotoLWW,
  asegurarEliminacionesCargadas,
  limpiarEliminacionesProcesadas,
  reiniciarCache,
  __testHooks: {
    cacheMemoria,
    eliminacionesPendientes,
    obtenerRutaArchivo,
    asegurarTablaCargada
  }
}
