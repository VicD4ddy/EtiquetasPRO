const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseInvoiceBuffer,
  parseLineFallback,
  extractDateCode,
  extractInvoiceNum,
  extractProviderRif
} = require('../pdfParser');

function escapePdfText(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Construye un PDF 1.4 válido en memoria colocando cada texto en coordenadas absolutas (x, y).
 */
function buildSyntheticPdf(entries) {
  const ops = ['BT', '/F1 10 Tf'];
  for (const entry of entries) {
    ops.push(`1 0 0 1 ${entry.x} ${entry.y} Tm (${escapePdfText(entry.text)}) Tj`);
  }
  ops.push('ET');
  const streamContent = ops.join('\n');

  const objects = [
    '1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n',
    '2 0 obj\n<</Type /Pages /Count 1 /Kids [3 0 R]>>\nendobj\n',
    '3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>\nendobj\n',
    `4 0 obj\n<</Length ${Buffer.byteLength(streamContent, 'latin1')}>>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${objects.length + 1} /Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

function makeNumericCols(y, overrides = {}) {
  const vals = {
    qtyOrd: overrides.qtyOrd || '4,00',
    qtyBonif: overrides.qtyBonif || '0,00',
    iva: overrides.iva || '16,00',
    total: overrides.total || '116,00',
    dcto1: overrides.dcto1 || '0,00',
    subtotal: overrides.subtotal || '100,00',
    costo: overrides.costo || '25,00',
    dcto2: overrides.dcto2 || '0,00'
  };
  return [
    { x: 320, y, text: vals.qtyOrd },
    { x: 355, y, text: vals.qtyBonif },
    { x: 390, y, text: vals.iva },
    { x: 425, y, text: vals.total },
    { x: 460, y, text: vals.dcto1 },
    { x: 495, y, text: vals.subtotal },
    { x: 535, y, text: vals.costo },
    { x: 575, y, text: vals.dcto2 }
  ];
}

test('Caso A: separa correctamente códigos con espacios, guiones, barras y puntos usando coordenadas', async () => {
  const entries = [
    { x: 40, y: 740, text: 'REPUESTOS SOTOMAYOR #00112744 RIF: J-30326120-5 Fecha: 08/jun./2026' },
    { x: 40, y: 700, text: 'CODIGO' },
    { x: 140, y: 700, text: 'DESCRIPCION' },
    // Fila 1: código con espacio interno
    { x: 40, y: 680, text: 'BKR 6E' },
    { x: 140, y: 680, text: 'BUJIA NGK ESTANDAR' },
    ...makeNumericCols(680),
    // Fila 2: código con guion
    { x: 40, y: 660, text: '123-456' },
    { x: 140, y: 660, text: 'FILTRO DE AIRE' },
    ...makeNumericCols(660),
    // Fila 3: código con barra y espacio
    { x: 40, y: 640, text: 'A/B 01' },
    { x: 140, y: 640, text: 'CORREA ALTERNADOR' },
    ...makeNumericCols(640),
    // Fila 4: código con punto y espacio
    { x: 40, y: 620, text: 'MD.12 34' },
    { x: 140, y: 620, text: 'PASTILLA DE FRENO' },
    ...makeNumericCols(620)
  ];

  const result = await parseInvoiceBuffer(buildSyntheticPdf(entries));

  assert.equal(result.invoiceNum, '00112744');
  assert.equal(result.dateCode, '06/26');
  assert.equal(result.providerRif, 'J303261205');
  assert.equal(result.diagnostic.parserMode, 'pdfjs-coordinates');
  assert.equal(result.diagnostic.detectedColumns.source, 'data-cluster');
  assert.equal(result.items.length, 4);

  assert.deepEqual(
    result.items.map((i) => ({ id: i.id, code: i.code, description: i.description, needsReview: i.needsReview })),
    [
      { id: 'item-0', code: 'BKR 6E', description: 'BUJIA NGK ESTANDAR', needsReview: false },
      { id: 'item-1', code: '123-456', description: 'FILTRO DE AIRE', needsReview: false },
      { id: 'item-2', code: 'A/B 01', description: 'CORREA ALTERNADOR', needsReview: false },
      { id: 'item-3', code: 'MD.12 34', description: 'PASTILLA DE FRENO', needsReview: false }
    ]
  );
});

test('Caso B: separa códigos largos próximos a la columna de descripción sin absorber texto', async () => {
  const entries = [
    { x: 40, y: 700, text: 'CODIGO' },
    { x: 120, y: 700, text: 'DESCRIPCION' },
    // Código largo (~70.6pt, termina en x~110.6) próximo a x=120 donde inicia la descripción
    { x: 40, y: 680, text: 'ABC123456789' },
    { x: 120, y: 680, text: 'FILTRO DE ACEITE TOYOTA' },
    ...makeNumericCols(680),
    { x: 40, y: 660, text: 'XYZ-99' },
    { x: 120, y: 660, text: 'EMPACADURA TAPA VALVULA' },
    ...makeNumericCols(660)
  ];

  const result = await parseInvoiceBuffer(buildSyntheticPdf(entries));
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].code, 'ABC123456789');
  assert.equal(result.items[0].description, 'FILTRO DE ACEITE TOYOTA');
  assert.equal(result.items[0].needsReview, false);
  assert.equal(result.items[1].code, 'XYZ-99');
  assert.equal(result.items[1].description, 'EMPACADURA TAPA VALVULA');
});

test('Caso B extremo: separa átomo único fusionado cruzando splitX y lo marca para revisión', async () => {
  const entries = [
    { x: 40, y: 700, text: 'CODIGO' },
    { x: 120, y: 700, text: 'DESCRIPCION' },
    { x: 40, y: 680, text: 'BKR 6E' },
    { x: 120, y: 680, text: 'BUJIA NGK' },
    ...makeNumericCols(680),
    // Un solo átomo que fusiona código y descripción cruzando x=120
    { x: 40, y: 660, text: 'ABC123456789FILTRO DE ACEITE' },
    ...makeNumericCols(660),
    { x: 40, y: 640, text: '123-456' },
    { x: 120, y: 640, text: 'PASTILLA DE FRENO' },
    ...makeNumericCols(640)
  ];

  const result = await parseInvoiceBuffer(buildSyntheticPdf(entries));
  assert.equal(result.items.length, 3);
  assert.equal(result.items[1].code, 'ABC123456789');
  assert.equal(result.items[1].description, 'FILTRO DE ACEITE');
  assert.equal(result.items[1].needsReview, true);
  assert.ok(result.items[1].warning.length > 0);
  assert.equal(result.diagnostic.flaggedCount, 1);
});

test('Encabezado centrado: el clúster de datos prevalece cuando DESCRIPCION está desplazado a la derecha', async () => {
  const entries = [
    { x: 40, y: 700, text: 'CODIGO' },
    // Encabezado centrado mucho más a la derecha (x=220) que las descripciones reales (x=120)
    { x: 220, y: 700, text: 'DESCRIPCION' },
    { x: 40, y: 680, text: 'COD 01' },
    { x: 120, y: 680, text: 'BOMBA DE AGUA CORSA' },
    ...makeNumericCols(680),
    { x: 40, y: 660, text: 'COD 02' },
    { x: 120, y: 660, text: 'TERMOSTATO AVEO' },
    ...makeNumericCols(660)
  ];

  const result = await parseInvoiceBuffer(buildSyntheticPdf(entries));
  assert.equal(result.diagnostic.detectedColumns.source, 'data-cluster');
  assert.equal(result.items[0].code, 'COD 01');
  assert.equal(result.items[0].description, 'BOMBA DE AGUA CORSA');
  assert.equal(result.items[1].code, 'COD 02');
  assert.equal(result.items[1].description, 'TERMOSTATO AVEO');
});

test('Auto-corrección de cantidad pegada y códigos repetidos con IDs únicos', async () => {
  const entries = [
    { x: 40, y: 700, text: 'CODIGO' },
    { x: 120, y: 700, text: 'DESCRIPCION' },
    { x: 40, y: 680, text: 'DUP-01' },
    { x: 120, y: 680, text: 'RODAMIENTO DELANTERO' },
    // qtyOrd pegado con prefijo numérico "50" antes de "4,00" (subtotal 100 / costo 25 = 4)
    ...makeNumericCols(680, { qtyOrd: '504,00', subtotal: '100,00', costo: '25,00' }),
    { x: 40, y: 660, text: 'DUP-01' },
    { x: 120, y: 660, text: 'RODAMIENTO TRASERO' },
    ...makeNumericCols(660)
  ];

  const result = await parseInvoiceBuffer(buildSyntheticPdf(entries));
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, 'item-0');
  assert.equal(result.items[1].id, 'item-1');
  assert.equal(result.items[0].qtyOrd, '4,00');
  assert.equal(result.items[0].description, 'RODAMIENTO DELANTERO 50');
});

test('Metadatos y fallback textual parseLineFallback', () => {
  assert.equal(extractDateCode('Fecha: 04/06/2026'), '06/26');
  assert.equal(extractInvoiceNum('NOTA DE ENTREGA: 00002426'), '00002426');
  assert.equal(extractProviderRif('RIF J303261205'), 'J303261205');

  const tabParsed = parseLineFallback('BKR 6E\tBUJIA NGK\t4,00 0,00 16,00 116,00 0,00 100,00 25,00 0,00');
  assert.equal(tabParsed.code, 'BKR 6E');
  assert.equal(tabParsed.description, 'BUJIA NGK');
  assert.equal(tabParsed.needsReview, false);

  const singleSpaceParsed = parseLineFallback('ABC123 FILTRO ACEITE 4,00 0,00 16,00 116,00 0,00 100,00 25,00 0,00');
  assert.equal(singleSpaceParsed.code, 'ABC123');
  assert.equal(singleSpaceParsed.description, 'FILTRO ACEITE');
  assert.equal(singleSpaceParsed.needsReview, true);
});
