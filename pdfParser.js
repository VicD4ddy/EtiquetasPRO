const { PDFParse } = require('pdf-parse');

const FLOAT_REGEX = /\d+(?:\.\d+)*,\d+/g;
const HEADER_CODE_REGEX = /^(COD\.?|CODIGO|COD\.?\s*ART\.?|COD\.?\s*PROD\.?|ITEM|ARTICULO)$/;
const HEADER_DESC_REGEX = /^(DESCRIPCION|DESC\.?|DETALLE|CONCEPTO|PRODUCTO)$/;

function parseSpanishFloat(val) {
  if (!val) return 0;
  return parseFloat(val.replace(/\./g, '').replace(',', '.'));
}

function formatSpanishFloat(val) {
  return val.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function normalizeLabel(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[:]/g, '')
    .trim();
}

function parseSpanishMonth(monthStr) {
  const months = {
    ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
    jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12'
  };
  const normalized = monthStr.toLowerCase().replace(/[\.\s]/g, '').slice(0, 3);
  return months[normalized] || '01';
}

function extractDateCode(text) {
  const textDateRegex = /\b(\d{2})\/([a-zA-Z\.\s]+)\/(\d{4})\b/;
  const textMatch = text.match(textDateRegex);
  if (textMatch) {
    const month = parseSpanishMonth(textMatch[2]);
    const yearShort = textMatch[3].slice(-2);
    return `${month}/${yearShort}`;
  }

  const numDateRegex = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
  const numMatch = text.match(numDateRegex);
  if (numMatch) {
    const month = numMatch[2];
    const yearShort = numMatch[3].slice(-2);
    return `${month}/${yearShort}`;
  }

  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const y = String(d.getFullYear()).slice(-2);
  return `${m}/${y}`;
}

function extractInvoiceNum(text) {
  const hashMatch = text.match(/#(\d+)/);
  if (hashMatch) {
    return hashMatch[1];
  }
  const entregaMatch = text.match(/NOTA\s+DE\s+ENTREGA:\s*(\d+)/i);
  if (entregaMatch) {
    return entregaMatch[1];
  }
  return 'S/N';
}

function extractProviderRif(text) {
  const rifMatch = text.match(/\bJ-?\d{8}-?\d\b/i);
  if (rifMatch) {
    return rifMatch[0].toUpperCase().replace(/-/g, '');
  }
  return 'DESCONOCIDO';
}

function cleanDescription(text) {
  return (text || '').replace(/^[\s\t\-,]+|[\s\t\-,]+$/g, '').trim();
}

function joinAtomsText(atoms, useTabs = false) {
  if (!atoms || atoms.length === 0) return '';
  let out = atoms[0].str;
  for (let i = 1; i < atoms.length; i++) {
    const prev = atoms[i - 1];
    const curr = atoms[i];
    const gap = curr.x - prev.xEnd;
    if (useTabs && gap >= 6) {
      out += '\t' + curr.str;
    } else if (gap >= 0.8) {
      out += ' ' + curr.str;
    } else {
      // Si los fragmentos están pegados (0pt o kerning), conservar espacio solo si alguno lo sugiere o si son bloques separados
      out += (gap >= 0 ? ' ' : '') + curr.str;
    }
  }
  return out.trim();
}

function joinAtomsForSingleColumn(atoms) {
  if (!atoms || atoms.length === 0) return '';
  let out = atoms[0].str;
  for (let i = 1; i < atoms.length; i++) {
    const prev = atoms[i - 1];
    const curr = atoms[i];
    const gap = curr.x - prev.xEnd;
    if (gap >= 0.8) {
      out += ' ' + curr.str;
    } else {
      out += curr.str;
    }
  }
  return out.trim();
}

function applyMathQtyCorrection(code, description, itemMatches) {
  let qtyOrd = itemMatches[0][0];
  const qtyBonif = itemMatches[1][0];
  const iva = itemMatches[2][0];
  const total = itemMatches[3][0];
  const dcto1 = itemMatches[4][0];
  const subtotal = itemMatches[5][0];
  const costoListaUnit = itemMatches[6][0];
  const dcto2 = itemMatches[7][0];

  const qtyOrdVal = parseSpanishFloat(qtyOrd);
  const qtyBonifVal = parseSpanishFloat(qtyBonif);
  const subtotalVal = parseSpanishFloat(subtotal);
  const costoListaUnitVal = parseSpanishFloat(costoListaUnit);

  if (costoListaUnitVal > 0) {
    const expectedTotalUnits = Math.round(subtotalVal / costoListaUnitVal);
    const actualTotalUnits = qtyOrdVal + qtyBonifVal;

    if (Math.abs(actualTotalUnits - expectedTotalUnits) > 0.01 && expectedTotalUnits > 0) {
      const expectedQtyOrdVal = expectedTotalUnits - qtyBonifVal;
      if (expectedQtyOrdVal > 0) {
        const expectedQtyOrdStr = formatSpanishFloat(expectedQtyOrdVal);
        if (qtyOrd.endsWith(expectedQtyOrdStr)) {
          const prefix = qtyOrd.substring(0, qtyOrd.length - expectedQtyOrdStr.length);
          if (prefix) {
            description = `${description} ${prefix}`.trim();
          }
          qtyOrd = expectedQtyOrdStr;
        }
      }
    }
  }

  return {
    code,
    description,
    qtyOrd,
    qtyBonif,
    iva,
    total,
    dcto1,
    subtotal,
    costoListaUnit,
    dcto2
  };
}

function splitHeaderTextFallback(headerPart) {
  const trimmed = (headerPart || '').trim();
  if (!trimmed) {
    return { code: '', description: '', usedFallback: true, reason: 'Sin encabezado de texto en la fila.' };
  }

  if (trimmed.includes('\t')) {
    const parts = trimmed.split(/\t+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        code: parts[0],
        description: parts.slice(1).join(' '),
        usedFallback: false,
        reason: ''
      };
    }
  }

  const multiSpaceMatch = trimmed.match(/\s{2,}/);
  if (multiSpaceMatch) {
    const idx = multiSpaceMatch.index;
    return {
      code: trimmed.slice(0, idx).trim(),
      description: trimmed.slice(idx + multiSpaceMatch[0].length).trim(),
      usedFallback: false,
      reason: ''
    };
  }

  const firstSpaceIndex = trimmed.search(/\s/);
  if (firstSpaceIndex === -1) {
    return {
      code: trimmed,
      description: '',
      usedFallback: true,
      reason: 'Solo se detectó un bloque sin separador entre código y descripción.'
    };
  }

  return {
    code: trimmed.slice(0, firstSpaceIndex).trim(),
    description: trimmed.slice(firstSpaceIndex).trim(),
    usedFallback: true,
    reason: 'Separación por espacio simple (sin referencia de columnas).'
  };
}

function parseLineFallback(line) {
  const matches = [...line.matchAll(FLOAT_REGEX)];
  if (matches.length < 8) {
    return null;
  }

  const itemMatches = matches.slice(-8);
  const firstMatchIndex = itemMatches[0].index;
  const headerPart = line.substring(0, firstMatchIndex).trim();

  const split = splitHeaderTextFallback(headerPart);
  const code = split.code;
  const description = cleanDescription(split.description);

  if (!code || code.toLowerCase().includes('total') || code.toLowerCase().includes('sub')) {
    return null;
  }

  const base = applyMathQtyCorrection(code, description, itemMatches);
  const evaluation = evaluateRowReview(base.code, base.description, split.usedFallback, split.reason);

  return {
    ...base,
    needsReview: evaluation.needsReview,
    warning: evaluation.warning
  };
}

function evaluateRowReview(code, description, forcedFlag = false, forcedReason = '') {
  const warnings = [];
  if (forcedFlag && forcedReason) {
    warnings.push(forcedReason);
  }
  if (!code) {
    warnings.push('Código vacío; revisar fila.');
  }
  if (!description) {
    warnings.push('Descripción vacía; revisar separación de columnas.');
  }
  const wordCount = code ? code.split(/\s+/).filter(Boolean).length : 0;
  if (code && (code.length > 24 || wordCount >= 3)) {
    warnings.push('El código parece demasiado largo; verificar si absorbió parte de la descripción.');
  }
  return {
    needsReview: warnings.length > 0,
    warning: warnings.join(' ')
  };
}

function groupPageItemsIntoRows(items, pageNum, yTolerance = 3.0) {
  const atoms = [];
  for (const item of items) {
    if (!item || typeof item.str !== 'string') continue;
    const trimmed = item.str.trim();
    if (!trimmed) continue;
    const x = Array.isArray(item.transform) ? Number(item.transform[4]) || 0 : 0;
    const y = Array.isArray(item.transform) ? Number(item.transform[5]) || 0 : 0;
    const width = Number(item.width) || 0;
    atoms.push({
      str: trimmed,
      rawStr: item.str,
      x,
      y,
      width,
      xEnd: x + width
    });
  }

  atoms.sort((a, b) => {
    if (Math.abs(a.y - b.y) > yTolerance) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  const rows = [];
  for (const atom of atoms) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow.y - atom.y) <= yTolerance) {
      lastRow.atoms.push(atom);
      lastRow.y = (lastRow.y * (lastRow.atoms.length - 1) + atom.y) / lastRow.atoms.length;
    } else {
      rows.push({ page: pageNum, y: atom.y, atoms: [atom] });
    }
  }

  for (const row of rows) {
    row.atoms.sort((a, b) => a.x - b.x);
  }

  return rows;
}

function extractCandidateRow(row) {
  const spans = [];
  let rowText = '';
  for (let i = 0; i < row.atoms.length; i++) {
    const atom = row.atoms[i];
    if (i > 0) rowText += ' ';
    const start = rowText.length;
    rowText += atom.str;
    const end = rowText.length;
    spans.push({ atomIndex: i, start, end, atom });
  }

  const matches = [...rowText.matchAll(FLOAT_REGEX)];
  if (matches.length < 8) {
    return null;
  }

  const itemMatches = matches.slice(-8);
  const firstMatchIndex = itemMatches[0].index;

  const prefixAtoms = [];
  for (const span of spans) {
    if (span.end <= firstMatchIndex) {
      prefixAtoms.push(span.atom);
    } else if (span.start < firstMatchIndex) {
      const leftStr = span.atom.str.slice(0, firstMatchIndex - span.start).trim();
      if (leftStr) {
        const ratio = leftStr.length / Math.max(1, span.atom.str.length);
        const partialWidth = span.atom.width * ratio;
        prefixAtoms.push({
          ...span.atom,
          str: leftStr,
          width: partialWidth,
          xEnd: span.atom.x + partialWidth
        });
      }
      break;
    } else {
      break;
    }
  }

  if (prefixAtoms.length === 0) {
    return null;
  }

  const roughHeader = joinAtomsText(prefixAtoms, false).toLowerCase();
  if (!roughHeader || roughHeader.startsWith('total') || roughHeader.startsWith('sub')) {
    return null;
  }

  return {
    page: row.page,
    y: row.y,
    atoms: row.atoms,
    prefixAtoms,
    itemMatches
  };
}

function detectHeaderRow(rows) {
  for (const row of rows) {
    let codeAtom = null;
    let descAtom = null;
    for (const atom of row.atoms) {
      const norm = normalizeLabel(atom.str);
      if (!codeAtom && HEADER_CODE_REGEX.test(norm)) {
        codeAtom = atom;
      } else if (codeAtom && !descAtom && atom.x > codeAtom.x && HEADER_DESC_REGEX.test(norm)) {
        descAtom = atom;
      }
    }
    if (codeAtom && descAtom) {
      return {
        codeX: Number(codeAtom.x.toFixed(1)),
        descX: Number(descAtom.x.toFixed(1)),
        rawHeaderText: row.atoms.map((a) => a.str).join(' | ')
      };
    }
  }
  return null;
}

function computeMedian(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clusterValues(values, tolerance = 3.5) {
  if (!values || values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters = [];
  for (const val of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(val - last.center) <= tolerance) {
      last.values.push(val);
      last.center = last.values.reduce((acc, v) => acc + v, 0) / last.values.length;
    } else {
      clusters.push({ center: val, values: [val] });
    }
  }
  return clusters.map((c) => ({
    center: c.center,
    count: c.values.length
  }));
}

function detectColumnLayout(allRows, candidateRows) {
  const detectedHeader = detectHeaderRow(allRows);
  const firstAtomXs = candidateRows.map((r) => r.prefixAtoms[0].x);
  const codeColX = computeMedian(firstAtomXs);

  const subsequentXs = [];
  for (const row of candidateRows) {
    const rowSeen = new Set();
    for (let i = 1; i < row.prefixAtoms.length; i++) {
      const x = row.prefixAtoms[i].x;
      if (codeColX !== null && x > codeColX + 15) {
        const bucket = Math.round(x);
        if (!rowSeen.has(bucket)) {
          rowSeen.add(bucket);
          subsequentXs.push(x);
        }
      }
    }
  }

  const clusters = clusterValues(subsequentXs, 3.5);
  const minSupport = Math.max(2, Math.ceil(candidateRows.length * 0.3));
  const strongClusters = clusters.filter((c) => c.count >= minSupport);

  if (strongClusters.length > 0) {
    // Elegir el clúster más a la izquierda con soporte sólido (los demás a la derecha suelen ser segundas palabras/segmentos de la descripción)
    strongClusters.sort((a, b) => a.center - b.center);
    const chosen = strongClusters[0];
    const descColX = Number(chosen.center.toFixed(1));
    const splitX = Number((descColX - 2.5).toFixed(1));
    return {
      detectedHeader,
      detectedColumns: {
        source: 'data-cluster',
        codeColX: codeColX !== null ? Number(codeColX.toFixed(1)) : null,
        descColX,
        splitX,
        clusterSupport: chosen.count
      }
    };
  }

  if (detectedHeader) {
    const headerSplitX = Number((detectedHeader.descX - 2.5).toFixed(1));
    const headerMatchesAtLeastOneSplit = candidateRows.some((row) => {
      const hasLeft = row.prefixAtoms.some((a) => a.x < headerSplitX);
      const hasRight = row.prefixAtoms.some((a) => a.x >= headerSplitX);
      const crossesSplit = row.prefixAtoms.some((a) => a.x < headerSplitX && a.xEnd > headerSplitX + 10);
      return (hasLeft && hasRight) || crossesSplit;
    });

    if (headerMatchesAtLeastOneSplit) {
      return {
        detectedHeader,
        detectedColumns: {
          source: 'header',
          codeColX: codeColX !== null ? Number(codeColX.toFixed(1)) : detectedHeader.codeX,
          descColX: detectedHeader.descX,
          splitX: headerSplitX,
          clusterSupport: 0
        }
      };
    }
  }

  // Fallback por mayor hueco horizontal entre átomos de prefijo
  const gapMidpoints = [];
  for (const row of candidateRows) {
    if (row.prefixAtoms.length >= 2) {
      let bestGap = -1;
      let bestMid = null;
      for (let i = 1; i < row.prefixAtoms.length; i++) {
        const prev = row.prefixAtoms[i - 1];
        const curr = row.prefixAtoms[i];
        const gap = curr.x - prev.xEnd;
        if (gap > bestGap) {
          bestGap = gap;
          bestMid = curr.x - Math.min(2.5, Math.max(0.5, gap / 2));
        }
      }
      if (bestMid !== null && bestGap >= 4) {
        gapMidpoints.push(bestMid);
      }
    }
  }

  if (gapMidpoints.length > 0) {
    const splitX = Number(computeMedian(gapMidpoints).toFixed(1));
    return {
      detectedHeader,
      detectedColumns: {
        source: 'gap',
        codeColX: codeColX !== null ? Number(codeColX.toFixed(1)) : null,
        descColX: Number((splitX + 2.5).toFixed(1)),
        splitX,
        clusterSupport: gapMidpoints.length
      }
    };
  }

  return {
    detectedHeader,
    detectedColumns: {
      source: 'text-fallback',
      codeColX: codeColX !== null ? Number(codeColX.toFixed(1)) : null,
      descColX: null,
      splitX: null,
      clusterSupport: 0
    }
  };
}

function splitMergedAtomAtX(atom, splitX) {
  const text = atom.str;
  if (text.includes('\t')) {
    const parts = text.split(/\t+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        code: parts[0],
        description: parts.slice(1).join(' '),
        heuristic: false
      };
    }
  }

  const multiSpace = text.match(/\s{2,}/);
  if (multiSpace) {
    return {
      code: text.slice(0, multiSpace.index).trim(),
      description: text.slice(multiSpace.index + multiSpace[0].length).trim(),
      heuristic: false
    };
  }

  const width = Math.max(1, atom.width);
  const ratio = Math.min(0.9, Math.max(0.1, (splitX - atom.x) / width));
  const approxIdx = Math.round(ratio * text.length);

  // 1. Buscar espacio cercano dentro de ±4 caracteres
  let bestSpaceIdx = -1;
  let bestSpaceDist = Infinity;
  for (let i = Math.max(1, approxIdx - 4); i <= Math.min(text.length - 2, approxIdx + 4); i++) {
    if (text[i] === ' ') {
      const dist = Math.abs(i - approxIdx);
      if (dist < bestSpaceDist) {
        bestSpaceDist = dist;
        bestSpaceIdx = i;
      }
    }
  }
  if (bestSpaceIdx !== -1) {
    return {
      code: text.slice(0, bestSpaceIdx).trim(),
      description: text.slice(bestSpaceIdx + 1).trim(),
      heuristic: true
    };
  }

  // 2. Buscar transición de dígito/símbolo a palabra alfabética larga (>= 4 letras) cerca de approxIdx
  const transitionRegex = /(?<=[0-9\-_/.])([A-ZÁÉÍÓÚÑ]{4,})/g;
  let bestTransIdx = -1;
  let bestTransDist = Infinity;
  for (const m of text.matchAll(transitionRegex)) {
    const idx = m.index;
    const dist = Math.abs(idx - approxIdx);
    if (dist <= 10 && dist < bestTransDist) {
      bestTransDist = dist;
      bestTransIdx = idx;
    }
  }
  if (bestTransIdx !== -1) {
    return {
      code: text.slice(0, bestTransIdx).trim(),
      description: text.slice(bestTransIdx).trim(),
      heuristic: true
    };
  }

  // 3. Corte proporcional directo como último recurso
  const safeIdx = Math.max(1, Math.min(text.length - 1, approxIdx));
  return {
    code: text.slice(0, safeIdx).trim(),
    description: text.slice(safeIdx).trim(),
    heuristic: true
  };
}

function splitRowByColumns(candidate, detectedColumns) {
  const { prefixAtoms } = candidate;
  const { splitX } = detectedColumns;

  if (splitX !== null) {
    const leftAtoms = prefixAtoms.filter((a) => a.x < splitX);
    const rightAtoms = prefixAtoms.filter((a) => a.x >= splitX);

    if (leftAtoms.length === 1 && rightAtoms.length === 0 && leftAtoms[0].xEnd > splitX + 10) {
      const mergedSplit = splitMergedAtomAtX(leftAtoms[0], splitX);
      const warningMsg = mergedSplit.heuristic
        ? 'Código y descripción muy juntos en el PDF; verificar corte.'
        : '';
      return {
        code: mergedSplit.code,
        description: cleanDescription(mergedSplit.description),
        forcedFlag: mergedSplit.heuristic,
        forcedReason: warningMsg
      };
    }

    const code = joinAtomsForSingleColumn(leftAtoms);
    const description = cleanDescription(joinAtomsForSingleColumn(rightAtoms));
    return {
      code,
      description,
      forcedFlag: false,
      forcedReason: ''
    };
  }

  const rawText = joinAtomsText(prefixAtoms, true);
  const split = splitHeaderTextFallback(rawText);
  return {
    code: split.code,
    description: cleanDescription(split.description),
    forcedFlag: split.usedFallback,
    forcedReason: split.reason
  };
}

async function extractWithPdfJsCoordinates(dataBuffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(dataBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    verbosity: 0
  });

  const doc = await loadingTask.promise;
  try {
    const totalPages = doc.numPages;
    const allRows = [];
    const pageTextLines = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const tc = await page.getTextContent();
      const pageRows = groupPageItemsIntoRows(tc.items, pageNum);
      for (const r of pageRows) {
        allRows.push(r);
        pageTextLines.push(joinAtomsText(r.atoms, true));
      }
    }

    const fullText = pageTextLines.join('\n');
    const candidateRows = [];
    for (const row of allRows) {
      const candidate = extractCandidateRow(row);
      if (candidate) {
        candidateRows.push(candidate);
      }
    }

    const { detectedHeader, detectedColumns } = detectColumnLayout(allRows, candidateRows);

    const items = [];
    const sampleRows = [];

    for (const candidate of candidateRows) {
      const splitResult = splitRowByColumns(candidate, detectedColumns);
      const codeLower = splitResult.code.toLowerCase();
      if (!splitResult.code || codeLower.includes('total') || codeLower.includes('sub')) {
        continue;
      }

      const base = applyMathQtyCorrection(splitResult.code, splitResult.description, candidate.itemMatches);
      const review = evaluateRowReview(
        base.code,
        base.description,
        splitResult.forcedFlag,
        splitResult.forcedReason
      );

      const id = `item-${items.length}`;
      const itemObj = {
        id,
        ...base,
        needsReview: review.needsReview,
        warning: review.warning
      };
      items.push(itemObj);

      if (sampleRows.length < 15 || (review.needsReview && sampleRows.length < 25)) {
        sampleRows.push({
          id,
          page: candidate.page,
          y: Number(candidate.y.toFixed(1)),
          needsReview: review.needsReview,
          warning: review.warning,
          code: itemObj.code,
          description: itemObj.description,
          prefixAtoms: candidate.prefixAtoms.map((a) => ({
            str: a.str,
            x: Number(a.x.toFixed(1)),
            xEnd: Number(a.xEnd.toFixed(1))
          }))
        });
      }
    }

    const flaggedCount = items.filter((i) => i.needsReview).length;

    return {
      invoiceNum: extractInvoiceNum(fullText),
      dateCode: extractDateCode(fullText),
      providerRif: extractProviderRif(fullText),
      items,
      diagnostic: {
        parserMode: 'pdfjs-coordinates',
        totalPages,
        detectedHeader,
        detectedColumns,
        itemCount: items.length,
        flaggedCount,
        sampleRows
      }
    };
  } finally {
    await doc.destroy();
  }
}

async function extractWithFallbackText(dataBuffer, causeError) {
  let parser = null;
  try {
    parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();
    const text = data.text || '';
    const lines = text.split('\n');
    const items = [];
    const sampleRows = [];

    for (const line of lines) {
      const parsedItem = parseLineFallback(line);
      if (parsedItem) {
        const id = `item-${items.length}`;
        const itemObj = { id, ...parsedItem };
        items.push(itemObj);

        if (sampleRows.length < 15 || (itemObj.needsReview && sampleRows.length < 25)) {
          sampleRows.push({
            id,
            needsReview: itemObj.needsReview,
            warning: itemObj.warning,
            code: itemObj.code,
            description: itemObj.description,
            rawLine: line.trim()
          });
        }
      }
    }

    return {
      invoiceNum: extractInvoiceNum(text),
      dateCode: extractDateCode(text),
      providerRif: extractProviderRif(text),
      items,
      diagnostic: {
        parserMode: 'fallback-text',
        fallbackReason: causeError ? causeError.message : 'Unknown',
        totalPages: data.total || null,
        detectedHeader: null,
        detectedColumns: null,
        itemCount: items.length,
        flaggedCount: items.filter((i) => i.needsReview).length,
        sampleRows
      }
    };
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch (e) {
        console.error('Error destruyendo parser:', e);
      }
    }
  }
}

async function parseInvoiceBuffer(dataBuffer) {
  try {
    return await extractWithPdfJsCoordinates(dataBuffer);
  } catch (err) {
    console.warn('Fallo parser por coordenadas, usando fallback de texto:', err.message);
    return await extractWithFallbackText(dataBuffer, err);
  }
}

module.exports = {
  parseInvoiceBuffer,
  parseLineFallback,
  extractDateCode,
  extractInvoiceNum,
  extractProviderRif,
  parseSpanishFloat,
  formatSpanishFloat
};
