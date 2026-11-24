const DEFAULT_CHUNK_SIZE = 40;

function chunkLabels(labels, chunkSize = DEFAULT_CHUNK_SIZE) {
  if (!Array.isArray(labels) || labels.length === 0) return [];
  const size = Math.max(1, parseInt(chunkSize, 10) || DEFAULT_CHUNK_SIZE);
  const chunks = [];
  for (let i = 0; i < labels.length; i += size) {
    chunks.push(labels.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runChunkedPrintJob({
  labels,
  printerName,
  chunkSize = DEFAULT_CHUNK_SIZE,
  interChunkDelayMs = 250,
  onProgress,
  printSingleChunk
}) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return {
      success: true,
      sentCount: 0,
      totalCount: 0,
      totalChunks: 0
    };
  }

  if (typeof printSingleChunk !== 'function') {
    throw new Error('printSingleChunk callback is required');
  }

  const chunks = chunkLabels(labels, chunkSize);
  const totalChunks = chunks.length;
  const totalCount = labels.length;
  let sentCount = 0;

  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks[i];
    if (typeof onProgress === 'function') {
      onProgress({
        currentChunk: i + 1,
        totalChunks,
        sentLabels: sentCount,
        totalLabels: totalCount
      });
    }

    const res = await printSingleChunk(chunk, printerName, i);
    if (!res || !res.success) {
      return {
        success: false,
        error: (res && res.error) || 'Error desconocido al imprimir bloque.',
        sentCount,
        totalCount,
        failedAtLabel: sentCount + 1,
        failedChunk: i + 1,
        totalChunks,
        remainingLabels: labels.slice(sentCount)
      };
    }

    sentCount += chunk.length;
    if (typeof onProgress === 'function') {
      onProgress({
        currentChunk: i + 1,
        totalChunks,
        sentLabels: sentCount,
        totalLabels: totalCount
      });
    }

    if (i < totalChunks - 1 && interChunkDelayMs > 0) {
      await sleep(interChunkDelayMs);
    }
  }

  return {
    success: true,
    sentCount,
    totalCount,
    totalChunks
  };
}

module.exports = {
  DEFAULT_CHUNK_SIZE,
  chunkLabels,
  runChunkedPrintJob
};
