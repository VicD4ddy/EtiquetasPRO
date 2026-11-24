const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { fetchBcvUsdRate, getCachedBcvRate } = require('../bcvService');
const {
  getHistory,
  addHistoryBatch,
  deleteHistoryBatch,
  clearHistory,
  findPreviousPrints,
  buildHistoryCsv
} = require('../historyStore');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'etiquetas-test-'));
}

test('bcvService: consulta exitosa en fuente primaria y guarda caché en disco', async (t) => {
  const tmpDir = makeTempDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const mockFetch = async (url) => {
    assert.ok(url.includes('dolarapi.com'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        moneda: 'USD',
        fuente: 'oficial',
        promedio: 918.7662,
        fechaActualizacion: '2026-11-20T00:00:00-04:00'
      })
    };
  };

  const res = await fetchBcvUsdRate({ storageDir: tmpDir, fetchImpl: mockFetch });
  assert.equal(res.success, true);
  assert.equal(res.cached, false);
  assert.equal(res.data.rate, 918.77);
  assert.equal(res.data.source, 'BCV Oficial');

  const cached = getCachedBcvRate(tmpDir);
  assert.ok(cached);
  assert.equal(cached.rate, 918.77);
});

test('bcvService: usa fuente secundaria cuando la primaria falla', async (t) => {
  const tmpDir = makeTempDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const mockFetch = async (url) => {
    if (url.includes('dolarapi.com')) {
      throw new Error('Network timeout');
    }
    if (url.includes('open.er-api.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: 'success',
          rates: { VES: 919.8227 },
          time_last_update_utc: 'Mon, 23 Nov 2026 00:02:32 +0000'
        })
      };
    }
    throw new Error('Unexpected URL');
  };

  const res = await fetchBcvUsdRate({ storageDir: tmpDir, fetchImpl: mockFetch });
  assert.equal(res.success, true);
  assert.equal(res.cached, false);
  assert.equal(res.data.rate, 919.82);
  assert.equal(res.data.source, 'BCV Respaldo');
});

test('bcvService: ante fallo total de red retorna la última tasa guardada en caché offline', async (t) => {
  const tmpDir = makeTempDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // Sembrar caché previa
  await fetchBcvUsdRate({
    storageDir: tmpDir,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ promedio: 915.4, fechaActualizacion: '2026-11-19T00:00:00-04:00' })
    })
  });

  // Simular caída total de internet
  const offlineRes = await fetchBcvUsdRate({
    storageDir: tmpDir,
    fetchImpl: async () => {
      throw new Error('ENOTFOUND');
    }
  });

  assert.equal(offlineRes.success, true);
  assert.equal(offlineRes.cached, true);
  assert.equal(offlineRes.data.rate, 915.4);
  assert.ok(offlineRes.offlineWarning);
});

test('bcvService: fallo total sin caché previa retorna error controlado', async (t) => {
  const tmpDir = makeTempDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const res = await fetchBcvUsdRate({
    storageDir: tmpDir,
    fetchImpl: async () => {
      throw new Error('Offline');
    }
  });

  assert.equal(res.success, false);
  assert.ok(res.error);
});

test('historyStore: inserción, orden descendente y poda automática de lotes > 6 meses', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const now = new Date('2026-11-23T20:00:00Z');
  const sevenMonthsAgo = new Date('2026-04-01T12:00:00Z');
  const twoDaysAgo = new Date('2026-11-21T12:00:00Z');

  addHistoryBatch(
    tmpDir,
    {
      id: 'old-batch',
      printedAt: sevenMonthsAgo.toISOString(),
      invoiceNum: '000100',
      items: [{ code: 'OLD-1', description: 'Antiguo', quantity: 2 }]
    },
    now
  );

  addHistoryBatch(
    tmpDir,
    {
      id: 'recent-batch',
      printedAt: twoDaysAgo.toISOString(),
      invoiceNum: '000200',
      items: [{ code: 'NEW-1', description: 'Reciente', quantity: 4 }]
    },
    now
  );

  addHistoryBatch(
    tmpDir,
    {
      id: 'today-batch',
      printedAt: now.toISOString(),
      invoiceNum: '000300',
      items: [{ code: 'NOW-1', description: 'Hoy', quantity: 1 }]
    },
    now
  );

  const list = getHistory(tmpDir, now);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'today-batch');
  assert.equal(list[1].id, 'recent-batch');

  const afterDelete = deleteHistoryBatch(tmpDir, 'recent-batch');
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, 'today-batch');

  const cleared = clearHistory(tmpDir);
  assert.equal(cleared.length, 0);
  assert.equal(getHistory(tmpDir, now).length, 0);
});

test('historyStore: detección de impresiones previas evita falsos positivos en S/N', () => {
  const batches = [
    { id: 'b1', invoiceNum: '77268', providerRif: 'J303261205', fileName: 'fac1.pdf' },
    { id: 'b2', invoiceNum: 'S/N', providerRif: 'DESCONOCIDO', fileName: 'nota_a.pdf' }
  ];

  // Coincidencia exacta de factura + RIF
  assert.equal(
    findPreviousPrints(batches, { invoiceNum: '77268', providerRif: 'J303261205', fileName: 'otro.pdf' }).length,
    1
  );

  // Mismo número pero distinto proveedor -> no debe marcarse como repetida
  assert.equal(
    findPreviousPrints(batches, { invoiceNum: '77268', providerRif: 'J999999999', fileName: 'otro.pdf' }).length,
    0
  );

  // S/N solo coincide si el nombre de archivo coincide
  assert.equal(
    findPreviousPrints(batches, { invoiceNum: 'S/N', providerRif: 'DESCONOCIDO', fileName: 'nota_b.pdf' }).length,
    0
  );
  assert.equal(
    findPreviousPrints(batches, { invoiceNum: 'S/N', providerRif: 'DESCONOCIDO', fileName: 'nota_a.pdf' }).length,
    1
  );
});

test('historyStore: buildHistoryCsv incluye BOM UTF-8 y escapa comas y comillas RFC-4180', () => {
  const csv = buildHistoryCsv([
    {
      printedAt: '2026-11-23T20:00:00Z',
      isReprint: false,
      invoiceNum: '00112744',
      dateCode: '11/26',
      providerRif: 'J303261205',
      providerCode: '00071',
      providerName: 'Repuestos, "El Sol" C.A.',
      tasaBCV: 918.77,
      printerName: 'Xprinter',
      items: [
        {
          code: 'BKR 6E',
          description: 'BUJIA "NGK", ESTANDAR',
          costoListaUnit: '1.250,00',
          costUSD: 1.36,
          cipherCode: 'L,HxDA',
          providerCode: '00071',
          dateCode: '11/26',
          quantity: 4
        }
      ]
    }
  ]);

  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Repuestos, ""El Sol"" C.A."'));
  assert.ok(csv.includes('"BUJIA ""NGK"", ESTANDAR"'));
  assert.ok(csv.includes('918.77'));
});
