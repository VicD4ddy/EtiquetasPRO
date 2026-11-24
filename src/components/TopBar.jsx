import React, { useState, useRef } from 'react';

function formatShortDate(isoStr, withTime = false) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const datePart = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return withTime ? `${datePart} ${pad(d.getHours())}:${pad(d.getMinutes())}` : datePart;
}

function BcvStatusBadge({ bcvMeta, onRestoreOfficial, compact = false }) {
  if (!bcvMeta) return null;

  if (bcvMeta.loading) {
    return (
      <span className="text-[10px] font-medium text-blue-400 animate-pulse">
        Consultando BCV...
      </span>
    );
  }

  if (bcvMeta.isManualOverride && bcvMeta.officialRate > 0) {
    return (
      <button
        type="button"
        onClick={onRestoreOfficial}
        title="Haz clic para restaurar la tasa oficial BCV"
        className="text-[10px] font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded transition cursor-pointer font-mono tabular-nums"
      >
        {compact ? `Manual (BCV: ${bcvMeta.officialRate.toFixed(2)})` : `Editada · Rest. BCV: ${bcvMeta.officialRate.toFixed(2)}`}
      </button>
    );
  }

  if (bcvMeta.isCachedOffline && bcvMeta.rateDate) {
    return (
      <span
        title={bcvMeta.offlineWarning || 'Sin conexión; usando última tasa guardada.'}
        className="text-[10px] font-semibold text-amber-400 font-mono tabular-nums"
      >
        Offline · {formatShortDate(bcvMeta.fetchedAt || bcvMeta.rateDate, true)}
      </span>
    );
  }

  if (bcvMeta.officialRate > 0) {
    return (
      <span
        title={`Fuente: ${bcvMeta.source || 'BCV'}${bcvMeta.fetchedAt ? ` · Actualizada ${formatShortDate(bcvMeta.fetchedAt, true)}` : ''}`}
        className="text-[10px] font-semibold text-emerald-400 font-mono tabular-nums"
      >
        BCV · {formatShortDate(bcvMeta.rateDate || bcvMeta.fetchedAt)}
      </span>
    );
  }

  if (bcvMeta.error) {
    return (
      <span
        title={bcvMeta.error}
        className="text-[10px] font-semibold text-rose-400"
      >
        Sin conexión (manual)
      </span>
    );
  }

  return null;
}

function TabSwitcher({ activeTab, setActiveTab, historyCount }) {
  return (
    <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg p-0.5 flex-shrink-0">
      <button
        type="button"
        onClick={() => setActiveTab('invoice')}
        className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
          activeTab === 'invoice'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        Facturación
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('manual')}
        className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
          activeTab === 'manual'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        Etiqueta Manual
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('history')}
        className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
          activeTab === 'history'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <span>Historial</span>
        <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums ${
          activeTab === 'history'
            ? 'bg-blue-500/40 text-white'
            : 'bg-slate-700 text-slate-300'
        }`}>
          {historyCount}
        </span>
      </button>
    </div>
  );
}

export default function TopBar({
  tasaBCV,
  onManualTasaChange,
  bcvMeta,
  onRefreshBcv,
  printers,
  selectedPrinter,
  setSelectedPrinter,
  onRefreshPrinters,
  isRefreshingPrinters = false,
  onPrintTestLabel,
  onFileSelect,
  onBrowsePdf,
  onNotify,
  isLoading,
  currentFileName,
  activeTab,
  setActiveTab,
  historyCount = 0,
  onOpenProviders,
  onOpenBackup
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        onFileSelect(file);
      } else if (onNotify) {
        onNotify('Por favor, arrastre únicamente archivos PDF.', 'error');
      }
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
      e.target.value = '';
    }
  };

  const onButtonClick = () => {
    if (onBrowsePdf) {
      onBrowsePdf();
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRestoreOfficial = () => {
    if (bcvMeta && bcvMeta.officialRate > 0) {
      onManualTasaChange(bcvMeta.officialRate);
    }
  };

  // ==========================================
  // LAYOUT 1: ULTRA-COMPACT (FACTURA ACTIVA O MANUAL/HISTORIAL)
  // ==========================================
  if (currentFileName || activeTab !== 'invoice') {
    return (
      <div className="w-full flex flex-wrap items-center justify-between gap-2.5 p-2.5 px-4 bg-slate-900 border-b border-slate-800 text-white select-none">
        {/* Lado Izquierdo: Título, Pestañas y Archivo Activo */}
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <span className="text-sm font-black text-white bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 flex-shrink-0">
            Etiquetas Sotomayor 🏷️
          </span>

          <TabSwitcher
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            historyCount={historyCount}
          />

          {currentFileName && (
            <>
              <div className="h-4 w-px bg-slate-800 flex-shrink-0 hidden sm:block"></div>

              {/* Dropzone Mini e Interactivo */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={onButtonClick}
                className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border border-dashed text-xs cursor-pointer transition truncate ${
                  isDragActive
                    ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)] scale-[0.99]'
                    : 'border-slate-700 hover:border-slate-500 bg-slate-800/40 hover:bg-slate-800/60 text-slate-300'
                }`}
                title="Haz clic o arrastra otro PDF aquí para cambiar factura"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleChange}
                  className="hidden"
                />
                {isLoading ? (
                  <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <span className="text-sm">📄</span>
                )}
                <span className="font-bold truncate max-w-[130px] sm:max-w-[200px]">
                  {isLoading ? 'Parseando...' : currentFileName}
                </span>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              </div>
            </>
          )}
        </div>

        {/* Lado Derecho: Tasa BCV, Impresora y Herramientas */}
        <div className="flex items-center gap-2.5 flex-shrink-0 flex-wrap">
          {/* Tasa BCV Mini + Refresh + Estado */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">BCV:</span>
            <div className="relative w-22">
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={tasaBCV || ''}
                onChange={(e) => onManualTasaChange(parseFloat(e.target.value) || 0)}
                className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-md text-white font-mono tabular-nums font-bold text-xs outline-none text-right pr-6 focus:ring-1 focus:ring-blue-500"
              />
              <span className="absolute right-2 top-1.5 text-[9px] text-slate-500 font-bold">Bs</span>
            </div>
            <button
              type="button"
              onClick={onRefreshBcv}
              disabled={bcvMeta && bcvMeta.loading}
              title="Actualizar tasa oficial BCV"
              className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-md text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className={bcvMeta && bcvMeta.loading ? 'inline-block animate-spin' : ''}>↻</span>
            </button>
            <BcvStatusBadge
              bcvMeta={bcvMeta}
              onRestoreOfficial={handleRestoreOfficial}
              compact
            />
          </div>

          <div className="h-4 w-px bg-slate-800 hidden xl:block"></div>

          {/* Selector de Impresoras Mini + Refrescar + Prueba */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">Imp:</span>
            <select
              value={selectedPrinter || ''}
              onChange={(e) => setSelectedPrinter(e.target.value)}
              className="w-36 px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-md text-white text-xs font-semibold outline-none cursor-pointer focus:ring-1 focus:ring-blue-500"
            >
              <option value="Default">Predeterminada</option>
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRefreshPrinters}
              disabled={isRefreshingPrinters}
              title="Recargar impresoras conectadas"
              className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-md text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              <span className={isRefreshingPrinters ? 'inline-block animate-spin' : ''}>↻</span>
            </button>
            <button
              type="button"
              onClick={onPrintTestLabel}
              disabled={isLoading}
              title="Imprimir 1 etiqueta de prueba (55x40mm)"
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-md text-[11px] font-bold text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-40"
            >
              Prueba
            </button>
          </div>

          {/* Utilidades: Proveedores y Respaldo */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenProviders}
              title="Gestionar catálogo de proveedores"
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-md text-[11px] font-bold text-slate-300 hover:text-white transition cursor-pointer"
            >
              🏢 Proveedores
            </button>
            <button
              type="button"
              onClick={onOpenBackup}
              title="Exportar o importar respaldo JSON"
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-md text-[11px] font-bold text-slate-300 hover:text-white transition cursor-pointer"
            >
              💾 Respaldo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // LAYOUT 2: COMPLETO (ESTADO INICIAL VACÍO EN FACTURACIÓN)
  // ==========================================
  return (
    <div className="w-full flex flex-col gap-5 p-6 bg-slate-900 border-b border-slate-800 select-none">
      {/* Header Info */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold tracking-tight text-white bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
              Etiquetas Sotomayor 🏷️
            </h1>
            <TabSwitcher
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              historyCount={historyCount}
            />
            <button
              type="button"
              onClick={onOpenProviders}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer"
            >
              🏢 Proveedores
            </button>
            <button
              type="button"
              onClick={onOpenBackup}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer"
            >
              💾 Respaldo
            </button>
          </div>
          <p className="text-slate-400 text-sm">
            Automatización de etiquetado de repuestos de facturas Valery ERP
          </p>
        </div>

        {/* Inputs BCV e Impresora */}
        <div className="flex flex-wrap items-start gap-4 w-full xl:w-auto">
          {/* Input Tasa BCV + Refresh + Estado */}
          <div className="flex flex-col gap-1 w-full sm:w-52">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Tasa BCV (Bs.)
              </label>
              <BcvStatusBadge
                bcvMeta={bcvMeta}
                onRestoreOfficial={handleRestoreOfficial}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={tasaBCV || ''}
                  onChange={(e) => onManualTasaChange(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 pr-8 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-white font-mono tabular-nums font-bold placeholder-slate-500 outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-2.5 text-sm text-slate-500 font-medium">Bs</span>
              </div>
              <button
                type="button"
                onClick={onRefreshBcv}
                disabled={bcvMeta && bcvMeta.loading}
                title="Consultar tasa BCV oficial ahora"
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg text-slate-300 hover:text-white font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className={bcvMeta && bcvMeta.loading ? 'inline-block animate-spin' : ''}>↻</span>
              </button>
            </div>
          </div>

          {/* Selector de Impresoras + Refrescar + Prueba */}
          <div className="flex flex-col gap-1 w-full sm:w-80">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              Impresora Térmica (55x40mm)
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={selectedPrinter || ''}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-white font-medium outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="Default">Impresora Predeterminada</option>
                {printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.name} {printer.isDefault ? '⭐' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onRefreshPrinters}
                disabled={isRefreshingPrinters}
                title="Recargar impresoras conectadas"
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg text-slate-300 hover:text-white font-bold transition cursor-pointer disabled:opacity-50"
              >
                <span className={isRefreshingPrinters ? 'inline-block animate-spin' : ''}>↻</span>
              </button>
              <button
                type="button"
                onClick={onPrintTestLabel}
                disabled={isLoading}
                title="Imprimir 1 etiqueta de prueba para calibración"
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg text-xs font-bold text-slate-200 hover:text-white transition cursor-pointer disabled:opacity-40"
              >
                Prueba
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Area de Dropzone Amplia */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        className={`relative w-full h-36 flex flex-col justify-center items-center rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300 ${
          isDragActive
            ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)] scale-[0.995]'
            : 'border-slate-700 hover:border-slate-600 bg-slate-800/40 hover:bg-slate-800/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleChange}
          className="hidden"
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-semibold text-slate-200">Parseando factura PDF...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center px-4">
            <div className="text-4xl mb-2 text-slate-500 animate-pulse-subtle">📥</div>
            <p className="text-sm font-bold text-slate-200">
              Arrastra y suelta tu factura de compra PDF
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Soporta facturas en texto nativo exportadas de Valery ERP
            </p>
            <button
              type="button"
              className="mt-3 px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white rounded-md transition"
            >
              Seleccionar Archivo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
