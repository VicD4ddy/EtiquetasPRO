const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /**
   * Obtiene la ruta real de un File arrastrado usando webUtils de Electron.
   */
  getFilePath: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file) || file.path || '';
      }
    } catch {
      // Fallback
    }
    return (file && file.path) || '';
  },

  /**
   * Abre un selector nativo de archivo PDF.
   */
  selectPdfDialog: () => ipcRenderer.invoke('select-pdf-dialog'),

  /**
   * Envía la ruta de un PDF al main process para ser parseado.
   * @param {string} filePath - Ruta absoluta del archivo PDF.
   * @returns {Promise<Object>} Resultado del parseo (lista de ítems y metadatos).
   */
  parsePDF: (filePath) => ipcRenderer.invoke('parse-pdf', filePath),

  /**
   * Solicita la lista de impresoras instaladas en el sistema operativo.
   * @returns {Promise<Array>} Lista de impresoras.
   */
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  /**
   * Envía los datos de las etiquetas para impresión silenciosa por sub-lotes.
   * @param {Array} labels - Lista de objetos de etiquetas a imprimir.
   * @param {string} printerName - Nombre de la impresora destino.
   * @returns {Promise<Object>} Estado de la operación de impresión.
   */
  printLabels: (labels, printerName) => ipcRenderer.invoke('print-labels', labels, printerName),

  /**
   * Se suscribe al progreso en vivo de impresión por sub-lotes.
   */
  onPrintProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('print-progress', listener);
    return () => ipcRenderer.removeListener('print-progress', listener);
  },

  /**
   * Consulta la tasa BCV oficial (USD) con respaldo offline.
   */
  fetchBcvRate: () => ipcRenderer.invoke('fetch-bcv-rate'),

  /**
   * Obtiene el historial de lotes impresos (últimos 6 meses).
   */
  getHistory: () => ipcRenderer.invoke('get-history'),

  /**
   * Registra un lote impreso en el historial local.
   */
  addHistoryBatch: (batch) => ipcRenderer.invoke('add-history-batch', batch),

  /**
   * Elimina un lote puntual del historial.
   */
  deleteHistoryBatch: (batchId) => ipcRenderer.invoke('delete-history-batch', batchId),

  /**
   * Vacía todo el historial de impresiones.
   */
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  /**
   * Exporta los lotes proporcionados a un archivo CSV elegido por el usuario.
   */
  exportHistoryCsv: (batches) => ipcRenderer.invoke('export-history-csv', batches),

  /**
   * Gestión persistente de proveedores y asociaciones RIF en disco.
   */
  getProviders: () => ipcRenderer.invoke('get-providers'),
  saveProvider: (provider) => ipcRenderer.invoke('save-provider', provider),
  deleteProvider: (providerId) => ipcRenderer.invoke('delete-provider', providerId),
  setRifAssociation: (rif, code) => ipcRenderer.invoke('set-rif-association', rif, code),
  migrateProviders: (legacyPayload) => ipcRenderer.invoke('migrate-providers', legacyPayload),

  /**
   * Exportación e importación de respaldo completo JSON.
   */
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: (mode) => ipcRenderer.invoke('import-backup', mode)
});
