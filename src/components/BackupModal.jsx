import React, { useState } from 'react';

export default function BackupModal({
  isOpen,
  onClose,
  providersCount = 0,
  rifCount = 0,
  historyCount = 0,
  onExportBackup,
  onImportBackup,
  isBusy = false
}) {
  const [importMode, setImportMode] = useState('merge'); // 'merge' | 'replace'
  const [confirmReplace, setConfirmReplace] = useState(false);

  if (!isOpen) return null;

  const handleImportClick = () => {
    if (importMode === 'replace' && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setConfirmReplace(false);
    onImportBackup(importMode);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>💾</span> Respaldo y Migración
            </h3>
            <p className="text-xs text-slate-400">
              Exporta o restaura tus proveedores, asociaciones de RIF e historial en un archivo JSON.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Resumen actual */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-extrabold text-white font-mono tabular-nums">{providersCount}</div>
            <div className="text-[11px] font-semibold text-slate-400">Proveedores</div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-extrabold text-white font-mono tabular-nums">{rifCount}</div>
            <div className="text-[11px] font-semibold text-slate-400">RIFs vinculados</div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-extrabold text-white font-mono tabular-nums">{historyCount}</div>
            <div className="text-[11px] font-semibold text-slate-400">Lotes historial</div>
          </div>
        </div>

        {/* Exportar */}
        <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-white">Exportar Respaldo</div>
            <div className="text-xs text-slate-400">Genera un archivo `.json` con toda tu información local.</div>
          </div>
          <button
            type="button"
            onClick={onExportBackup}
            disabled={isBusy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer flex-shrink-0"
          >
            📤 Exportar (.json)
          </button>
        </div>

        {/* Importar */}
        <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-4 flex flex-col gap-3">
          <div>
            <div className="text-sm font-bold text-white">Restaurar desde Archivo</div>
            <div className="text-xs text-slate-400">Elige cómo combinar el respaldo con tus datos actuales:</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setImportMode('merge');
                setConfirmReplace(false);
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                importMode === 'merge'
                  ? 'bg-blue-600/15 border-blue-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold">Fusionar sin duplicar</div>
              <div className="text-[11px] opacity-80 mt-0.5">
                Conserva tus datos actuales y agrega registros nuevos.
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setImportMode('replace');
                setConfirmReplace(false);
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                importMode === 'replace'
                  ? 'bg-amber-500/15 border-amber-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold">Reemplazar todo</div>
              <div className="text-[11px] opacity-80 mt-0.5">
                Sobrescribe proveedores e historial con el respaldo.
              </div>
            </button>
          </div>

          {confirmReplace ? (
            <div className="flex items-center justify-between gap-2 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
              <span className="text-xs font-semibold text-rose-200">
                Esto reemplazará tus datos locales actuales. ¿Continuar?
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleImportClick}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReplace(false)}
                  className="px-3 py-1 bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleImportClick}
                disabled={isBusy}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                📥 Importar Respaldo (.json)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
