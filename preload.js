const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
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
   * Envía los datos de las etiquetas para impresión silenciosa.
   * @param {Array} labels - Lista de objetos de etiquetas a imprimir.
   * @param {string} printerName - Nombre de la impresora destino.
   * @returns {Promise<Object>} Estado de la operación de impresión.
   */
  printLabels: (labels, printerName) => ipcRenderer.invoke('print-labels', labels, printerName)
});
