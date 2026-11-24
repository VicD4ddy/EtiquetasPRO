const fs = require('fs');
const path = require('path');

function getProvidersPath(storageDir) {
  return path.join(storageDir, 'providers.json');
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function normalizeRif(rif) {
  return String(rif || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function normalizeProvider(raw, fallbackIndex = 0) {
  return {
    id: raw && raw.id ? String(raw.id) : `prov-${Date.now()}-${fallbackIndex}-${Math.random().toString(36).slice(2, 6)}`,
    name: String((raw && raw.name) || '').trim(),
    code: String((raw && raw.code) || '').trim(),
    rif: normalizeRif(raw && raw.rif)
  };
}

function getProvidersData(storageDir) {
  if (!storageDir) {
    return { providers: [], rifMap: {} };
  }
  const filePath = getProvidersPath(storageDir);
  if (!fs.existsSync(filePath)) {
    return { providers: [], rifMap: {} };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return { providers: [], rifMap: {} };
    const parsed = JSON.parse(raw);
    const providers = Array.isArray(parsed.providers)
      ? parsed.providers.map((p, idx) => normalizeProvider(p, idx)).filter((p) => p.name && p.code)
      : [];
    const rifMap = {};
    if (parsed.rifMap && typeof parsed.rifMap === 'object') {
      for (const [k, v] of Object.entries(parsed.rifMap)) {
        const normKey = normalizeRif(k);
        const val = String(v || '').trim();
        if (normKey && normKey !== 'DESCONOCIDO' && val) {
          rifMap[normKey] = val;
        }
      }
    }
    return { providers, rifMap };
  } catch {
    return { providers: [], rifMap: {} };
  }
}

function writeProvidersData(storageDir, data) {
  if (storageDir) {
    writeJsonAtomic(getProvidersPath(storageDir), data);
  }
  return data;
}

function saveProvider(storageDir, input) {
  const name = String((input && input.name) || '').trim();
  const code = String((input && input.code) || '').trim();
  const rif = normalizeRif(input && input.rif);
  if (!name || !code) {
    throw new Error('Nombre y código del proveedor son obligatorios.');
  }

  const current = getProvidersData(storageDir);
  const providers = [...current.providers];
  const rifMap = { ...current.rifMap };

  let saved;
  if (input && input.id) {
    const idx = providers.findIndex((p) => p.id === input.id);
    if (idx !== -1) {
      const prev = providers[idx];
      // Si cambió el código o el RIF, actualizar asociaciones en rifMap
      if (prev.rif && prev.rif !== rif && rifMap[prev.rif] === prev.code) {
        delete rifMap[prev.rif];
      }
      if (prev.code !== code) {
        for (const [k, v] of Object.entries(rifMap)) {
          if (v === prev.code) {
            rifMap[k] = code;
          }
        }
      }
      saved = { ...prev, name, code, rif };
      providers[idx] = saved;
    }
  }

  if (!saved) {
    saved = {
      id: (input && input.id) || `prov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      code,
      rif
    };
    providers.push(saved);
  }

  if (rif && rif !== 'DESCONOCIDO') {
    rifMap[rif] = code;
  }

  const next = writeProvidersData(storageDir, { providers, rifMap });
  return { provider: saved, ...next };
}

function deleteProvider(storageDir, id) {
  const current = getProvidersData(storageDir);
  const target = current.providers.find((p) => p.id === id);
  const providers = current.providers.filter((p) => p.id !== id);
  const rifMap = { ...current.rifMap };

  if (target && target.rif && rifMap[target.rif] === target.code) {
    delete rifMap[target.rif];
  }

  return writeProvidersData(storageDir, { providers, rifMap });
}

function setRifAssociation(storageDir, rif, code) {
  const normRif = normalizeRif(rif);
  if (!normRif || normRif === 'DESCONOCIDO') {
    return getProvidersData(storageDir);
  }
  const current = getProvidersData(storageDir);
  const rifMap = { ...current.rifMap };
  const cleanCode = String(code || '').trim();
  if (cleanCode) {
    rifMap[normRif] = cleanCode;
  } else {
    delete rifMap[normRif];
  }
  return writeProvidersData(storageDir, { providers: current.providers, rifMap });
}

function migrateFromLocalStorage(storageDir, { legacyProviders = [], legacyRifMap = {} } = {}) {
  const current = getProvidersData(storageDir);
  const providers = [...current.providers];
  const rifMap = { ...current.rifMap };

  const existingKeys = new Set(
    providers.map((p) => `${p.code.toLowerCase()}::${p.name.toLowerCase()}`)
  );

  if (Array.isArray(legacyProviders)) {
    legacyProviders.forEach((raw, idx) => {
      const norm = normalizeProvider(raw, idx);
      if (!norm.name || !norm.code) return;
      const key = `${norm.code.toLowerCase()}::${norm.name.toLowerCase()}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        providers.push(norm);
      }
    });
  }

  if (legacyRifMap && typeof legacyRifMap === 'object') {
    for (const [k, v] of Object.entries(legacyRifMap)) {
      const normRif = normalizeRif(k);
      const code = String(v || '').trim();
      if (normRif && normRif !== 'DESCONOCIDO' && code && !rifMap[normRif]) {
        rifMap[normRif] = code;
      }
    }
  }

  return writeProvidersData(storageDir, { providers, rifMap });
}

module.exports = {
  getProvidersData,
  writeProvidersData,
  saveProvider,
  deleteProvider,
  setRifAssociation,
  migrateFromLocalStorage,
  normalizeRif
};
