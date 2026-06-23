import React, { useState, useEffect, useRef } from 'react';
import TopBar from './components/TopBar';
import Table from './components/Table';
import PreviewModal from './components/PreviewModal';
import { calculateCostUSD, encodeLUCHAREMOS } from './utils/encoder';

export default function App() {
  const [tasaBCV, setTasaBCV] = useState(() => {
    return parseFloat(localStorage.getItem('tasa_bcv')) || 0;
  });
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState(() => {
    return localStorage.getItem('selected_printer') || 'Default';
  });

  const [isLoading, setIsLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [currentFileName, setCurrentFileName] = useState('');

  const [selectedItems, setSelectedItems] = useState([]);
  const [printQuantities, setPrintQuantities] = useState({});
  const [providerCode, setProviderCode] = useState('');
  const [printStatus, setPrintStatus] = useState({ show: false, success: false, message: '' });

  // Estados para proveedores registrados
  const [registeredProviders, setRegisteredProviders] = useState(() => {
    return JSON.parse(localStorage.getItem('registered_providers') || '[]');
  });
  const [isRegisterProviderOpen, setIsRegisterProviderOpen] = useState(false);
  const [newProvName, setNewProvName] = useState('');
  const [newProvCode, setNewProvCode] = useState('');

  // Estados para el buscador de proveedores
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  // Estados para la previsualización de etiquetas
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewLabel, setPreviewLabel] = useState(null);

  // Guardar Tasa BCV y Selección de Impresora
  useEffect(() => {
    localStorage.setItem('tasa_bcv', tasaBCV.toString());
  }, [tasaBCV]);

  useEffect(() => {
    localStorage.setItem('selected_printer', selectedPrinter);
  }, [selectedPrinter]);

  // Obtener impresoras del sistema al arrancar
  useEffect(() => {
    const fetchPrinters = async () => {
      if (window.api && window.api.getPrinters) {
        const list = await window.api.getPrinters();
        setPrinters(list);
      }
    };
    fetchPrinters();
  }, []);

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setProviderSearchQuery('');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Auxiliares para filtrar proveedores y mostrar el seleccionado
  const selectedProv = registeredProviders.find(p => p.code === providerCode);
  const selectedProvName = selectedProv ? `${selectedProv.name} (${selectedProv.code})` : '';
  const filteredProviders = registeredProviders.filter(p => {
    const query = providerSearchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      p.code.toLowerCase().includes(query)
    );
  });

  // Carga e inicializa el PDF parseado
  const handleFileSelect = async (file) => {
    if (!window.api || !window.api.parsePDF) {
      alert("Error: Puente IPC de Electron no disponible.");
      return;
    }

    setIsLoading(true);
    setCurrentFileName(file.name);
    setPrintStatus({ show: false, success: false, message: '' });

    const response = await window.api.parsePDF(file.path);
    setIsLoading(false);

    if (response.success) {
      const data = response.data;
      setInvoiceData(data);

      // Autoseleccionar todos los ítems por defecto
      const codes = data.items.map(item => item.code);
      setSelectedItems(codes);

      // Inicializar cantidades de etiquetas al valor de la factura (redondeando a entero)
      // Si el producto es bujía o taquete, se asigna 1 etiqueta por cada 4 unidades.
      const initialQuantities = {};
      data.items.forEach(item => {
        const qtyOrdVal = Math.round(parseFloat(item.qtyOrd.replace(/\./g, '').replace(',', '.'))) || 0;
        const qtyBonifVal = Math.round(parseFloat(item.qtyBonif.replace(/\./g, '').replace(',', '.'))) || 0;
        const totalUnits = qtyOrdVal + qtyBonifVal;

        // Normalizar descripción para búsqueda insensible a acentos y mayúsculas
        const descLower = item.description.toLowerCase();
        const normalizedDesc = descLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        // Es paquete de 4 si contiene 'bujia' o 'taquete', pero NO contiene 'cable'
        const isPackOf4 = (normalizedDesc.includes('bujia') || normalizedDesc.includes('taquete')) && !normalizedDesc.includes('cable');

        if (isPackOf4) {
          initialQuantities[item.code] = Math.ceil(totalUnits / 4);
        } else {
          initialQuantities[item.code] = totalUnits;
        }
      });
      setPrintQuantities(initialQuantities);

      // Buscar si tenemos el código de proveedor guardado para este RIF
      const savedProviders = JSON.parse(localStorage.getItem('rif_to_prov_code') || '{}');
      if (savedProviders[data.providerRif]) {
        setProviderCode(savedProviders[data.providerRif]);
      } else {
        setProviderCode('');
      }
    } else {
      alert(`Error al procesar el archivo: ${response.error}`);
      setCurrentFileName('');
      setInvoiceData(null);
    }
  };

  // Manejar el cambio en el código del proveedor (auto-guardado)
  const handleProviderCodeChange = (e) => {
    const code = e.target.value;
    setProviderCode(code);

    if (invoiceData && invoiceData.providerRif) {
      const savedProviders = JSON.parse(localStorage.getItem('rif_to_prov_code') || '{}');
      savedProviders[invoiceData.providerRif] = code;
      localStorage.setItem('rif_to_prov_code', JSON.stringify(savedProviders));
    }
  };

  // Activar la previsualización para un repuesto específico
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

  // Calcular cantidad total de etiquetas a imprimir
  const totalLabelsToPrint = selectedItems.reduce((acc, code) => {
    return acc + (printQuantities[code] || 0);
  }, 0);

  // Ejecutar impresión
  const handlePrint = async () => {
    if (!invoiceData) return;
    if (tasaBCV <= 0) {
      alert("Por favor, ingrese una Tasa BCV válida antes de imprimir para poder calcular el cifrado.");
      return;
    }
    if (selectedItems.length === 0 || totalLabelsToPrint === 0) {
      alert("No hay etiquetas seleccionadas o la cantidad de etiquetas a imprimir es 0.");
      return;
    }

    // --- Validación de Detección de Impresora ---
    // Comprobar si hay impresoras conectadas en el sistema
    const printerExists = selectedPrinter === 'Default' || printers.some(p => p.name === selectedPrinter);
    if (printers.length === 0 || !printerExists) {
      setPrintStatus({
        show: true,
        success: false,
        message: 'No se detecta impresora'
      });
      return;
    }

    const labelsToPrint = [];

    // Recopilar filas seleccionadas y expandirlas
    invoiceData.items.forEach(item => {
      if (selectedItems.includes(item.code)) {
        const qty = printQuantities[item.code] || 0;
        if (qty > 0) {
          const costUSD = calculateCostUSD(item.costoListaUnit, tasaBCV);
          const cipherCode = encodeLUCHAREMOS(costUSD);

          // Agregar el ítem n veces
          for (let i = 0; i < qty; i++) {
            labelsToPrint.push({
              code: item.code,
              description: item.description,
              cipherCode,
              providerCode: providerCode || '00000',
              dateCode: invoiceData.dateCode
            });
          }
        }
      }
    });

    setIsLoading(true);
    setPrintStatus({ show: false, success: false, message: '' });

    const result = await window.api.printLabels(labelsToPrint, selectedPrinter);
    setIsLoading(false);

    if (result.success) {
      setPrintStatus({
        show: true,
        success: true,
        message: `¡Impresión enviada con éxito! Se imprimieron ${labelsToPrint.length} etiquetas.`
      });
    } else {
      // Capturar si el driver indica que no hay impresora
      const isNoPrinter = result.error && (
        result.error.toLowerCase().includes('no printer') || 
        result.error.toLowerCase().includes('not found') ||
        result.error.toLowerCase().includes('invalid device')
      );

      setPrintStatus({
        show: true,
        success: false,
        message: isNoPrinter ? 'No se detecta impresora' : `Error al imprimir: ${result.error}`
      });
    }
  };

  const handleClear = () => {
    setInvoiceData(null);
    setCurrentFileName('');
    setSelectedItems([]);
    setPrintQuantities({});
    setProviderCode('');
    setPrintStatus({ show: false, success: false, message: '' });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900 text-slate-100 select-none">
      {/* Barra Superior */}
      <TopBar
        tasaBCV={tasaBCV}
        setTasaBCV={setTasaBCV}
        printers={printers}
        selectedPrinter={selectedPrinter}
        setSelectedPrinter={setSelectedPrinter}
        onFileSelect={handleFileSelect}
        isLoading={isLoading}
        currentFileName={currentFileName}
      />

      {/* Alertas de Impresión */}
      {printStatus.show && (
        <div className={`mx-6 mt-4 p-4 rounded-xl border flex items-center justify-between animate-fade-in ${
          printStatus.success
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{printStatus.success ? '✅' : '❌'}</span>
            <span className="text-sm font-semibold">{printStatus.message}</span>
          </div>
          <button
            onClick={() => setPrintStatus({ ...printStatus, show: false })}
            className="text-slate-400 hover:text-white font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Contenido Principal */}
      {!invoiceData ? (
        <div className="flex-1 flex flex-col justify-center items-center p-8 text-center text-slate-400">
          <div className="max-w-md p-8 rounded-2xl glass custom-shadow flex flex-col items-center">
            <div className="text-6xl mb-4 animate-bounce">🏷️</div>
            <h3 className="text-xl font-bold text-white mb-2">Comienza a Automatizar</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Para empezar, introduce la Tasa BCV oficial del día en la parte superior y arrastra tu factura de compra PDF. 
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
          {/* Fila de Datos del Proveedor y Factura (Ultra Compacta & Premium) */}
          <div className="relative z-30 w-full py-1.5 px-4 bg-slate-900/60 backdrop-blur-sm border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 select-none">
            <div className="flex items-center flex-wrap gap-2.5">
              {/* Insignia Factura */}
              <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700/40">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Factura:</span>
                <span className="text-xs font-extrabold text-slate-200 font-mono">#{invoiceData.invoiceNum}</span>
              </div>

              {/* Insignia Fecha */}
              <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Fecha:</span>
                <span className="text-xs font-extrabold text-blue-300 font-mono">{invoiceData.dateCode}</span>
              </div>

              {/* Insignia RIF */}
              <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700/40">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">RIF Proveedor:</span>
                <span className="text-xs font-extrabold text-slate-200 font-mono">{invoiceData.providerRif}</span>
              </div>
            </div>

            {/* Selector y Registro de Proveedor */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Custom Searchable Dropdown de Proveedor */}
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
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded text-xs text-white placeholder-slate-500 outline-none"
                      autoFocus
                    />
                    <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5 pr-0.5 custom-scrollbar">
                      <button
                        type="button"
                        onClick={() => {
                          setProviderCode('');
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
                        filteredProviders.map((p, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setProviderCode(p.code);
                              if (invoiceData && invoiceData.providerRif) {
                                const savedProviders = JSON.parse(localStorage.getItem('rif_to_prov_code') || '{}');
                                savedProviders[invoiceData.providerRif] = p.code;
                                localStorage.setItem('rif_to_prov_code', JSON.stringify(savedProviders));
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

              {/* Botón Registrar */}
              <button
                type="button"
                onClick={() => {
                  setNewProvCode(providerCode);
                  setIsRegisterProviderOpen(true);
                }}
                className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded transition flex items-center gap-0.5 cursor-pointer shadow-md shadow-blue-600/10 hover:shadow-blue-600/20"
                title="Registrar nuevo proveedor con su código"
              >
                <span>+</span>
                <span>Registrar</span>
              </button>

              <div className="h-4 w-px bg-slate-800/80 mx-1 hidden sm:block"></div>

              {/* Input manual del Código */}
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Código (Prov):
              </span>
              <input
                type="text"
                placeholder="Ej: 00071"
                value={providerCode}
                onChange={handleProviderCodeChange}
                className="w-16 px-1.5 py-0.5 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded text-xs text-white font-mono font-bold placeholder-slate-650 text-center outline-none transition"
              />
            </div>
          </div>

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
          />

          {/* Barra Inferior de Impresión */}
          <div className="py-3 px-6 bg-slate-950 border-t border-slate-800 flex justify-between items-center gap-4">
            <div className="text-slate-400">
              <span className="text-sm font-semibold">Repuestos Seleccionados: </span>
              <span className="text-white font-bold">{selectedItems.length}</span>
              <span className="mx-2 text-slate-600">|</span>
              <span className="text-sm font-semibold">Total Etiquetas a Imprimir: </span>
              <span className="text-blue-400 font-extrabold text-lg">{totalLabelsToPrint}</span>
            </div>

            <div className="flex items-center gap-3">
              {/* Botón Borrar/Limpiar */}
              <button
                type="button"
                onClick={handleClear}
                disabled={isLoading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Limpiar Factura
              </button>

              {/* Botón Imprimir */}
              <button
                type="button"
                onClick={handlePrint}
                disabled={isLoading || tasaBCV <= 0 || selectedItems.length === 0 || totalLabelsToPrint === 0}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white disabled:text-slate-500 font-bold text-sm rounded-xl transition cursor-pointer shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/20 disabled:shadow-none animate-pulse-subtle disabled:animate-none disabled:cursor-not-allowed"
              >
                <span>🖨️</span>
                <span>Imprimir {totalLabelsToPrint} Etiquetas</span>
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

      {/* Modal Registrar Proveedor */}
      {isRegisterProviderOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex justify-center items-center z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-850 p-6 rounded-2xl w-[380px] shadow-2xl animate-scale-up">
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
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-white font-semibold outline-none focus:ring-1 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-white font-mono font-bold outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setIsRegisterProviderOpen(false);
                  setNewProvName('');
                  setNewProvCode('');
                }}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newProvName.trim() || !newProvCode.trim()) {
                    alert("Por favor, rellene todos los campos.");
                    return;
                  }
                  
                  // Verificar duplicados por código o nombre
                  const isDuplicate = registeredProviders.some(
                    p => p.code.toLowerCase() === newProvCode.trim().toLowerCase() ||
                         p.name.toLowerCase() === newProvName.trim().toLowerCase()
                  );
                  if (isDuplicate) {
                    if (!confirm("Ya existe un proveedor con ese nombre o código. ¿Deseas agregarlo de todas formas?")) {
                      return;
                    }
                  }

                  const updatedProviders = [
                    ...registeredProviders,
                    { name: newProvName.trim(), code: newProvCode.trim() }
                  ];
                  setRegisteredProviders(updatedProviders);
                  localStorage.setItem('registered_providers', JSON.stringify(updatedProviders));
                  
                  // Auto-seleccionar el código recién registrado
                  setProviderCode(newProvCode.trim());
                  
                  // Si hay RIF activo en la factura, asociarlo
                  if (invoiceData && invoiceData.providerRif) {
                    const savedProviders = JSON.parse(localStorage.getItem('rif_to_prov_code') || '{}');
                    savedProviders[invoiceData.providerRif] = newProvCode.trim();
                    localStorage.setItem('rif_to_prov_code', JSON.stringify(savedProviders));
                  }

                  setIsRegisterProviderOpen(false);
                  setNewProvName('');
                  setNewProvCode('');
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
