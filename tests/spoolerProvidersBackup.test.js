const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DEFAULT_CHUNK_SIZE, chunkLabels, runChunkedPrintJob } = require('../printSpooler');
const {
  getProvidersData,
  saveProvider,
  deleteProvider,
  setRifAssociation,
  migrateFromLocalStorage
} = require('../providerStore');
const { addHistoryBatch, getHistory } = require('../historyStore');
const { exportBackupPayload, importBackupPayload } = require('../backupService');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'etiquetas-suite-'));
}

test('printSpooler: divide lotes >64 etiquetas (125) en bloques de 40 y reporta progreso', async () => {
  const labels = Array.from({ length: 125 }, (_, i) => ({ code: `CODE-${i + 1}` }));
  const chunks = chunkLabels(labels, DEFAULT_CHUNK_SIZE);
  assert.deepEqual(chunks.map((c) => c.length), [40, 40, 40, 5]);

  const progressEvents = [];
  const printedChunks = [];

  const result = await runChunkedPrintJob({
    labels,
    printerName: 'Xprinter',
    interChunkDelayMs: 0,
    onProgress: (p) => progressEvents.push(p),
    printSingleChunk: async (chunk) => {
      printedChunks.push(chunk.length);
      return { success: true };
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.sentCount, 125);
  assert.equal(result.totalCount, 125);
  assert.equal(result.totalChunks, 4);
  assert.deepEqual(printedChunks, [40, 40, 40, 5]);
  assert.equal(progressEvents[progressEvents.length - 1].sentLabels, 125);
});

test('printSpooler: detiene el lote al fallar un sub-lote e indica desde qué etiqueta reintentar', async () => {
  const labels = Array.from({ length: 95 }, (_, i) => ({ code: `ITEM-${i + 1}` }));
  let calls = 0;

  const result = await runChunkedPrintJob({
    labels,
    printerName: 'Xprinter',
    interChunkDelayMs: 0,
    printSingleChunk: async () => {
      calls++;
      if (calls === 2) {
        return { success: false, error: 'Sin papel en impresora' };
      }
      return { success: true };
    }
  });

  assert.equal(result.success, false);
  assert.equal(calls, 2); // No intentó el 3er bloque
  assert.equal(result.sentCount, 40);
  assert.equal(result.failedAtLabel, 41);
  assert.equal(result.remainingLabels.length, 55);
  assert.equal(result.remainingLabels[0].code, 'ITEM-41');
});

test('providerStore: alta, edición, borrado, RIF y migración desde localStorage', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const migrated = migrateFromLocalStorage(tmpDir, {
    legacyProviders: [
      { name: 'Repuestos Uno', code: '00010' },
      { name: 'Repuestos Uno', code: '00010' } // duplicado
    ],
    legacyRifMap: {
      'J-30326120-5': '00010',
      DESCONOCIDO: '99999'
    }
  });

  assert.equal(migrated.providers.length, 1);
  assert.equal(migrated.rifMap.J303261205, '00010');
  assert.equal(migrated.rifMap.DESCONOCIDO, undefined);

  const created = saveProvider(tmpDir, { name: 'Proveedor Dos', code: '00020', rif: 'J-40000001-2' });
  assert.equal(created.providers.length, 2);
  assert.equal(created.rifMap.J400000012, '00020');

  // Editar código debe actualizar rifMap asociado
  const updated = saveProvider(tmpDir, {
    id: created.provider.id,
    name: 'Proveedor Dos Editado',
    code: '00025',
    rif: 'J-40000001-2'
  });
  assert.equal(updated.rifMap.J400000012, '00025');

  setRifAssociation(tmpDir, 'J-50000000-1', '00077');
  assert.equal(getProvidersData(tmpDir).rifMap.J500000001, '00077');

  const afterDel = deleteProvider(tmpDir, created.provider.id);
  assert.equal(afterDel.providers.length, 1);
  assert.equal(afterDel.rifMap.J400000012, undefined);
});

test('backupService: exportación, fusión sin duplicar y reemplazo completo', (t) => {
  const srcDir = makeTempDir();
  const dstDir = makeTempDir();
  t.after(() => {
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.rmSync(dstDir, { recursive: true, force: true });
  });

  const now = new Date('2026-11-23T20:00:00Z');
  saveProvider(srcDir, { name: 'Prov Origen', code: '00100', rif: 'J111111111' });
  addHistoryBatch(srcDir, {
    id: 'b-src-1',
    printedAt: now.toISOString(),
    invoiceNum: '1001',
    items: [{ code: 'A1', description: 'Filtro', quantity: 2 }]
  }, now);

  const backup = exportBackupPayload(srcDir, now);
  assert.equal(backup.app, 'EtiquetasPRO');
  assert.equal(backup.providers.length, 1);
  assert.equal(backup.history.length, 1);

  // Sembrar destino con datos propios
  saveProvider(dstDir, { name: 'Prov Destino', code: '00200', rif: 'J222222222' });
  addHistoryBatch(dstDir, {
    id: 'b-dst-1',
    printedAt: '2026-11-22T15:00:00Z',
    invoiceNum: '2002',
    items: [{ code: 'B1', description: 'Bujia', quantity: 4 }]
  }, now);

  // Merge: debe conservar destino + sumar origen (sin duplicar si se repite)
  const merged = importBackupPayload(dstDir, backup, 'merge', now);
  assert.equal(merged.providers.length, 2);
  assert.equal(merged.history.length, 2);
  assert.equal(merged.rifMap.J111111111, '00100');
  assert.equal(merged.rifMap.J222222222, '00200');

  const mergedAgain = importBackupPayload(dstDir, backup, 'merge', now);
  assert.equal(mergedAgain.providers.length, 2);
  assert.equal(mergedAgain.history.length, 2);

  // Replace: debe quedar exactamente lo del backup
  const replaced = importBackupPayload(dstDir, backup, 'replace', now);
  assert.equal(replaced.providers.length, 1);
  assert.equal(replaced.providers[0].code, '00100');
  assert.equal(replaced.history.length, 1);
  assert.equal(getHistory(dstDir, now).length, 1);
});

test('seguridad UI: sin alert/confirm nativos en src/ ni innerHTML en impresión', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) files = files.concat(walk(full));
      else if (/\.(js|jsx)$/.test(e.name)) files.push(full);
    }
    return files;
  };

  for (const file of walk(srcDir)) {
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(/\balert\s*\(/.test(content), false, `alert() encontrado en ${file}`);
    assert.equal(/\bconfirm\s*\(/.test(content), false, `confirm() encontrado en ${file}`);
  }

  const printHtml = fs.readFileSync(path.join(__dirname, '..', 'print.html'), 'utf8');
  const printPreload = fs.readFileSync(path.join(__dirname, '..', 'printPreload.js'), 'utf8');
  assert.equal(printHtml.includes('<script'), false);
  assert.equal(printPreload.includes('innerHTML'), false);
});
