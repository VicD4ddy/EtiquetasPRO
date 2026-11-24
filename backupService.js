const fs = require('fs');
const path = require('path');
const { getProvidersData, writeProvidersData, normalizeRif } = require('./providerStore');
const { getHistory, pruneExpiredBatches } = require('./historyStore');

function writeHistoryFileAtomic(storageDir, history) {
  if (!storageDir) return;
  const filePath = path.join(storageDir, 'print-history.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(history, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function exportBackupPayload(storageDir, now = new Date()) {
  const { providers, rifMap } = getProvidersData(storageDir);
  const history = getHistory(storageDir, now);
  return {
    app: 'EtiquetasPRO',
    version: 1,
    exportedAt: now.toISOString(),
    providers,
    rifMap,
    history
  };
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('El archivo no contiene un objeto de respaldo válido.');
  }
  if (payload.app && payload.app !== 'EtiquetasPRO') {
    throw new Error('El archivo pertenece a otra aplicación.');
  }
  const hasAnySection =
    Array.isArray(payload.providers) ||
    Array.isArray(payload.history) ||
    (payload.rifMap && typeof payload.rifMap === 'object');
  if (!hasAnySection) {
    throw new Error('El archivo de respaldo no contiene proveedores ni historial.');
  }
}

function sanitizeIncomingProviders(rawProviders) {
  if (!Array.isArray(rawProviders)) return [];
  return rawProviders
    .map((p, idx) => ({
      id: p && p.id ? String(p.id) : `prov-imp-${Date.now()}-${idx}`,
      name: String((p && p.name) || '').trim(),
      code: String((p && p.code) || '').trim(),
      rif: normalizeRif(p && p.rif)
    }))
    .filter((p) => p.name && p.code);
}

function sanitizeIncomingRifMap(rawMap) {
  const out = {};
  if (!rawMap || typeof rawMap !== 'object') return out;
  for (const [k, v] of Object.entries(rawMap)) {
    const norm = normalizeRif(k);
    const code = String(v || '').trim();
    if (norm && norm !== 'DESCONOCIDO' && code) {
      out[norm] = code;
    }
  }
  return out;
}

function importBackupPayload(storageDir, payload, mode = 'merge', now = new Date()) {
  validateBackupPayload(payload);
  const importMode = mode === 'replace' ? 'replace' : 'merge';

  const incomingProviders = sanitizeIncomingProviders(payload.providers);
  const incomingRifMap = sanitizeIncomingRifMap(payload.rifMap);
  const incomingHistory = pruneExpiredBatches(Array.isArray(payload.history) ? payload.history : [], now);

  let nextProviders;
  let nextRifMap;
  let nextHistory;

  if (importMode === 'replace') {
    nextProviders = incomingProviders;
    nextRifMap = incomingRifMap;
    nextHistory = incomingHistory;
  } else {
    const currentProv = getProvidersData(storageDir);
    const currentHistory = getHistory(storageDir, now);

    // Fusionar proveedores sin duplicar por id o por code+name
    nextProviders = [...currentProv.providers];
    const seenIds = new Set(nextProviders.map((p) => p.id));
    const seenCodes = new Set(nextProviders.map((p) => p.code.toLowerCase()));
    for (const prov of incomingProviders) {
      if (seenIds.has(prov.id) || seenCodes.has(prov.code.toLowerCase())) {
        continue;
      }
      seenIds.add(prov.id);
      seenCodes.add(prov.code.toLowerCase());
      nextProviders.push(prov);
    }

    // Fusionar asociaciones RIF -> Código
    nextRifMap = { ...incomingRifMap, ...currentProv.rifMap };

    // Fusionar lotes del historial sin duplicar por id o firma temporal
    const mergedHistory = [...currentHistory];
    const seenBatchIds = new Set(mergedHistory.map((b) => b.id));
    const seenSigs = new Set(
      mergedHistory.map((b) => `${b.printedAt}|${b.invoiceNum}|${b.totalLabels}`)
    );
    for (const batch of incomingHistory) {
      const sig = `${batch.printedAt}|${batch.invoiceNum}|${batch.totalLabels}`;
      if (seenBatchIds.has(batch.id) || seenSigs.has(sig)) {
        continue;
      }
      seenBatchIds.add(batch.id);
      seenSigs.add(sig);
      mergedHistory.push(batch);
    }
    nextHistory = pruneExpiredBatches(mergedHistory, now);
  }

  writeProvidersData(storageDir, { providers: nextProviders, rifMap: nextRifMap });
  writeHistoryFileAtomic(storageDir, nextHistory);

  return {
    providers: nextProviders,
    rifMap: nextRifMap,
    history: nextHistory,
    summary: {
      mode: importMode,
      providersCount: nextProviders.length,
      rifCount: Object.keys(nextRifMap).length,
      historyCount: nextHistory.length
    }
  };
}

module.exports = {
  exportBackupPayload,
  importBackupPayload,
  validateBackupPayload
};
