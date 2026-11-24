const fs = require('fs');
const path = require('path');

const DOLAR_API_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';
const ER_API_URL = 'https://open.er-api.com/v6/latest/USD';
const BCV_PORTAL_URL = 'https://www.bcv.org.ve/';

function getCachePath(storageDir) {
  return path.join(storageDir, 'bcv-cache.json');
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function getCachedBcvRate(storageDir) {
  if (!storageDir) return null;
  const cachePath = getCachePath(storageDir);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.rate !== 'number' || !Number.isFinite(parsed.rate) || parsed.rate <= 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function fetchFromDolarApi(fetchImpl, timeoutMs) {
  const res = await fetchImpl(DOLAR_API_URL, {
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) {
    throw new Error(`DolarApi HTTP ${res.status}`);
  }
  const json = await res.json();
  const rawRate = Number(json && json.promedio);
  if (!Number.isFinite(rawRate) || rawRate <= 0) {
    throw new Error('DolarApi devolvió un valor inválido.');
  }
  return {
    rate: Number(rawRate.toFixed(2)),
    rawRate,
    rateDate: json.fechaActualizacion || new Date().toISOString(),
    source: 'BCV Oficial'
  };
}

async function fetchFromExchangeRateApi(fetchImpl, timeoutMs) {
  const res = await fetchImpl(ER_API_URL, {
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) {
    throw new Error(`OpenER-API HTTP ${res.status}`);
  }
  const json = await res.json();
  const rawRate = Number(json && json.rates && json.rates.VES);
  if (!Number.isFinite(rawRate) || rawRate <= 0) {
    throw new Error('OpenER-API no contiene tasa VES válida.');
  }
  const parsedDate = json.time_last_update_utc ? new Date(json.time_last_update_utc) : new Date();
  return {
    rate: Number(rawRate.toFixed(2)),
    rawRate,
    rateDate: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
    source: 'BCV Respaldo'
  };
}

async function fetchFromBcvPortal(fetchImpl, timeoutMs) {
  const res = await fetchImpl(BCV_PORTAL_URL, {
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) {
    throw new Error(`BCV Portal HTTP ${res.status}`);
  }
  const html = await res.text();
  const match = html.match(/id=["']dolar["'][\s\S]{0,600}?<strong>\s*([\d.,]+)\s*<\/strong>/i);
  if (!match) {
    throw new Error('No se encontró el valor del dólar en bcv.org.ve.');
  }
  const rawRate = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(rawRate) || rawRate <= 0) {
    throw new Error('Valor numérico inválido en bcv.org.ve.');
  }
  return {
    rate: Number(rawRate.toFixed(2)),
    rawRate,
    rateDate: new Date().toISOString(),
    source: 'BCV Portal'
  };
}

async function fetchBcvUsdRate({ storageDir, fetchImpl = global.fetch, timeoutMs = 6000 } = {}) {
  const providers = [fetchFromDolarApi, fetchFromExchangeRateApi, fetchFromBcvPortal];
  const errors = [];

  for (const provider of providers) {
    try {
      const result = await provider(fetchImpl, timeoutMs);
      const payload = {
        ...result,
        fetchedAt: new Date().toISOString()
      };
      if (storageDir) {
        try {
          writeJsonAtomic(getCachePath(storageDir), payload);
        } catch (writeErr) {
          console.error('Error guardando caché BCV:', writeErr);
        }
      }
      return {
        success: true,
        cached: false,
        data: payload
      };
    } catch (err) {
      errors.push(err && err.message ? err.message : String(err));
    }
  }

  const cached = getCachedBcvRate(storageDir);
  if (cached) {
    return {
      success: true,
      cached: true,
      offlineWarning: 'Sin conexión; usando última tasa guardada.',
      data: cached
    };
  }

  return {
    success: false,
    error: 'No se pudo obtener la tasa BCV y no hay una tasa guardada previamente.',
    details: errors
  };
}

module.exports = {
  fetchBcvUsdRate,
  getCachedBcvRate
};
