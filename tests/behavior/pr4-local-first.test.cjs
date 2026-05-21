/**
 * @file pr4-local-first.test.cjs
 * @description Suite de pruebas automatizadas de comportamiento para la arquitectura Local-First y Sincronización (Issues #14 y #15).
 * Validaciones en español bajo la regla CERO INGLÉS.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const localdb = require('../../localdb');
const sync = require('../../sync');

const raizProyecto = path.resolve(__dirname, '../..');
const rutaMain = path.join(raizProyecto, 'main.js');
const rutaTemporalBd = path.join(__dirname, '../temp_local_db');

// Inquilino de prueba
const idInquilinoPrueba = 'inquilino-prueba-123';

/**
 * Prepara el entorno antes de cada ejecución de prueba localdb.
 */
function prepararEntornoDb() {
  localdb.reiniciarCache();
  if (fs.existsSync(rutaTemporalBd)) {
    fs.rmSync(rutaTemporalBd, { recursive: true, force: true });
  }
  fs.mkdirSync(rutaTemporalBd, { recursive: true });
  localdb.inicializar(rutaTemporalBd);
}

/**
 * Limpia el entorno después de las pruebas.
 */
function limpiarEntornoDb() {
  localdb.reiniciarCache();
  if (fs.existsSync(rutaTemporalBd)) {
    fs.rmSync(rutaTemporalBd, { recursive: true, force: true });
  }
}

/**
 * Crea un mock de Electron adaptado para pruebas de comportamiento de main.js.
 */
function crearMockElectron() {
  const manejadoresIpc = new Map();
  const enviados = [];

  return {
    manejadoresIpc,
    enviados,
    electronMain: {
      app: {
        isPackaged: false,
        getAppPath: () => raizProyecto,
        getPath: (nombre) => {
          if (nombre === 'userData') return rutaTemporalBd;
          return raizProyecto;
        },
        whenReady: () => ({ then: (cb) => { if (cb) cb(); } }),
        on: () => {},
        quit: () => {}
      },
      BrowserWindow: class BrowserWindow {
        static getAllWindows() { return []; }
        constructor() {
          this.webContents = { send: (canal, payload) => enviados.push({ canal, payload }) };
        }
        loadFile() { return Promise.resolve(); }
        loadURL() { return Promise.resolve(); }
        isDestroyed() { return false; }
        destroy() {}
      },
      ipcMain: {
        handle: (canal, manejador) => manejadoresIpc.set(canal, manejador),
        on: () => {}
      },
      nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
      dialog: { showSaveDialog: async () => ({ canceled: true }) }
    }
  };
}

/**
 * Carga main.js con el mock de Electron inyectado.
 */
function cargarMainParaPrueba() {
  process.env.ZYRON_MAIN_TEST_HOOKS = '1';
  delete require.cache[rutaMain];

  const mockElectron = crearMockElectron();
  const cargaOriginal = Module._load;

  Module._load = function cargaMockeada(solicitud, padre, esPrincipal) {
    if (solicitud === 'electron/main') return mockElectron.electronMain;
    if (solicitud === 'electron-updater') return { autoUpdater: { checkForUpdatesAndNotify: () => {} } };
    if (solicitud === 'electron-log') return { transports: { file: { level: 'info' } } };
    return cargaOriginal.call(this, solicitud, padre, esPrincipal);
  };

  try {
    const main = require(rutaMain);
    return { ...mockElectron, main };
  } finally {
    Module._load = cargaOriginal;
  }
}

/**
 * Helper para construir un query mockeado compatible con la cadena de PostgREST.
 */
function construirQueryMockeado(resultados) {
  const query = {
    then: (resolver, rechazar) => Promise.resolve(resultados.shift()).then(resolver, rechazar),
    select: function() { return this; },
    eq: function() { return this; },
    neq: function() { return this; },
    gt: function() { return this; },
    gte: function() { return this; },
    lt: function() { return this; },
    lte: function() { return this; },
    in: function() { return this; },
    like: function() { return this; },
    ilike: function() { return this; },
    order: function() { return this; },
    range: function() { return this; },
    limit: function() { return this; },
    single: function() { return this; },
    maybeSingle: function() { return this; }
  };
  return query;
}

// ==========================================
// PRUEBAS DEL MOTOR LOCAL (localdb.js)
// ==========================================

test('localdb: inicializa correctamente y crea la ruta de archivos de BD', () => {
  prepararEntornoDb();
  const dirExiste = fs.existsSync(path.join(rutaTemporalBd, 'local_db'));
  assert.ok(dirExiste, 'La carpeta local_db debe ser creada tras inicializar.');
  limpiarEntornoDb();
});

test('localdb: inserción local genera ID, tenant_id, _dirty y campos de control', async () => {
  prepararEntornoDb();

  const clientePrueba = { nombre: 'María Estrella', email: 'maria@zyron.com' };
  const resultado = await localdb.insertLocal(idInquilinoPrueba, 'customers', clientePrueba);

  assert.equal(resultado.error, null, 'No debe haber error al insertar');
  assert.equal(resultado.data.length, 1, 'Debe retornar el registro insertado');

  const registroInsertado = resultado.data[0];
  assert.ok(registroInsertado.id, 'Debe tener un ID autogenerado');
  assert.equal(registroInsertado.tenant_id, idInquilinoPrueba, 'Debe asociarse al tenantId correcto');
  assert.equal(registroInsertado._dirty, true, 'El flag _dirty debe estar en true');
  assert.ok(registroInsertado.updated_at, 'Debe tener fecha updated_at');
  assert.ok(registroInsertado.created_at, 'Debe tener fecha created_at');

  // Validar persistencia física
  const rutaArchivo = path.join(rutaTemporalBd, 'local_db', idInquilinoPrueba, 'customers.json');
  assert.ok(fs.existsSync(rutaArchivo), 'El archivo físico JSON de la tabla debe existir en disco');

  const datosDisco = JSON.parse(fs.readFileSync(rutaArchivo, 'utf8'));
  assert.equal(datosDisco[0].id, registroInsertado.id, 'Los datos en disco deben coincidir con memoria');

  limpiarEntornoDb();
});

test('localdb: consultas de selección con filtros de igualdad, parciales, rangos y orden', async () => {
  prepararEntornoDb();

  const clientes = [
    { nombre: 'Edwin Estrella', edad: 35, categoria: 'Premium' },
    { nombre: 'Andrea Rosales', edad: 28, categoria: 'Regular' },
    { nombre: 'Carlos Estrella', edad: 42, categoria: 'Premium' }
  ];

  await localdb.insertLocal(idInquilinoPrueba, 'customers', clientes);

  // 1. Filtrar por categoría Premium
  const resPremium = await localdb.selectLocal(idInquilinoPrueba, 'customers', {
    filters: [{ column: 'categoria', op: 'eq', value: 'Premium' }]
  });
  assert.equal(resPremium.data.length, 2, 'Deben haber 2 clientes Premium');

  // 2. Filtrar con like e ilike
  const resEstrella = await localdb.selectLocal(idInquilinoPrueba, 'customers', {
    filters: [{ column: 'nombre', op: 'ilike', value: '%estrella' }]
  });
  assert.equal(resEstrella.data.length, 2, 'Deben encontrarse 2 personas con apellido Estrella con búsqueda insensible');

  // 3. Comparación numérica gt (mayor que)
  const resMayores = await localdb.selectLocal(idInquilinoPrueba, 'customers', {
    filters: [{ column: 'edad', op: 'gt', value: 30 }]
  });
  assert.equal(resMayores.data.length, 2, 'Deben haber 2 mayores de 30 años');

  // 4. Ordenamiento descendente por edad
  const resOrdenados = await localdb.selectLocal(idInquilinoPrueba, 'customers', {
    order: { column: 'edad', ascending: false }
  });
  assert.equal(resOrdenados.data[0].nombre, 'Carlos Estrella', 'El mayor debe ir primero en orden descendente');

  // 5. Paginación / Rango (rango [0, 1])
  const resRango = await localdb.selectLocal(idInquilinoPrueba, 'customers', {
    range: [0, 1],
    order: { column: 'edad', ascending: true }
  });
  assert.equal(resRango.data.length, 2, 'El rango debe limitar el resultado a 2 elementos');
  assert.equal(resRango.data[0].nombre, 'Andrea Rosales', 'El más joven debe estar al inicio');

  limpiarEntornoDb();
});

test('localdb: actualización modifica registros, mantiene ID e inyecta updated_at y _dirty', async () => {
  prepararEntornoDb();

  const insercion = await localdb.insertLocal(idInquilinoPrueba, 'customers', { nombre: 'Luis', categoria: 'Regular' });
  const clienteOriginal = insercion.data[0];

  const resultadoAct = await localdb.updateLocal(
    idInquilinoPrueba,
    'customers',
    { categoria: 'VIP' },
    [{ column: 'id', op: 'eq', value: clienteOriginal.id }]
  );

  assert.equal(resultadoAct.data.length, 1, 'Debe haber actualizado 1 registro');
  const clienteAct = resultadoAct.data[0];
  assert.equal(clienteAct.id, clienteOriginal.id, 'El ID debe ser el mismo');
  assert.equal(clienteAct.categoria, 'VIP', 'La categoría debe haber cambiado a VIP');
  assert.equal(clienteAct._dirty, true, 'El flag _dirty debe persistir en true');
  assert.ok(new Date(clienteAct.updated_at) >= new Date(clienteOriginal.updated_at), 'La fecha updated_at debe actualizarse');

  limpiarEntornoDb();
});

test('localdb: eliminación local remueve de tabla y encola en eliminaciones pendientes', async () => {
  prepararEntornoDb();

  const insercion = await localdb.insertLocal(idInquilinoPrueba, 'customers', [
    { nombre: 'Eliminar 1' },
    { nombre: 'Mantener' }
  ]);
  const regAEliminar = insercion.data[0];

  const eliminacion = await localdb.deleteLocal(idInquilinoPrueba, 'customers', [
    { column: 'id', op: 'eq', value: regAEliminar.id }
  ]);

  assert.equal(eliminacion.data.length, 1, 'Debe retornar el registro eliminado');
  assert.equal(eliminacion.data[0].nombre, 'Eliminar 1', 'Debe coincidir el nombre del eliminado');

  // Verificar que ya no está en la tabla
  const resSelect = await localdb.selectLocal(idInquilinoPrueba, 'customers');
  assert.equal(resSelect.data.length, 1, 'Debe quedar un solo registro en la tabla');
  assert.equal(resSelect.data[0].nombre, 'Mantener', 'Debe mantenerse el cliente correcto');

  // Verificar cola de eliminaciones
  const listaEliminaciones = localdb.asegurarEliminacionesCargadas(idInquilinoPrueba);
  assert.equal(listaEliminaciones.length, 1, 'Debe haber 1 elemento en la cola de eliminaciones pendientes');
  assert.equal(listaEliminaciones[0].id, regAEliminar.id, 'El ID encolado debe coincidir');
  assert.equal(listaEliminaciones[0].tabla, 'customers', 'La tabla encolada debe coincidir');

  // Validar persistencia de eliminaciones
  const rutaEliminaciones = path.join(rutaTemporalBd, 'local_db', idInquilinoPrueba, '_eliminaciones_pendientes.json');
  assert.ok(fs.existsSync(rutaEliminaciones), 'El archivo de eliminaciones físicas debe guardarse en disco');

  limpiarEntornoDb();
});

// ==========================================
// PRUEBAS DE INTERCEPTACIÓN IPC (main.js)
// ==========================================

test('main.js: interceptación transparente de llamadas IPC cuando se incluye tenant_id', async () => {
  prepararEntornoDb();
  const { manejadoresIpc } = cargarMainParaPrueba();

  // Inyectar datos locales
  await localdb.insertLocal(idInquilinoPrueba, 'customers', [
    { id: '111', nombre: 'Local 1', tenant_id: idInquilinoPrueba },
    { id: '222', nombre: 'Local 2', tenant_id: idInquilinoPrueba }
  ]);

  // Invocar insforge:db:select simulando la llamada del renderer con tenant_id
  const payloadSelect = {
    table: 'customers',
    filters: [{ column: 'tenant_id', op: 'eq', value: idInquilinoPrueba }]
  };

  const resultadoLocal = await manejadoresIpc.get('insforge:db:select')(null, payloadSelect);

  assert.equal(resultadoLocal.error, null, 'No debe fallar la consulta IPC interceptada');
  assert.equal(resultadoLocal.data.length, 2, 'Debe devolver los registros almacenados localmente');
  assert.equal(resultadoLocal.data[0].nombre, 'Local 1');

  // Caso sin tenant_id: Redirección directa al SDK de InsForge en la nube
  let queryServidorLlamado = false;
  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {},
    database: {
      from: (tabla) => {
        assert.equal(tabla, 'customers', 'Debe consultar la tabla del servidor');
        queryServidorLlamado = true;
        return construirQueryMockeado([{ data: [{ id: '999', nombre: 'Servidor Nube' }], error: null }]);
      }
    },
    realtime: { on: () => {} }
  };

  const payloadGlobal = {
    table: 'customers',
    filters: [] // Sin filtro de tenant_id
  };

  const resultadoGlobal = await manejadoresIpc.get('insforge:db:select')(null, payloadGlobal);
  assert.ok(queryServidorLlamado, 'Debe haber llamado al servidor remoto al no contar con tenant_id');
  assert.equal(resultadoGlobal.data[0].nombre, 'Servidor Nube');

  limpiarEntornoDb();
});

// ==========================================
// PRUEBAS DE MOTOR DE SINCRONIZACIÓN (sync.js)
// ==========================================

test('sync: flujo Push sube registros sucios al servidor y remueve flag _dirty', async () => {
  prepararEntornoDb();

  // Insertar un registro sucio localmente
  const insercion = await localdb.insertLocal(idInquilinoPrueba, 'customers', { nombre: 'Para Sincronizar' });
  const regSucio = insercion.data[0];
  assert.equal(regSucio._dirty, true);

  // Mockear cliente Insforge
  let upsertLlamadoCon = null;
  const clienteMock = {
    database: {
      from: (tabla) => ({
        upsert: async (datos) => {
          if (tabla === 'customers') {
            upsertLlamadoCon = datos;
            return { data: datos, error: null };
          }
          return { data: null, error: null };
        },
        select: () => construirQueryMockeado([{ data: [], error: null }])
      })
    },
    realtime: {
      status: async () => ({ ok: true })
    }
  };

  sync.establecerClienteInsforge(clienteMock, false);

  // Ejecutar el flujo de Push manualmente
  await sync.__testHooks.ejecutarFlujoPush(idInquilinoPrueba);

  // 1. Validar que se haya subido al servidor remoto
  assert.ok(upsertLlamadoCon, 'Se debe haber invocado el upsert remoto');
  assert.equal(upsertLlamadoCon.length, 1);
  assert.equal(upsertLlamadoCon[0].nombre, 'Para Sincronizar');
  assert.equal(upsertLlamadoCon[0]._dirty, undefined, 'El flag invisible _dirty debe haber sido limpiado antes de enviar al servidor');

  // 2. Validar que la marca dirty se haya removido localmente tras subida exitosa
  const resLocal = await localdb.selectLocal(idInquilinoPrueba, 'customers');
  assert.equal(resLocal.data[0]._dirty, false, 'El flag _dirty local debe ser false ahora');

  limpiarEntornoDb();
});

test('sync: flujo Pull baja cambios más nuevos del servidor y aplica Last-Write-Wins', async () => {
  prepararEntornoDb();

  // Insertar registro local inicial
  const fechaAntigua = new Date(Date.now() - 100000).toISOString(); // 100 segundos en el pasado
  const registroLocal = {
    id: 'id-compartido-1',
    nombre: 'Original Local',
    updated_at: fechaAntigua,
    created_at: fechaAntigua,
    tenant_id: idInquilinoPrueba
  };
  await localdb.insertLocal(idInquilinoPrueba, 'customers', registroLocal);

  // Cambiar _dirty a false manualmente para simular estado ya sincronizado inicial
  const filas = localdb.__testHooks.asegurarTablaCargada(idInquilinoPrueba, 'customers');
  filas[0]._dirty = false;
  filas[0].updated_at = fechaAntigua;

  // Registrar fecha más nueva para el servidor
  const fechaNuevaServidor = new Date().toISOString();
  const registroServidor = {
    id: 'id-compartido-1',
    nombre: 'Actualizado en Servidor Nube',
    updated_at: fechaNuevaServidor,
    created_at: fechaAntigua,
    tenant_id: idInquilinoPrueba
  };

  // Mockear cliente Insforge con el cambio en la nube
  const clienteMock = {
    database: {
      from: (tabla) => ({
        select: () => {
          if (tabla === 'customers') {
            return construirQueryMockeado([{ data: [registroServidor], error: null }]);
          }
          return construirQueryMockeado([{ data: [], error: null }]);
        }
      })
    },
    realtime: {
      status: async () => ({ ok: true })
    }
  };

  sync.establecerClienteInsforge(clienteMock, false);

  // Ejecutar el flujo de Pull
  const marcaCiclo = new Date().toISOString();
  await sync.__testHooks.ejecutarFlujoPull(idInquilinoPrueba, marcaCiclo);

  // Validar que el cambio se haya aplicado localmente debido a LWW (Servidor más nuevo)
  const resLocal = await localdb.selectLocal(idInquilinoPrueba, 'customers');
  assert.equal(resLocal.data[0].nombre, 'Actualizado en Servidor Nube', 'El registro local debe ser sobreescrito con los cambios remotos');
  assert.equal(resLocal.data[0]._dirty, false, 'El registro local no debe marcarse como sucio tras recibir cambios remotos');

  limpiarEntornoDb();
});

test('sync: Last-Write-Wins mantiene cambio local si es más nuevo que el servidor', async () => {
  prepararEntornoDb();

  const fechaNuevaLocal = new Date().toISOString();
  const registroLocal = {
    id: 'id-compartido-2',
    nombre: 'Local Más Nuevo',
    updated_at: fechaNuevaLocal,
    created_at: fechaNuevaLocal,
    tenant_id: idInquilinoPrueba
  };
  await localdb.insertLocal(idInquilinoPrueba, 'customers', registroLocal);

  const fechaViejaServidor = new Date(Date.now() - 50000).toISOString();
  const registroServidor = {
    id: 'id-compartido-2',
    nombre: 'Servidor Viejo',
    updated_at: fechaViejaServidor,
    created_at: fechaViejaServidor,
    tenant_id: idInquilinoPrueba
  };

  // Ejecutar lógica directa de resolución LWW
  await localdb.upsertRemotoLWW(idInquilinoPrueba, 'customers', registroServidor);

  // Validar que no se sobreescribió local porque local es más nuevo
  const resLocal = await localdb.selectLocal(idInquilinoPrueba, 'customers');
  assert.equal(resLocal.data[0].nombre, 'Local Más Nuevo', 'Debe mantenerse el cambio local más reciente');

  limpiarEntornoDb();
});
