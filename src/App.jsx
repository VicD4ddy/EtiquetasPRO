import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import TopBar from './components/TopBar';
import Table from './components/Table';
import PreviewModal from './components/PreviewModal';
import HistoryView from './components/HistoryView';
import ManualLabelView from './components/ManualLabelView';
import ProvidersModal from './components/ProvidersModal';
import BackupModal from './components/BackupModal';
import { calculateCostUSD, encodeLUCHAREMOS } from './utils/encoder';

function normalizeRif(rif) {
  return String(rif || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

export default function App() {
  const [tasaBCV, setTasaBCV] = useState(() => {
    return parseFloat(localStorage.getItem('tasa_bcv')) || 0;
  });
  const [printers, setPrinters] = useState([]);
  const [isRefreshingPrinters, setIsRefreshingPrinters] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState(() => {
    return localStorage.getItem('selected_printer') || 'Default';
  });

  const [isLoading, setIsLoading] = useState(false);
  const [printProgress, setPrintProgress] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [currentFileName, setCurrentFileName] = useState('');

  const [selectedItems, setSelectedItems] = useState([]);
  const [printQuantities, setPrintQuantities] = useState({});
  const [providerCode, setProviderCode] = useState('');
  const [printStatus, setPrintStatus] = useState({
    show: false,
    success: false,
    message: '',
    retryPayload: null
  });

  // Proveedores persistentes en disco (userData)
  const [registeredProviders, setRegisteredProviders] = useState([]);
  const [rifMap, setRifMap] = useState({});
  const [isProvidersModalOpen, setIsProvidersModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Modal rápido de registro desde barra de factura
  const [isRegisterProviderOpen, setIsRegisterProviderOpen] = useState(false);
  const [newProvName, setNewProvName] = useState('');
  const [newProvCode, setNewProvCode] = useState('');
  const [quickProvError, setQuickProvError] = useState('');

  // Buscador de proveedores en barra de factura
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  // Previsualización y diagnóstico
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewLabel, setPreviewLabel] = useState(null);
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);

  // Pestañas, historial y BCV automático
  const [activeTab, setActiveTab] = useState('invoice');
  const [history, setHistory] = useState([]);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [bcvMeta, setBcvMeta] = useState({
    loading: false,
    officialRate: 0,
    rateDate: '',
    fetchedAt: '',
    source: '',
    isCachedOffline: false,
    offlineWarning: '',
    isManualOverride: false,
    error: ''
  });

  const notify = useCallback((message, type = 'info', extra = {}) => {
    setPrintStatus({
      show: true,
      success: type === 'success',
      message,
      retryPayload: extra.retryPayload || null
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('tasa_bcv', tasaBCV.toString());
  }, [tasaBCV]);

  useEffect(() => {
    localStorage.setItem('selected_printer', selectedPrinter);
  }, [selectedPrinter]);

  const handleFetchBcvRate = useCallback(async () => {
    if (!window.api || !window.api.fetchBcvRate) return;
    setBcvMeta(prev => ({ ...prev, loading: true, error: '' }));

    const res = await window.api.fetchBcvRate();
    if (res && res.success && res.data) {
      setTasaBCV(res.data.rate);
      setBcvMeta({
        loading: false,
        officialRate: res.data.rate,
        rateDate: res.data.rateDate || '',
        fetchedAt: res.data.fetchedAt || '',
        source: res.data.source || 'BCV',
        isCachedOffline: Boolean(res.cached),
        offlineWarning: res.offlineWarning || '',
        isManualOverride: false,
        error: ''
      });
    } else {
      setBcvMeta(prev => ({
        ...prev,
        loading: false,
        error: (res && res.error) || 'No se pudo consultar la tasa BCV.'
      }));
    }
  }, []);

  const handleManualTasaChange = (newValue) => {
    const numVal = Number.isFinite(newValue) ? newValue : 0;
    setTasaBCV(numVal);
    setBcvMeta(prev => ({
      ...prev,
      isManualOverride: prev.officialRate > 0 && Math.abs(numVal - prev.officialRate) > 0.001
    }));
  };

  const fetchPrintersList = useCallback(async (showFeedback = false) => {
    if (!window.api || !window.api.getPrinters) return;
    setIsRefreshingPrinters(true);
    try {
      const list = await window.api.getPrinters();
      setPrinters(list || []);
      if (showFeedback) {
        notify(`Lista de impresoras actualizada (${(list || []).length} detectadas).`, 'success');
      }
    } finally {
      setIsRefreshingPrinters(false);
    }
  }, [notify]);

  // Carga inicial: impresoras, proveedores (con migración desde localStorage), historial, BCV y listener de progreso
  useEffect(() => {
    const initProviders = async () => {
      if (!window.api) return;
      const alreadyMigrated = localStorage.getItem('providers_migrated_v1');
      if (!alreadyMigrated && window.api.migrateProviders) {
        let legacyProviders = [];
        let legacyRifMap = {};
        try {
          legacyProviders = JSON.parse(localStorage.getItem('registered_providers') || '[]');
        } catch {
          legacyProviders = [];
        }
        try {
          legacyRifMap = JSON.parse(localStorage.getItem('rif_to_prov_code') || '{}');
        } catch {
          legacyRifMap = {};
        }
        const migRes = await window.api.migrateProviders({ legacyProviders, legacyRifMap });
        if (migRes && migRes.success && migRes.data) {
          setRegisteredProviders(migRes.data.providers || []);
          setRifMap(migRes.data.rifMap || {});
          localStorage.setItem('providers_migrated_v1', '1');
        }
      } else if (window.api.getProviders) {
        const provRes = await window.api.getProviders();
        if (provRes && provRes.success && provRes.data) {
          setRegisteredProviders(provRes.data.providers || []);
          setRifMap(provRes.data.rifMap || {});
        }
      }
    };

    const fetchInitialHistory = async () => {
      if (window.api && window.api.getHistory) {
        const res = await window.api.getHistory();
        if (res && res.success && Array.isArray(res.data)) {
          setHistory(res.data);
        }
      }
    };

    fetchPrintersList(false);
    initProviders();
    fetchInitialHistory();
    handleFetchBcvRate();

    let unsubscribe = null;
    if (window.api && window.api.onPrintProgress) {
      unsubscribe = window.api.onPrintProgress((progress) => {
        setPrintProgress(progress);
      });
    }
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [fetchPrintersList, handleFetchBcvRate]);

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setProviderSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedProv = registeredProviders.find(p => p.code === providerCode);
  const selectedProvName = selectedProv ? `${selectedProv.name} (${selectedProv.code})` : '';
  const filteredProviders = registeredProviders.filter(p => {
    const query = providerSearchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      p.code.toLowerCase().includes(query)
    );
  });

  // Procesar un PDF dado su path absoluto
  const processPdfPath = async (filePath, fileName) => {
    if (!window.api || !window.api.parsePDF) {
      notify('Error: Puente IPC de Electron no disponible.', 'error');
      return;
    }
    if (!filePath) {
      notify('No se pudo obtener la ruta local del archivo PDF.', 'error');
      return;
    }

    setIsLoading(true);
    setActiveTab('invoice');
    setCurrentFileName(fileName);
    setPrintStatus({ show: false, success: false, message: '', retryPayload: null });

    const response = await window.api.parsePDF(filePath);
    setIsLoading(false);

    if (response.success) {
      const data = response.data;
      const initialQuantities = {};
      const normalizedItems = (data.items || []).map((item, idx) => {
        const id = item.id ?? `item-${idx}`;
        const qtyOrdVal = Math.round(parseFloat(item.qtyOrd.replace(/\./g, '').replace(',', '.'))) || 0;
        const qtyBonifVal = Math.round(parseFloat(item.qtyBonif.replace(/\./g, '').replace(',', '.'))) || 0;
        const totalUnits = qtyOrdVal + qtyBonifVal;

        const descLower = (item.description || '').toLowerCase();
        const normalizedDesc = descLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const isPackEligible =
          (normalizedDesc.includes('bujia') || normalizedDesc.includes('taquete')) &&
          !normalizedDesc.includes('cable');
        const packMode = isPackEligible ? 'pack4' : 'unit';

        initialQuantities[id] = packMode === 'pack4' ? Math.ceil(totalUnits / 4) : totalUnits;

        return {
          ...item,
          id,
          totalUnits,
          isPackEligible,
          packMode
        };
      });

      setInvoiceData({ ...data, items: normalizedItems });
      setSelectedItems(normalizedItems.map(item => item.id));
      setPrintQuantities(initialQuantities);

      const normRif = normalizeRif(data.providerRif);
      if (normRif && rifMap[normRif]) {
        setProviderCode(rifMap[normRif]);
      } else {
        setProviderCode('');
      }
    } else {
      notify(`Error al procesar el archivo: ${response.error}`, 'error');
      setCurrentFileName('');
      setInvoiceData(null);
    }
  };

  const handleFileSelect = async (file) => {
    const filePath = window.api && window.api.getFilePath ? window.api.getFilePath(file) : file.path;
    await processPdfPath(filePath, file.name);
  };

  const handleBrowsePdf = async () => {
    if (!window.api || !window.api.selectPdfDialog) return;
    const res = await window.api.selectPdfDialog();
    if (res && !res.canceled && res.filePath) {
      await processPdfPath(res.filePath, res.fileName);
    }
  };

  const updateRifCode = async (rif, code) => {
    const normRif = normalizeRif(rif);
    if (!normRif || normRif === 'DESCONOCIDO') return;
    if (window.api && window.api.setRifAssociation) {
      const res = await window.api.setRifAssociation(normRif, code);
      if (res && res.success && res.data) {
        setRegisteredProviders(res.data.providers || []);
        setRifMap(res.data.rifMap || {});
      }
    }
  };

  const handleProviderCodeChange = (e) => {
    const code = e.target.value;
    setProviderCode(code);
    if (invoiceData && invoiceData.providerRif) {
      updateRifCode(invoiceData.providerRif, code);
    }
  };

  const handlePreview = (item) => {
    const costUSD = calculateCostUSD(item.costoListaUnit, tasaBCV);
    const cipherCode = encodeLUCHAREMOS(costUSD);

    setPreviewLabel({
      code: item.code,
      description: item.description,
      cipherCode,
      providerCode: providerCode || '00000',
      dateCode: invoiceData ? invoiceData.dateCode : '00/00'
    });
    setIsPreviewOpen(true);
  };

  const handleUpdateItem = (id, field, value) => {
    setInvoiceData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item =>
          item.id === id
            ? { ...item, [field]: value, needsReview: false, warning: '' }
            : item
        )
      };
    });
  };

  const handleTogglePackMode = (id) => {
    setInvoiceData(prev => {
      if (!prev) return prev;
      let nextQty = null;
      const nextItems = prev.items.map(item => {
        if (item.id !== id) return item;
        const nextMode = item.packMode === 'pack4' ? 'unit' : 'pack4';
        nextQty = nextMode === 'pack4' ? Math.ceil(item.totalUnits / 4) : item.totalUnits;
        return { ...item, packMode: nextMode };
      });
      if (nextQty !== null) {
        setPrintQuantities(q => ({ ...q, [id]: nextQty }));
      }
      return { ...prev, items: nextItems };
    });
  };

  const handleSetAllOneLabel = () => {
    if (!invoiceData) return;
    const nextQ = {};
    invoiceData.items.forEach(item => {
      nextQ[item.id] = 1;
    });
    setPrintQuantities(nextQ);
  };

  const handleRestoreInvoiceQuantities = () => {
    if (!invoiceData) return;
    const nextQ = {};
    invoiceData.items.forEach(item => {
      nextQ[item.id] = item.packMode === 'pack4' ? Math.ceil(item.totalUnits / 4) : item.totalUnits;
    });
    setPrintQuantities(nextQ);
  };

  const handleCopyDiagnostic = async () => {
    if (!invoiceData || !invoiceData.diagnostic) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(invoiceData.diagnostic, null, 2));
      setDiagnosticCopied(true);
      setTimeout(() => setDiagnosticCopied(false), 2500);
    } catch (err) {
      console.error('Error copiando diagnóstico:', err);
      notify('No se pudo copiar el diagnóstico al portapapeles.', 'error');
    }
  };

  const checkPrinterAvailable = () => {
    const printerExists = selectedPrinter === 'Default' || printers.some(p => p.name === selectedPrinter);
    if (printers.length === 0 || !printerExists) {
      notify('No se detecta impresora', 'error');
      return false;
    }
    return true;
  };

  // Helper centralizado de envío a impresora con progreso, reintento parcial y registro en historial
  const dispatchPrintJob = async ({ labelsToPrint, batchMeta, saveHistory = true, successLabel }) => {
    if (!checkPrinterAvailable()) return false;

    setIsLoading(true);
    setPrintProgress({
      currentChunk: 1,
      totalChunks: Math.max(1, Math.ceil(labelsToPrint.length / 40)),
      sentLabels: 0,
      totalLabels: labelsToPrint.length
    });
    setPrintStatus({ show: false, success: false, message: '', retryPayload: null });

    const result = await window.api.printLabels(labelsToPrint, selectedPrinter);
    setIsLoading(false);
    setPrintProgress(null);

    if (result.success) {
      if (saveHistory && window.api && window.api.addHistoryBatch && batchMeta) {
        const histRes = await window.api.addHistoryBatch({
          ...batchMeta,
          printerName: selectedPrinter,
          totalLabels: labelsToPrint.length
        });
        if (histRes && histRes.success && histRes.data && Array.isArray(histRes.data.history)) {
          setHistory(histRes.data.history);
        }
      }
      notify(successLabel || `¡Impresión enviada con éxito! Se imprimieron ${labelsToPrint.length} etiquetas.`, 'success');
      return true;
    }

    const isNoPrinter = result.error && (
      result.error.toLowerCase().includes('no printer') ||
      result.error.toLowerCase().includes('not found') ||
      result.error.toLowerCase().includes('invalid device')
    );

    if (result.remainingLabels && result.remainingLabels.length > 0 && result.failedAtLabel) {
      const sentInfo = result.sentCount > 0
        ? `Se enviaron ${result.sentCount} de ${result.totalCount} etiquetas. Fallo en la etiqueta #${result.failedAtLabel}`
        : `Fallo al iniciar la impresión en la etiqueta #${result.failedAtLabel}`;
      notify(
        `${sentInfo}: ${isNoPrinter ? 'No se detecta impresora' : result.error}`,
        'error',
        {
          retryPayload: {
            remainingLabels: result.remainingLabels,
            failedAtLabel: result.failedAtLabel,
            totalCount: result.totalCount,
            batchMeta: batchMeta ? { ...batchMeta, isReprint: result.sentCount > 0 || batchMeta.isReprint } : null,
            saveHistory
          }
        }
      );
    } else {
      notify(isNoPrinter ? 'No se detecta impresora' : `Error al imprimir: ${result.error}`, 'error');
    }

    return false;
  };

  const handleRetryPartialPrint = async () => {
    const retry = printStatus.retryPayload;
    if (!retry || !retry.remainingLabels || retry.remainingLabels.length === 0) return;
    await dispatchPrintJob({
      labelsToPrint: retry.remainingLabels,
      batchMeta: retry.batchMeta,
      saveHistory: retry.saveHistory,
      successLabel: `¡Reintento completado! Se imprimieron las ${retry.remainingLabels.length} etiquetas restantes.`
    });
  };

  const totalLabelsToPrint = selectedItems.reduce((acc, id) => {
    return acc + (printQuantities[id] || 0);
  }, 0);

  const handlePrint = async () => {
    if (!invoiceData) return;
    if (tasaBCV <= 0) {
      notify('Por favor, ingrese una Tasa BCV válida antes de imprimir para poder calcular el cifrado.', 'error');
      return;
    }
    if (selectedItems.length === 0 || totalLabelsToPrint === 0) {
      notify('No hay etiquetas seleccionadas o la cantidad de etiquetas a imprimir es 0.', 'error');
      return;
    }

    const emptyCodeItems = invoiceData.items.filter(
      item => selectedItems.includes(item.id) && (printQuantities[item.id] || 0) > 0 && !item.code.trim()
    );
    if (emptyCodeItems.length > 0) {
      notify('Hay artículos seleccionados con el código vacío. Completa el código o desmarca esas filas antes de imprimir.', 'error');
      return;
    }

    const labelsToPrint = [];
    const historyItems = [];

    invoiceData.items.forEach(item => {
      if (selectedItems.includes(item.id)) {
        const qty = printQuantities[item.id] || 0;
        if (qty > 0) {
          const costUSD = calculateCostUSD(item.costoListaUnit, tasaBCV);
          const cipherCode = encodeLUCHAREMOS(costUSD);
          const cleanCode = item.code.trim();
          const cleanDesc = item.description.trim();
          const effProvCode = providerCode || '00000';

          historyItems.push({
            code: cleanCode,
            description: cleanDesc,
            costoListaUnit: item.costoListaUnit,
            costUSD,
            cipherCode,
            providerCode: effProvCode,
            dateCode: invoiceData.dateCode,
            quantity: qty
          });

          for (let i = 0; i < qty; i++) {
            labelsToPrint.push({
              code: cleanCode,
              description: cleanDesc,
              cipherCode,
              providerCode: effProvCode,
              dateCode: invoiceData.dateCode
            });
          }
        }
      }
    });

    await dispatchPrintJob({
      labelsToPrint,
      saveHistory: true,
      batchMeta: {
        invoiceNum: invoiceData.invoiceNum,
        dateCode: invoiceData.dateCode,
        providerRif: invoiceData.providerRif,
        providerCode: providerCode || '00000',
        providerName: selectedProv ? selectedProv.name : '',
        fileName: currentFileName,
        tasaBCV,
        isReprint: false,
        items: historyItems
      }
    });
  };

  const handlePrintTestLabel = async () => {
    const d = new Date();
    const mmYY = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
    await dispatchPrintJob({
      labelsToPrint: [
        {
          code: 'TEST-55X40',
          description: 'ETIQUETA DE PRUEBA CALIBRACION 55x40MM',
          cipherCode: 'SOTOMAYOR',
          providerCode: '00000',
          dateCode: mmYY
        }
      ],
      saveHistory: false,
      successLabel: 'Etiqueta de prueba enviada a la impresora.'
    });
  };

  const handlePrintManualEntries = async (entries) => {
    if (!entries || entries.length === 0) return;
    const labelsToPrint = [];
    const historyItems = [];

    entries.forEach((entry) => {
      const qty = Math.max(1, parseInt(entry.quantity, 10) || 1);
      historyItems.push({
        code: entry.code,
        description: entry.description,
        costoListaUnit: entry.costoListaUnit || '',
        costUSD: entry.costUSD || 0,
        cipherCode: entry.cipherCode,
        providerCode: entry.providerCode || '00000',
        dateCode: entry.dateCode || '00/00',
        quantity: qty
      });

      for (let i = 0; i < qty; i++) {
        labelsToPrint.push({
          code: entry.code,
          description: entry.description,
          cipherCode: entry.cipherCode,
          providerCode: entry.providerCode || '00000',
          dateCode: entry.dateCode || '00/00'
        });
      }
    });

    const first = entries[0];
    await dispatchPrintJob({
      labelsToPrint,
      saveHistory: true,
      batchMeta: {
        invoiceNum: 'MANUAL',
        dateCode: first.dateCode || '00/00',
        providerRif: 'MANUAL',
        providerCode: first.providerCode || '00000',
        providerName: first.providerName || 'Etiqueta Manual',
        fileName: 'Etiqueta Manual',
        tasaBCV,
        isReprint: false,
        items: historyItems
      }
    });
  };

  const handleClear = () => {
    setInvoiceData(null);
    setCurrentFileName('');
    setSelectedItems([]);
    setPrintQuantities({});
    setProviderCode('');
    setPrintStatus({ show: false, success: false, message: '', retryPayload: null });
  };

  // Detectar impresiones previas de la factura actual
  const previousPrints = useMemo(() => {
    if (!invoiceData || history.length === 0) return [];
    const normInv = String(invoiceData.invoiceNum || '').trim();
    const normRif = String(invoiceData.providerRif || '').trim().toUpperCase();
    const normFile = String(currentFileName || '').trim();

    if (normInv && normInv !== 'S/N') {
      return history.filter((b) => {
        if (String(b.invoiceNum || '').trim() !== normInv) return false;
        const bRif = String(b.providerRif || '').trim().toUpperCase();
        if (normRif && normRif !== 'DESCONOCIDO' && bRif && bRif !== 'DESCONOCIDO') {
          return bRif === normRif;
        }
        return true;
      });
    }

    if (normFile) {
      return history.filter((b) => String(b.fileName || '').trim() === normFile);
    }

    return [];
  }, [invoiceData, history, currentFileName]);

  const handleReprintBatch = async (batch) => {
    const labelsToPrint = [];
    const historyItems = [];
    (batch.items || []).forEach((item) => {
      const qty = item.quantity || 0;
      if (qty > 0) {
        historyItems.push({ ...item });
        for (let i = 0; i < qty; i++) {
          labelsToPrint.push({
            code: item.code,
            description: item.description,
            cipherCode: item.cipherCode,
            providerCode: item.providerCode || batch.providerCode || '00000',
            dateCode: item.dateCode || batch.dateCode || '00/00'
          });
        }
      }
    });
    if (labelsToPrint.length === 0) return;

    await dispatchPrintJob({
      labelsToPrint,
      saveHistory: true,
      successLabel: `¡Reimpresión enviada con éxito! Se imprimieron ${labelsToPrint.length} etiquetas.`,
      batchMeta: {
        invoiceNum: batch.invoiceNum,
        dateCode: batch.dateCode,
        providerRif: batch.providerRif,
        providerCode: batch.providerCode,
        providerName: batch.providerName,
        fileName: batch.fileName,
        tasaBCV: batch.tasaBCV,
        isReprint: true,
        reprintFromBatchId: batch.id,
        items: historyItems
      }
    });
  };

  const handleReprintItem = async (batch, item, qty) => {
    const cleanQty = Math.max(1, parseInt(qty, 10) || 1);
    const labelsToPrint = [];
    for (let i = 0; i < cleanQty; i++) {
      labelsToPrint.push({
        code: item.code,
        description: item.description,
        cipherCode: item.cipherCode,
        providerCode: item.providerCode || batch.providerCode || '00000',
        dateCode: item.dateCode || batch.dateCode || '00/00'
      });
    }

    await dispatchPrintJob({
      labelsToPrint,
      saveHistory: true,
      successLabel: `¡Reimpresión enviada con éxito! Se imprimieron ${labelsToPrint.length} etiquetas.`,
      batchMeta: {
        invoiceNum: batch.invoiceNum,
        dateCode: batch.dateCode,
        providerRif: batch.providerRif,
        providerCode: batch.providerCode,
        providerName: batch.providerName,
        fileName: batch.fileName,
        tasaBCV: batch.tasaBCV,
        isReprint: true,
        reprintFromBatchId: batch.id,
        items: [{ ...item, quantity: cleanQty }]
      }
    });
  };

  const handlePreviewHistoryItem = (batch, item) => {
    setPreviewLabel({
      code: item.code,
      description: item.description,
      cipherCode: item.cipherCode,
      providerCode: item.providerCode || batch.providerCode || '00000',
      dateCode: item.dateCode || batch.dateCode || '00/00'
    });
    setIsPreviewOpen(true);
  };

  const handlePreviewManualItem = (entry) => {
    setPreviewLabel({
      code: entry.code,
      description: entry.description,
      cipherCode: entry.cipherCode,
      providerCode: entry.providerCode || '00000',
      dateCode: entry.dateCode || '00/00'
    });
    setIsPreviewOpen(true);
  };

  const handleDeleteBatch = async (batchId) => {
    if (!window.api || !window.api.deleteHistoryBatch) return;
    const res = await window.api.deleteHistoryBatch(batchId);
    if (res && res.success && Array.isArray(res.data)) {
      setHistory(res.data);
    }
  };

  const handleClearHistory = async () => {
    if (!window.api || !window.api.clearHistory) return;
    const res = await window.api.clearHistory();
    if (res && res.success && Array.isArray(res.data)) {
      setHistory(res.data);
      notify('Historial limpiado correctamente.', 'success');
    }
  };

  const handleExportCsv = async (batchesToExport) => {
    if (!window.api || !window.api.exportHistoryCsv) return;
    const res = await window.api.exportHistoryCsv(batchesToExport);
    if (res && res.success) {
      notify(`Historial exportado a CSV: ${res.filePath}`, 'success');
    } else if (res && !res.canceled && res.error) {
      notify(`Error exportando CSV: ${res.error}`, 'error');
    }
  };

  // Gestión de proveedores (modal completo + modal rápido)
  const handleSaveProvider = async (providerInput) => {
    if (!window.api || !window.api.saveProvider) return false;
    const res = await window.api.saveProvider(providerInput);
    if (res && res.success && res.data) {
      setRegisteredProviders(res.data.providers || []);
      setRifMap(res.data.rifMap || {});
      notify('Proveedor guardado correctamente.', 'success');
      return true;
    }
    notify(`Error guardando proveedor: ${(res && res.error) || 'Desconocido'}`, 'error');
    return false;
  };

  const handleDeleteProvider = async (providerId) => {
    if (!window.api || !window.api.deleteProvider) return;
    const res = await window.api.deleteProvider(providerId);
    if (res && res.success && res.data) {
      setRegisteredProviders(res.data.providers || []);
      setRifMap(res.data.rifMap || {});
    }
  };

  // Respaldo y restauración JSON
  const handleExportBackup = async () => {
    if (!window.api || !window.api.exportBackup) return;
    const res = await window.api.exportBackup();
    if (res && res.success) {
      setIsBackupModalOpen(false);
      notify(`Respaldo exportado con éxito: ${res.filePath}`, 'success');
    } else if (res && !res.canceled && res.error) {
      notify(`Error exportando respaldo: ${res.error}`, 'error');
    }
  };

  const handleImportBackup = async (mode) => {
    if (!window.api || !window.api.importBackup) return;
    const res = await window.api.importBackup(mode);
    if (res && res.success && res.data) {
      setRegisteredProviders(res.data.providers || []);
      setRifMap(res.data.rifMap || {});
      setHistory(res.data.history || []);
      setIsBackupModalOpen(false);
      const s = res.data.summary;
      notify(
        `Respaldo importado (${s.mode === 'replace' ? 'Reemplazo' : 'Fusión'}): ${s.providersCount} proveedores y ${s.historyCount} lotes.`,
        'success'
      );
    } else if (res && !res.canceled && res.error) {
      notify(`Error importando respaldo: ${res.error}`, 'error');
    }
  };

  const progressPct = printProgress && printProgress.totalLabels > 0
    ? Math.min(100, Math.round((printProgress.sentLabels / printProgress.totalLabels) * 100))
    : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900 text-slate-100 select-none">
      {/* Barra Superior */}
      <TopBar
        tasaBCV={tasaBCV}
        onManualTasaChange={handleManualTasaChange}
        bcvMeta={bcvMeta}
        onRefreshBcv={handleFetchBcvRate}
        printers={printers}
        selectedPrinter={selectedPrinter}
        setSelectedPrinter={setSelectedPrinter}
        onRefreshPrinters={() => fetchPrintersList(true)}
        isRefreshingPrinters={isRefreshingPrinters}
        onPrintTestLabel={handlePrintTestLabel}
        onFileSelect={handleFileSelect}
        onBrowsePdf={handleBrowsePdf}
        onNotify={notify}
        isLoading={isLoading}
        currentFileName={currentFileName}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        historyCount={history.length}
        onOpenProviders={() => setIsProvidersModalOpen(true)}
        onOpenBackup={() => setIsBackupModalOpen(true)}
      />

      {/* Progreso en vivo al imprimir sub-lotes */}
      {isLoading && printProgress && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-blue-200">
            <span>
              Imprimiendo sub-lote {printProgress.currentChunk} de {printProgress.totalChunks}...
            </span>
            <span className="font-mono tabular-nums">
              {printProgress.sentLabels} / {printProgress.totalLabels} etiquetas ({progressPct}%)
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Alertas / Notificaciones no bloqueantes */}
      {printStatus.show && (
        <div className={`mx-6 mt-3 p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 animate-fade-in ${
          printStatus.success
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-lg flex-shrink-0">{printStatus.success ? '✅' : '❌'}</span>
            <span className="text-xs sm:text-sm font-semibold">{printStatus.message}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {printStatus.retryPayload && (
              <button
                type="button"
                onClick={handleRetryPartialPrint}
                disabled={isLoading}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                🔄 Reintentar desde etiqueta #{printStatus.retryPayload.failedAtLabel} ({printStatus.retryPayload.remainingLabels.length} rest.)
              </button>
            )}
            <button
              type="button"
              onClick={() => setPrintStatus({ show: false, success: false, message: '', retryPayload: null })}
              className="text-slate-400 hover:text-white font-bold px-1 cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Contenido Principal según Pestaña Activa */}
      {activeTab === 'history' ? (
        <HistoryView
          history={history}
          searchQuery={historySearchQuery}
          setSearchQuery={setHistorySearchQuery}
          onReprintBatch={handleReprintBatch}
          onReprintItem={handleReprintItem}
          onPreviewItem={handlePreviewHistoryItem}
          onDeleteBatch={handleDeleteBatch}
          onClearHistory={handleClearHistory}
          onExportCsv={handleExportCsv}
          isPrinting={isLoading}
          onGoToInvoice={() => setActiveTab('invoice')}
        />
      ) : activeTab === 'manual' ? (
        <ManualLabelView
          tasaBCV={tasaBCV}
          registeredProviders={registeredProviders}
          onPreview={handlePreviewManualItem}
          onPrintImmediate={(entry) => handlePrintManualEntries([entry])}
          onPrintList={handlePrintManualEntries}
          isLoading={isLoading}
          onNotify={notify}
        />
      ) : !invoiceData ? (
        <div className="flex-1 flex flex-col justify-center items-center p-8 text-center text-slate-400">
          <div className="max-w-md p-8 rounded-2xl glass custom-shadow flex flex-col items-center">
            <div className="text-6xl mb-4 animate-bounce">🏷️</div>
            <h3 className="text-xl font-bold text-white mb-2">Comienza a Automatizar</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Verifica la Tasa BCV en la parte superior y arrastra tu factura de compra PDF.
              El sistema extraerá los códigos, calculará costos en USD y generará códigos comerciales LUCHAREMOS listos para imprimir.
            </p>
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-1">⚡ Lector PDF</span>
              <span>•</span>
              <span className="flex items-center gap-1">📐 Xprinter (55x40mm)</span>
              <span>•</span>
              <span className="flex items-center gap-1">🔒 Cifrado</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Fila de Datos del Proveedor y Factura */}
          <div className="relative z-30 w-full py-1.5 px-4 bg-slate-900/60 backdrop-blur-sm border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 select-none">
            <div className="flex items-center flex-wrap gap-2.5">
              <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700/40">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Factura:</span>
                <span className="text-xs font-extrabold text-slate-200 font-mono tabular-nums">#{invoiceData.invoiceNum}</span>
              </div>

              <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Fecha:</span>
                <span className="text-xs font-extrabold text-blue-300 font-mono tabular-nums">{invoiceData.dateCode}</span>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700/40">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">RIF Proveedor:</span>
                <span className="text-xs font-extrabold text-slate-200 font-mono">{invoiceData.providerRif}</span>
              </div>

              {invoiceData.items.some(i => i.needsReview) && (
                <div
                  className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30 text-amber-300"
                  title="Algunas filas tienen código o descripción dudosos; revísalas directamente en la tabla."
                >
                  <span className="text-[10px]">⚠️</span>
                  <span className="text-[11px] font-bold font-mono tabular-nums">
                    {invoiceData.items.filter(i => i.needsReview).length} por revisar
                  </span>
                </div>
              )}

              {invoiceData.diagnostic && (
                <button
                  type="button"
                  onClick={handleCopyDiagnostic}
                  title="Copiar estructura de columnas y coordenadas del PDF para diagnóstico"
                  className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold transition cursor-pointer ${
                    diagnosticCopied
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 hover:border-slate-600 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {diagnosticCopied ? '✓ Copiado' : 'Copiar diagnóstico'}
                </button>
              )}
            </div>

            {/* Selector y Registro de Proveedor */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <div className="relative flex items-center" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="px-2 py-0.5 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded text-[11px] text-slate-300 font-semibold outline-none transition cursor-pointer flex items-center justify-between gap-1.5 min-w-[130px] max-w-[180px] text-left"
                >
                  <span className="truncate">
                    {selectedProvName || 'Seleccionar Proveedor'}
                  </span>
                  <span className="text-[8px] text-slate-500 flex-shrink-0">▼</span>
                </button>

                {isDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-1.5 z-40 flex flex-col gap-1.5 animate-fade-in">
                    <input
                      type="text"
                      placeholder="Buscar proveedor..."
                      value={providerSearchQuery}
                      onChange={(e) => setProviderSearchQuery(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded text-xs text-white placeholder-slate-500 outline-none select-text"
                      autoFocus
                    />
                    <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5 pr-0.5 custom-scrollbar">
                      <button
                        type="button"
                        onClick={() => {
                          setProviderCode('');
                          if (invoiceData && invoiceData.providerRif) {
                            updateRifCode(invoiceData.providerRif, '');
                          }
                          setIsDropdownOpen(false);
                          setProviderSearchQuery('');
                        }}
                        className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-xs text-slate-400 hover:text-slate-200 transition"
                      >
                        -- Ninguno --
                      </button>

                      {filteredProviders.length === 0 ? (
                        <div className="text-[11px] text-slate-500 text-center py-2">
                          No hay coincidencias
                        </div>
                      ) : (
                        filteredProviders.map((p) => (
                          <button
                            key={p.id || p.code}
                            type="button"
                            onClick={() => {
                              setProviderCode(p.code);
                              if (invoiceData && invoiceData.providerRif) {
                                updateRifCode(invoiceData.providerRif, p.code);
                              }
                              setIsDropdownOpen(false);
                              setProviderSearchQuery('');
                            }}
                            className={`w-full text-left px-2 py-1 rounded transition flex items-center justify-between text-xs ${
                              providerCode === p.code
                                ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300 font-bold'
                                : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            <span className="truncate pr-2">{p.name}</span>
                            <span className="text-[10px] opacity-70 font-mono font-bold flex-shrink-0">{p.code}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setNewProvCode(providerCode);
                  setQuickProvError('');
                  setIsRegisterProviderOpen(true);
                }}
                className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded transition flex items-center gap-0.5 cursor-pointer shadow-md shadow-blue-600/10 hover:shadow-blue-600/20"
                title="Registrar nuevo proveedor con su código"
              >
                <span>+</span>
                <span>Registrar</span>
              </button>

              <div className="h-4 w-px bg-slate-800/80 mx-1 hidden sm:block"></div>

              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Código (Prov):
              </span>
              <input
                type="text"
                placeholder="Ej: 00071"
                value={providerCode}
                onChange={handleProviderCodeChange}
                className="w-16 px-1.5 py-0.5 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded text-xs text-white font-mono font-bold placeholder-slate-650 text-center outline-none select-text transition"
              />
            </div>
          </div>

          {/* Aviso si la factura ya tiene impresiones previas */}
          {previousPrints.length > 0 && (
            <div className="mx-6 mt-3 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span>⚠️</span>
                <span>
                  Esta factura ya fue impresa anteriormente (
                  <strong className="font-mono tabular-nums">{previousPrints.length}</strong>{' '}
                  {previousPrints.length === 1 ? 'vez' : 'veces'}, última el{' '}
                  <strong className="font-mono tabular-nums">
                    {new Date(previousPrints[0].printedAt).toLocaleString('es-VE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </strong>
                  ).
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistorySearchQuery(invoiceData.invoiceNum !== 'S/N' ? invoiceData.invoiceNum : currentFileName);
                  setActiveTab('history');
                }}
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-[11px] font-bold text-amber-200 transition cursor-pointer flex-shrink-0"
              >
                Ver en historial
              </button>
            </div>
          )}

          {/* Tabla de Artículos */}
          <Table
            items={invoiceData.items}
            tasaBCV={tasaBCV}
            selectedItems={selectedItems}
            setSelectedItems={setSelectedItems}
            printQuantities={printQuantities}
            setPrintQuantities={setPrintQuantities}
            calculateCostUSD={calculateCostUSD}
            encodeLUCHAREMOS={encodeLUCHAREMOS}
            onPreview={handlePreview}
            onUpdateItem={handleUpdateItem}
            onTogglePackMode={handleTogglePackMode}
            onSetAllOneLabel={handleSetAllOneLabel}
            onRestoreInvoiceQuantities={handleRestoreInvoiceQuantities}
          />

          {/* Barra Inferior de Impresión */}
          <div className="py-3 px-6 bg-slate-950 border-t border-slate-800 flex justify-between items-center gap-4">
            <div className="text-slate-400">
              <span className="text-sm font-semibold">Repuestos Seleccionados: </span>
              <span className="text-white font-mono tabular-nums font-bold">{selectedItems.length}</span>
              <span className="mx-2 text-slate-600">|</span>
              <span className="text-sm font-semibold">Total Etiquetas a Imprimir: </span>
              <span className="text-blue-400 font-mono tabular-nums font-extrabold text-lg">{totalLabelsToPrint}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClear}
                disabled={isLoading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Limpiar Factura
              </button>

              <button
                type="button"
                onClick={handlePrint}
                disabled={isLoading || tasaBCV <= 0 || selectedItems.length === 0 || totalLabelsToPrint === 0}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white disabled:text-slate-500 font-bold text-sm rounded-xl transition cursor-pointer shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/20 disabled:shadow-none animate-pulse-subtle disabled:animate-none disabled:cursor-not-allowed"
              >
                <span>🖨️</span>
                <span className="font-mono tabular-nums">Imprimir {totalLabelsToPrint} Etiquetas</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Previsualización */}
      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        label={previewLabel}
      />

      {/* Modal Gestor Completo de Proveedores */}
      <ProvidersModal
        isOpen={isProvidersModalOpen}
        onClose={() => setIsProvidersModalOpen(false)}
        providers={registeredProviders}
        onSaveProvider={handleSaveProvider}
        onDeleteProvider={handleDeleteProvider}
      />

      {/* Modal de Respaldo / Restauración JSON */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        providersCount={registeredProviders.length}
        rifCount={Object.keys(rifMap).length}
        historyCount={history.length}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        isBusy={isLoading}
      />

      {/* Modal Rápido Registrar Proveedor desde barra de factura */}
      {isRegisterProviderOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex justify-center items-center z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-[380px] shadow-2xl animate-scale-up">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <span>🏢</span> Registrar Nuevo Proveedor
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Nombre del Proveedor
                </label>
                <input
                  type="text"
                  placeholder="Ej: Repuestos Sotomayor, C.A."
                  value={newProvName}
                  onChange={(e) => setNewProvName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-white font-semibold outline-none select-text focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Código de Proveedor
                </label>
                <input
                  type="text"
                  placeholder="Ej: 00071"
                  value={newProvCode}
                  onChange={(e) => setNewProvCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-white font-mono font-bold outline-none select-text focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {quickProvError && (
                <div className="text-xs font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-1.5">
                  {quickProvError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setIsRegisterProviderOpen(false);
                  setNewProvName('');
                  setNewProvCode('');
                  setQuickProvError('');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!newProvName.trim() || !newProvCode.trim()) {
                    setQuickProvError('Por favor, rellene nombre y código.');
                    return;
                  }
                  const duplicate = registeredProviders.find(
                    p => p.code.toLowerCase() === newProvCode.trim().toLowerCase() ||
                         p.name.toLowerCase() === newProvName.trim().toLowerCase()
                  );
                  if (duplicate) {
                    setQuickProvError(`Ya existe "${duplicate.name}" (${duplicate.code}). Edítalo en 🏢 Proveedores.`);
                    return;
                  }

                  const ok = await handleSaveProvider({
                    name: newProvName.trim(),
                    code: newProvCode.trim(),
                    rif: invoiceData ? invoiceData.providerRif : ''
                  });
                  if (ok) {
                    setProviderCode(newProvCode.trim());
                    setIsRegisterProviderOpen(false);
                    setNewProvName('');
                    setNewProvCode('');
                    setQuickProvError('');
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-lg shadow-blue-600/10 hover:shadow-blue-600/20"
              >
                Guardar Proveedor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
