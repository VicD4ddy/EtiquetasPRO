const fs = require('fs');
const path = require('path');

function getHistoryPath(storageDir) {
  return path.join(storageDir, 'print-history.json');
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readRawHistory(storageDir) {
  if (!storageDir) return [];
  const filePath = getHistoryPath(storageDir);
  if (!fs.existsSync(filePath)) return [];

  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pruneExpiredBatches(batches, now = new Date()) {
  if (!Array.isArray(batches)) return [];
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 6);
  const cutoffMs = cutoff.getTime();

  return batches
    .filter((batch) => {
      if (!batch || !batch.printedAt) return false;
      const printedMs = new Date(batch.printedAt).getTime();
      return !Number.isNaN(printedMs) && printedMs >= cutoffMs;
    })
    .sort((a, b) => new Date(b.printedAt).getTime() - new Date(a.printedAt).getTime());
}

function getHistory(storageDir, now = new Date()) {
  const raw = readRawHistory(storageDir);
  const pruned = pruneExpiredBatches(raw, now);

  if (storageDir && pruned.length !== raw.length) {
    try {
      writeJsonAtomic(getHistoryPath(storageDir), pruned);
    } catch (err) {
      console.error('Error persistiendo poda del historial:', err);
    }
  }

  return pruned;
}

function normalizeBatchItem(item, fallbackProviderCode, fallbackDateCode) {
  return {
    code: String(item.code || '').trim(),
    description: String(item.description || '').trim(),
    costoListaUnit: String(item.costoListaUnit || ''),
    costUSD: Number(item.costUSD) || 0,
    cipherCode: String(item.cipherCode || ''),
    providerCode: String(item.providerCode || fallbackProviderCode || '00000'),
    dateCode: String(item.dateCode || fallbackDateCode || '00/00'),
    quantity: Math.max(0, parseInt(item.quantity, 10) || 0)
  };
}

function addHistoryBatch(storageDir, batchInput, now = new Date()) {
  const existing = getHistory(storageDir, now);
  const providerCode = String(batchInput.providerCode || '00000');
  const dateCode = String(batchInput.dateCode || '00/00');
  const items = Array.isArray(batchInput.items)
    ? batchInput.items.map((item) => normalizeBatchItem(item, providerCode, dateCode))
    : [];

  const computedLabels = items.reduce((acc, item) => acc + item.quantity, 0);
  const batch = {
    id: batchInput.id || `batch-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    printedAt: batchInput.printedAt || now.toISOString(),
    invoiceNum: String(batchInput.invoiceNum || 'S/N'),
    dateCode,
    providerRif: String(batchInput.providerRif || 'DESCONOCIDO'),
    providerCode,
    providerName: String(batchInput.providerName || ''),
    fileName: String(batchInput.fileName || ''),
    tasaBCV: Number(batchInput.tasaBCV) || 0,
    printerName: String(batchInput.printerName || 'Default'),
    totalLabels: Number.isFinite(Number(batchInput.totalLabels)) ? Number(batchInput.totalLabels) : computedLabels,
    totalItems: items.length,
    isReprint: Boolean(batchInput.isReprint),
    reprintFromBatchId: batchInput.reprintFromBatchId || null,
    items
  };

  const nextHistory = pruneExpiredBatches([batch, ...existing], now);
  if (storageDir) {
    writeJsonAtomic(getHistoryPath(storageDir), nextHistory);
  }

  return { batch, history: nextHistory };
}

function deleteHistoryBatch(storageDir, batchId) {
  const existing = getHistory(storageDir);
  const nextHistory = existing.filter((b) => b.id !== batchId);
  if (storageDir) {
    writeJsonAtomic(getHistoryPath(storageDir), nextHistory);
  }
  return nextHistory;
}

function clearHistory(storageDir) {
  if (storageDir) {
    writeJsonAtomic(getHistoryPath(storageDir), []);
  }
  return [];
}

function findPreviousPrints(batches, { invoiceNum, providerRif, fileName } = {}) {
  if (!Array.isArray(batches) || batches.length === 0) return [];
  const normInv = String(invoiceNum || '').trim();
  const normRif = String(providerRif || '').trim().toUpperCase();
  const normFile = String(fileName || '').trim();

  if (normInv && normInv !== 'S/N') {
    return batches.filter((b) => {
      if (String(b.invoiceNum || '').trim() !== normInv) return false;
      const bRif = String(b.providerRif || '').trim().toUpperCase();
      if (
        normRif &&
        normRif !== 'DESCONOCIDO' &&
        bRif &&
        bRif !== 'DESCONOCIDO'
      ) {
        return bRif === normRif;
      }
      return true;
    });
  }

  if (normFile) {
    return batches.filter((b) => String(b.fileName || '').trim() === normFile);
  }

  return [];
}

function escapeCsvField(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCsvDate(isoStr) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return String(isoStr || '');
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildHistoryCsv(batches) {
  const headers = [
    'Fecha Impresion',
    'Tipo',
    'Factura',
    'Fecha Factura',
    'RIF Proveedor',
    'Codigo Proveedor',
    'Nombre Proveedor',
    'Tasa BCV (Bs)',
    'Impresora',
    'Codigo Articulo',
    'Descripcion',
    'Costo Lista (Bs)',
    'Costo (USD)',
    'Cifrado',
    'Etiquetas Impresas'
  ];

  const rows = [headers.map(escapeCsvField).join(',')];

  for (const batch of batches || []) {
    const tipo = batch.isReprint ? 'Reimpresion' : 'Impresion';
    const items = Array.isArray(batch.items) && batch.items.length > 0 ? batch.items : [{}];
    for (const item of items) {
      const row = [
        formatCsvDate(batch.printedAt),
        tipo,
        batch.invoiceNum || 'S/N',
        batch.dateCode || '00/00',
        batch.providerRif || 'DESCONOCIDO',
        item.providerCode || batch.providerCode || '00000',
        batch.providerName || '',
        typeof batch.tasaBCV === 'number' ? batch.tasaBCV.toFixed(2) : String(batch.tasaBCV || ''),
        batch.printerName || 'Default',
        item.code || '',
        item.description || '',
        item.costoListaUnit || '',
        typeof item.costUSD === 'number' ? item.costUSD.toFixed(2) : String(item.costUSD || ''),
        item.cipherCode || '',
        item.quantity ?? ''
      ];
      rows.push(row.map(escapeCsvField).join(','));
    }
  }

  return '\uFEFF' + rows.join('\r\n');
}

module.exports = {
  getHistory,
  addHistoryBatch,
  deleteHistoryBatch,
  clearHistory,
  pruneExpiredBatches,
  findPreviousPrints,
  buildHistoryCsv
};
