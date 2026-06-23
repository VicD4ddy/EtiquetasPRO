import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function PreviewModal({ isOpen, onClose, label }) {
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (isOpen && label && barcodeRef.current) {
      try {
        // Generar código de barras interactivo en la previsualización
        JsBarcode(barcodeRef.current, label.code, {
          format: 'CODE128',
          width: 1.8,          // Ancho de las barras
          height: 50,          // Altura de las barras
          displayValue: false, // Desactivar texto interno del código de barras para evitar superposición
          margin: 0
        });
      } catch (err) {
        console.error('Error generando código de barras de previsualización:', err);
      }
    }
  }, [isOpen, label]);

  if (!isOpen || !label) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      {/* Contenedor del Modal */}
      <div 
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-white">Previsualización de Etiqueta</h3>
            <p className="text-xs text-slate-400">Escala de impresión térmica (55 x 40 mm)</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            ×
          </button>
        </div>

        {/* Fondo Simulador de Mesa de Trabajo */}
        <div className="w-full py-8 bg-slate-950/80 rounded-xl flex items-center justify-center border border-slate-800/50 relative overflow-hidden">
          {/* Regla simulada para dar escala */}
          <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[9px] text-slate-600 border-t border-slate-800 pt-1 font-mono">
            <span>0 mm</span>
            <span>10</span>
            <span>20</span>
            <span>30</span>
            <span>40</span>
            <span>50</span>
            <span>55 mm</span>
          </div>

          {/* ETIQUETA SIMULADA (Proporción exacta 55x40mm) */}
          <div className="w-[302px] h-[220px] bg-white rounded-md shadow-[0_10px_25px_rgba(0,0,0,0.5)] p-4 flex flex-col border border-slate-200 select-none text-black">
            {/* Nombre Tienda (Banda negra profesional invertida) */}
            <div className="bg-black text-white text-[11px] font-extrabold text-center uppercase tracking-wider py-1 rounded mb-2 flex items-center justify-center font-sans">
              REPUESTOS SOTOMAYOR, C.A.
            </div>

            {/* Código de barras */}
            <div className="flex justify-center items-center h-[80px] mb-1.5 overflow-hidden">
              <svg ref={barcodeRef} className="max-w-full max-h-[80px]"></svg>
            </div>

            {/* Código del Repuesto (Grande y Destacado) */}
            <div className="text-[15px] font-extrabold text-black leading-none mb-1 font-sans text-center">
              {label.code}
            </div>

            {/* Descripción del Producto */}
            <div className="text-[10px] font-bold leading-tight text-slate-800 h-[42px] overflow-hidden text-center font-sans pr-1">
              {label.description}
            </div>

            {/* Fila Inferior */}
            <div className="flex justify-between items-end mt-auto h-[35px]">
              {/* Prov y Fecha formateados */}
              <div className="text-[10px] font-semibold leading-snug text-slate-800 font-sans">
                <span className="font-extrabold text-black">PROV:</span> {label.providerCode || '00000'}<br />
                <span className="font-extrabold text-black">FECHA:</span> {label.dateCode || '00/00'}
              </div>

              {/* Recuadro LUCHAREMOS (Invertido) */}
              <div className="bg-black text-white px-3 py-1 text-[14px] font-black tracking-wide rounded text-center leading-none font-sans flex items-center justify-center">
                {label.cipherCode}
              </div>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm rounded-xl transition cursor-pointer"
          >
            Cerrar Vista Previa
          </button>
        </div>
      </div>
    </div>
  );
}
