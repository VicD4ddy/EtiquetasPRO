import React, { useState, useRef } from 'react';

export default function TopBar({
  tasaBCV,
  setTasaBCV,
  printers,
  selectedPrinter,
  setSelectedPrinter,
  onFileSelect,
  isLoading,
  currentFileName
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith('.pdf')) {
        onFileSelect(file);
      } else {
        alert("Por favor, arrastre únicamente archivos PDF.");
      }
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  // ==========================================
  // LAYOUT 1: ULTRA-COMPACT (FACTURA ACTIVA)
  // ==========================================
  if (currentFileName) {
    return (
      <div className="w-full flex items-center justify-between p-2.5 px-4 bg-slate-900 border-b border-slate-800 text-white select-none">
        {/* Lado Izquierdo: Título y Archivo Activo (que también es Dropzone) */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-black text-white bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 flex-shrink-0">
            Etiquetas Sotomayor 🏷️
          </span>
          
          <div className="h-4 w-px bg-slate-800 flex-shrink-0"></div>
          
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
            <span className="font-bold truncate max-w-[150px] sm:max-w-xs md:max-w-md lg:max-w-lg">
              {isLoading ? 'Parseando...' : currentFileName}
            </span>
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
          </div>
        </div>

        {/* Lado Derecho: Controles Compactos */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Tasa BCV Mini */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tasa BCV:</span>
            <div className="relative w-24">
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={tasaBCV || ''}
                onChange={(e) => setTasaBCV(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-md text-white font-bold text-xs outline-none text-right pr-6 focus:ring-1 focus:ring-blue-500"
              />
              <span className="absolute right-2 top-1.5 text-[9px] text-slate-500 font-bold">Bs</span>
            </div>
          </div>

          {/* Selector de Impresoras Mini */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Impresora:</span>
            <select
              value={selectedPrinter || ''}
              onChange={(e) => setSelectedPrinter(e.target.value)}
              className="w-40 px-2 py-1 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-md text-white text-xs font-semibold outline-none cursor-pointer focus:ring-1 focus:ring-blue-500"
            >
              <option value="Default">Predeterminada</option>
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // LAYOUT 2: COMPLETO (ESTADO INICIAL VACÍO)
  // ==========================================
  return (
    <div className="w-full flex flex-col gap-6 p-6 bg-slate-900 border-b border-slate-800 select-none">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
            Etiquetas Sotomayor 🏷️
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Automatización de etiquetado de repuestos de facturas Valery ERP
          </p>
        </div>

        {/* Inputs BCV e Impresora */}
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          {/* Input Tasa BCV */}
          <div className="flex flex-col gap-1 w-full sm:w-44">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Tasa BCV del Día (Bs.)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={tasaBCV || ''}
                onChange={(e) => setTasaBCV(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-white font-bold placeholder-slate-500 outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="absolute right-3 top-2 text-sm text-slate-500 font-medium">Bs</span>
            </div>
          </div>

          {/* Selector de Impresoras */}
          <div className="flex flex-col gap-1 w-full sm:w-64">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              Impresora Térmica (55x40mm)
            </label>
            <select
              value={selectedPrinter || ''}
              onChange={(e) => setSelectedPrinter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-white font-medium outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="Default">Impresora Predeterminada del Sistema</option>
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.name} {printer.isDefault ? '⭐' : ''}
                </option>
              ))}
            </select>
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
