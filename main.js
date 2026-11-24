const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseInvoiceBuffer } = require('./pdfParser');
const { fetchBcvUsdRate } = require('./bcvService');
const {
  getHistory,
  addHistoryBatch,
  deleteHistoryBatch,
  clearHistory,
  buildHistoryCsv
} = require('./historyStore');
const { runChunkedPrintJob } = require('./printSpooler');
const {
  getProvidersData,
  saveProvider,
  deleteProvider,
  setRifAssociation,
  migrateFromLocalStorage
} = require('./providerStore');
const {
  exportBackupPayload,
  importBackupPayload
} = require('./backupService');

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Etiquetas Sotomayor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  // En desarrollo carga la URL de Vite, en producción carga el build estático
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC HANDLERS ---

// 1. Cargar y parsear PDF
ipcMain.handle('parse-pdf', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('El archivo no existe en la ruta provista.');
    }

    const dataBuffer = fs.readFileSync(filePath);
    const parsedData = await parseInvoiceBuffer(dataBuffer);

    return {
      success: true,
      data: parsedData
    };
  } catch (err) {
    console.error('Error parseando PDF:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

// 2. Obtener lista de impresoras
ipcMain.handle('get-printers', async () => {
  try {
    if (!mainWindow) return [];
    return await mainWindow.webContents.getPrintersAsync();
  } catch (err) {
    console.error('Error obteniendo impresoras:', err);
    return [];
  }
});

// 3. Imprimir etiquetas en sub-lotes seguros (evita timeout y saturación de spooler >64 etiquetas)
function printSingleChunk(chunkLabels, printerName, chunkIndex) {
  return new Promise((resolve) => {
    let printWindow = null;
    let hasFinished = false;
    let renderTimer = null;
    let spoolTimer = null;
    const jobId = `print-${Date.now()}-${chunkIndex}-${Math.random().toString(36).slice(2, 7)}`;

    const cleanup = () => {
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }
      if (spoolTimer) {
        clearTimeout(spoolTimer);
        spoolTimer = null;
      }
      ipcMain.removeListener('ready-to-print', onReady);
      if (printWindow && !printWindow.isDestroyed()) {
        printWindow.destroy();
      }
      printWindow = null;
    };

    const finish = (result) => {
      if (hasFinished) return;
      hasFinished = true;
      cleanup();
      resolve(result);
    };

    const onReady = (event, receivedJobId) => {
      if (hasFinished) return;
      if (!printWindow || printWindow.isDestroyed()) return;
      if (event.sender !== printWindow.webContents) return;
      if (receivedJobId && receivedJobId !== jobId) return;

      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }

      spoolTimer = setTimeout(() => {
        finish({ success: false, error: 'Tiempo de espera agotado al enviar el bloque a la impresora.' });
      }, 60000);

      try {
        const printOptions = {
          silent: true,
          margins: { marginType: 'none' },
          pageSize: { width: 55000, height: 40000 } // 55mm x 40mm en micrones
        };

        if (printerName && printerName !== 'Default') {
          printOptions.deviceName = printerName;
        }

        printWindow.webContents.print(printOptions, (success, failureReason) => {
          if (success) {
            finish({ success: true });
          } else {
            finish({ success: false, error: failureReason || 'Error desconocido en driver de impresión.' });
          }
        });
      } catch (err) {
        finish({ success: false, error: err.message });
      }
    };

    printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'printPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    });

    ipcMain.on('ready-to-print', onReady);

    printWindow.webContents.on('did-fail-load', (e, errorCode, errorDesc) => {
      finish({ success: false, error: `Error cargando plantilla de impresión: ${errorDesc || errorCode}` });
    });

    printWindow.webContents.on('render-process-gone', () => {
      finish({ success: false, error: 'El proceso de renderizado de impresión se cerró inesperadamente.' });
    });

    renderTimer = setTimeout(() => {
      finish({ success: false, error: 'Tiempo de espera agotado al renderizar la plantilla de impresión.' });
    }, 15000);

    printWindow.loadFile(path.join(__dirname, 'print.html'));

    printWindow.webContents.once('did-finish-load', () => {
      if (!hasFinished && printWindow && !printWindow.isDestroyed()) {
        printWindow.webContents.send('print-data', { jobId, labels: chunkLabels });
      }
    });
  });
}

ipcMain.handle('print-labels', async (event, labels, printerName) => {
  return await runChunkedPrintJob({
    labels,
    printerName,
    printSingleChunk,
    onProgress: (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('print-progress', progress);
      }
    }
  });
});

// Diálogo nativo para seleccionar PDF
ipcMain.handle('select-pdf-dialog', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar Factura PDF',
      properties: ['openFile'],
      filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { canceled: true };
    }
    const filePath = filePaths[0];
    return {
      canceled: false,
      filePath,
      fileName: path.basename(filePath)
    };
  } catch (err) {
    console.error('Error abriendo selector de PDF:', err);
    return { canceled: true, error: err.message };
  }
});

// 4. Consultar Tasa BCV (USD) con caché offline
ipcMain.handle('fetch-bcv-rate', async () => {
  try {
    const storageDir = app.getPath('userData');
    return await fetchBcvUsdRate({ storageDir });
  } catch (err) {
    console.error('Error consultando tasa BCV:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

// 5. Historial de impresiones (retención 6 meses)
ipcMain.handle('get-history', async () => {
  try {
    const storageDir = app.getPath('userData');
    return {
      success: true,
      data: getHistory(storageDir)
    };
  } catch (err) {
    console.error('Error leyendo historial:', err);
    return {
      success: false,
      error: err.message,
      data: []
    };
  }
});

ipcMain.handle('add-history-batch', async (event, batchInput) => {
  try {
    const storageDir = app.getPath('userData');
    const result = addHistoryBatch(storageDir, batchInput);
    return {
      success: true,
      data: result
    };
  } catch (err) {
    console.error('Error guardando lote en historial:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

ipcMain.handle('delete-history-batch', async (event, batchId) => {
  try {
    const storageDir = app.getPath('userData');
    const updated = deleteHistoryBatch(storageDir, batchId);
    return {
      success: true,
      data: updated
    };
  } catch (err) {
    console.error('Error eliminando lote del historial:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

ipcMain.handle('clear-history', async () => {
  try {
    const storageDir = app.getPath('userData');
    const cleared = clearHistory(storageDir);
    return {
      success: true,
      data: cleared
    };
  } catch (err) {
    console.error('Error limpiando historial:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

ipcMain.handle('export-history-csv', async (event, batches) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar Historial de Etiquetas a CSV',
      defaultPath: path.join(app.getPath('documents'), `Historial_Etiquetas_${today}.csv`),
      filters: [{ name: 'CSV (delimitado por comas)', extensions: ['csv'] }]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const csvContent = buildHistoryCsv(batches || []);
    fs.writeFileSync(filePath, csvContent, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    console.error('Error exportando historial CSV:', err);
    return { success: false, error: err.message };
  }
});

// 6. Proveedores persistentes en userData
ipcMain.handle('get-providers', async () => {
  try {
    const storageDir = app.getPath('userData');
    return { success: true, data: getProvidersData(storageDir) };
  } catch (err) {
    console.error('Error leyendo proveedores:', err);
    return { success: false, error: err.message, data: { providers: [], rifMap: {} } };
  }
});

ipcMain.handle('save-provider', async (event, providerInput) => {
  try {
    const storageDir = app.getPath('userData');
    return { success: true, data: saveProvider(storageDir, providerInput) };
  } catch (err) {
    console.error('Error guardando proveedor:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-provider', async (event, providerId) => {
  try {
    const storageDir = app.getPath('userData');
    return { success: true, data: deleteProvider(storageDir, providerId) };
  } catch (err) {
    console.error('Error eliminando proveedor:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('set-rif-association', async (event, rif, code) => {
  try {
    const storageDir = app.getPath('userData');
    return { success: true, data: setRifAssociation(storageDir, rif, code) };
  } catch (err) {
    console.error('Error guardando asociación RIF:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('migrate-providers', async (event, legacyPayload) => {
  try {
    const storageDir = app.getPath('userData');
    return { success: true, data: migrateFromLocalStorage(storageDir, legacyPayload) };
  } catch (err) {
    console.error('Error migrando proveedores:', err);
    return { success: false, error: err.message };
  }
});

// 7. Respaldo y restauración en JSON
ipcMain.handle('export-backup', async () => {
  try {
    const storageDir = app.getPath('userData');
    const today = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar Respaldo Completo (Proveedores e Historial)',
      defaultPath: path.join(app.getPath('documents'), `Respaldo_EtiquetasPRO_${today}.json`),
      filters: [{ name: 'Respaldo JSON', extensions: ['json'] }]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const payload = exportBackupPayload(storageDir);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { success: true, filePath };
  } catch (err) {
    console.error('Error exportando respaldo:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('import-backup', async (event, mode = 'merge') => {
  try {
    const storageDir = app.getPath('userData');
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar Respaldo JSON',
      properties: ['openFile'],
      filters: [{ name: 'Respaldo JSON', extensions: ['json'] }]
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const raw = fs.readFileSync(filePaths[0], 'utf8');
    const parsed = JSON.parse(raw);
    const data = importBackupPayload(storageDir, parsed, mode);
    return { success: true, data };
  } catch (err) {
    console.error('Error importando respaldo:', err);
    return { success: false, error: err.message };
  }
});
