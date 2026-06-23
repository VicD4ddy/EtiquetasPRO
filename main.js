const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFParse } = require('pdf-parse');

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

// --- FUNCIONES UTILITARIAS PARA PARSEO DE PDF ---

function parseSpanishFloat(val) {
  if (!val) return 0;
  return parseFloat(val.replace(/\./g, '').replace(',', '.'));
}

function formatSpanishFloat(val) {
  return val.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Parsea una línea de texto de la factura buscando campos tabulares.
 */
function parseLine(line) {
  const floatRegex = /\d+(?:\.\d+)*,\d+/g;
  const matches = [...line.matchAll(floatRegex)];
  
  if (matches.length < 8) {
    return null;
  }
  
  const itemMatches = matches.slice(-8);
  const firstMatchIndex = itemMatches[0].index;
  const headerPart = line.substring(0, firstMatchIndex).trim();
  
  const firstSpaceIndex = headerPart.search(/\s/);
  let code = '';
  let description = '';
  if (firstSpaceIndex === -1) {
    code = headerPart;
  } else {
    code = headerPart.substring(0, firstSpaceIndex).trim();
    description = headerPart.substring(firstSpaceIndex).trim();
  }
  
  description = description.replace(/^[\s\t\-,]+|[\s\t\-,]+$/g, '').trim();
  
  if (!code || code.toLowerCase().includes('total') || code.toLowerCase().includes('sub')) {
    return null;
  }
  
  let qtyOrd = itemMatches[0][0];
  let qtyBonif = itemMatches[1][0];
  const iva = itemMatches[2][0];
  const total = itemMatches[3][0];
  const dcto1 = itemMatches[4][0];
  const subtotal = itemMatches[5][0];
  const costoListaUnit = itemMatches[6][0];
  const dcto2 = itemMatches[7][0];
  
  // Auto-corrección matemática de cantidades pegadas
  const qtyOrdVal = parseSpanishFloat(qtyOrd);
  const qtyBonifVal = parseSpanishFloat(qtyBonif);
  const subtotalVal = parseSpanishFloat(subtotal);
  const costoListaUnitVal = parseSpanishFloat(costoListaUnit);
  
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

/**
 * Convierte un mes textual en español a su número de dos dígitos.
 */
function parseSpanishMonth(monthStr) {
  const months = {
    ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
    jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12'
  };
  const normalized = monthStr.toLowerCase().replace(/[\.\s]/g, '').slice(0, 3);
  return months[normalized] || '01';
}

/**
 * Extrae la fecha de emisión del PDF y la formatea como MM/YY.
 */
function extractDateCode(text) {
  // Buscar formatos del tipo 08/jun./2026 o 08/jun/2026
  const textDateRegex = /\b(\d{2})\/([a-zA-Z\.\s]+)\/(\d{4})\b/;
  const textMatch = text.match(textDateRegex);
  if (textMatch) {
    const month = parseSpanishMonth(textMatch[2]);
    const yearShort = textMatch[3].slice(-2);
    return `${month}/${yearShort}`;
  }

  // Buscar formato puramente numérico 04/06/2026
  const numDateRegex = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
  const numMatch = text.match(numDateRegex);
  if (numMatch) {
    const month = numMatch[2];
    const yearShort = numMatch[3].slice(-2);
    return `${month}/${yearShort}`;
  }

  // Retornar mes/año actual como fallback
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const y = String(d.getFullYear()).slice(-2);
  return `${m}/${y}`;
}

/**
 * Extrae el número de factura o nota de entrega.
 */
function extractInvoiceNum(text) {
  // Buscar #77268 o #00112744
  const hashMatch = text.match(/#(\d+)/);
  if (hashMatch) {
    return hashMatch[1];
  }
  // Buscar NOTA DE ENTREGA: 00002426
  const entregaMatch = text.match(/NOTA\s+DE\s+ENTREGA:\s*(\d+)/i);
  if (entregaMatch) {
    return entregaMatch[1];
  }
  return 'S/N';
}

/**
 * Extrae el primer RIF del proveedor en el documento.
 */
function extractProviderRif(text) {
  // Ejemplo: J303261205 o J-30326120-5
  const rifMatch = text.match(/\bJ-?\d{8}-?\d\b/i);
  if (rifMatch) {
    // Normalizar a mayúsculas y sin guiones
    return rifMatch[0].toUpperCase().replace(/-/g, '');
  }
  return 'DESCONOCIDO';
}

// --- IPC HANDLERS ---

// 1. Cargar y parsear PDF
ipcMain.handle('parse-pdf', async (event, filePath) => {
  let parser = null;
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('El archivo no existe en la ruta provista.');
    }

    const dataBuffer = fs.readFileSync(filePath);
    parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();

    const text = data.text;
    const lines = text.split('\n');
    const items = [];

    for (const line of lines) {
      const parsedItem = parseLine(line);
      if (parsedItem) {
        items.push(parsedItem);
      }
    }

    const dateCode = extractDateCode(text);
    const invoiceNum = extractInvoiceNum(text);
    const providerRif = extractProviderRif(text);

    return {
      success: true,
      data: {
        invoiceNum,
        dateCode,
        providerRif,
        items
      }
    };
  } catch (err) {
    console.error('Error parseando PDF:', err);
    return {
      success: false,
      error: err.message
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

// 3. Imprimir etiquetas
ipcMain.handle('print-labels', async (event, labels, printerName) => {
  return new Promise((resolve) => {
    let printWindow = null;
    let hasFinished = false;

    // Crear ventana invisible
    printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      }
    });

    printWindow.loadFile(path.join(__dirname, 'print.html'));

    printWindow.webContents.on('did-finish-load', () => {
      // Mandar las etiquetas a la ventana de impresión
      printWindow.webContents.send('print-data', labels);
    });

    // Manejador temporal una sola vez para realizar la impresión cuando la ventana esté lista
    ipcMain.once('ready-to-print', async () => {
      if (hasFinished) return;
      try {
        const printOptions = {
          silent: true,
          margins: { marginType: 'none' },
          pageSize: { width: 55000, height: 40000 } // 55mm x 40mm en micrones (55,000 x 40,000)
        };

        if (printerName && printerName !== 'Default') {
          printOptions.deviceName = printerName;
        }

        printWindow.webContents.print(printOptions, (success, failureReason) => {
          hasFinished = true;
          if (printWindow) {
            printWindow.destroy();
            printWindow = null;
          }

          if (success) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: failureReason || 'Error desconocido en driver de impresión.' });
          }
        });
      } catch (err) {
        hasFinished = true;
        if (printWindow) {
          printWindow.destroy();
          printWindow = null;
        }
        resolve({ success: false, error: err.message });
      }
    });

    // Timeout de seguridad por si algo falla al cargar print.html o renderizar
    setTimeout(() => {
      if (!hasFinished) {
        hasFinished = true;
        if (printWindow) {
          printWindow.destroy();
          printWindow = null;
        }
        resolve({ success: false, error: 'Tiempo de espera agotado al renderizar la plantilla de impresión.' });
      }
    }, 10000);
  });
});
