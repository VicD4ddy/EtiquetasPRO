// Clave LUCHAREMOS: L:1, U:2, C:3, H:4, A:5, R:6, E:7, M:8, O:9, S:0

const CIPHER_KEY = {
  '1': 'L',
  '2': 'U',
  '3': 'C',
  '4': 'H',
  '5': 'A',
  '6': 'R',
  '7': 'E',
  '8': 'M',
  '9': 'O',
  '0': 'S'
};

/**
 * Codifica un valor numérico de costo en USD bajo la regla comercial LUCHAREMOS.
 * @param {number} costUSD - Costo en dólares.
 * @returns {string} Código cifrado con el sufijo "xDA" (ej. "LCxDA" o "L,RxDA").
 */
export function encodeLUCHAREMOS(costUSD) {
  if (costUSD === null || costUSD === undefined || isNaN(costUSD) || costUSD <= 0) {
    return "";
  }

  let textToCipher = "";

  if (costUSD >= 2.50) {
    // Regla A: Redondear al entero más cercano
    const rounded = Math.round(costUSD);
    textToCipher = rounded.toString();
  } else {
    // Regla B: Un solo decimal separado por coma
    // Usamos toFixed(1) para mantener un decimal
    const fixed = costUSD.toFixed(1);
    textToCipher = fixed.replace('.', ',');
  }

  // Cifrar los dígitos
  let cipheredCode = "";
  for (let i = 0; i < textToCipher.length; i++) {
    const char = textToCipher[i];
    if (CIPHER_KEY[char]) {
      cipheredCode += CIPHER_KEY[char];
    } else {
      cipheredCode += char; // Conserva la coma y cualquier otro carácter especial
    }
  }

  // Retornar concatenado con el sufijo fijo xDA
  return `${cipheredCode}xDA`;
}

/**
 * Parsea un valor numérico en formato Valery (82,417.23 / 2.00) o español (82.417,23 / 2,00).
 * @param {string|number} val - Valor a convertir.
 * @returns {number}
 */
export function parseLocaleFloat(val) {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (!val || typeof val !== 'string') return 0;

  const cleaned = val.trim().replace(/\s+/g, '');
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized = cleaned;
  if (lastComma !== -1 && lastDot !== -1) {
    normalized = lastDot > lastComma
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastComma !== -1) {
    normalized = /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (lastDot !== -1) {
    normalized = /\.\d{1,2}$/.test(cleaned)
      ? cleaned
      : cleaned.replace(/\./g, '');
  }

  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Parsea un precio de lista en bolívares y calcula el costo en USD basándose en la tasa BCV.
 * @param {string|number} priceBsStr - Precio en Bs (formato Valery o español).
 * @param {number} tasaBCV - Tasa de cambio BCV.
 * @returns {number} Costo en USD.
 */
export function calculateCostUSD(priceBsStr, tasaBCV) {
  if (!tasaBCV || tasaBCV <= 0) return 0;

  const priceBs = parseLocaleFloat(priceBsStr);
  if (isNaN(priceBs) || priceBs <= 0) return 0;

  return priceBs / tasaBCV;
}
