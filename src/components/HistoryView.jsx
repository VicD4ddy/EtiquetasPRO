import React, { useState, useMemo } from 'react';

function formatDateTime(isoStr) {
  if (!isoStr) return '---';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '---';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PERIOD_OPTIONS = [
  { id: 'all', label: 'Todo (6m)' },
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' }
];

export default function HistoryView({
  history = [],
  searchQuery = '',
  setSearchQuery,
  onReprintBatch,
  onReprintItem,
  onPreviewItem,
  onDeleteBatch,
  onClearHistory,
  onExportCsv,
  isPrinting = false,
  onGoToInvoice
}) {
  const [periodFilter, setPeriodFilter] = useState('all');
  const [expandedBatches, setExpandedBatches] = useState({});
  const [itemReprintQty, setItemReprintQty] = useState({});
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const filteredHistory = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const q = searchQuery.trim().toLowerCase();

    return history.filter((batch) => {
      const printedMs = new Date(batch.printedAt).getTime();
      if (periodFilter === 'today' && printedMs < startOfToday) return false;
      if (periodFilter === '7d' && printedMs < now.getTime() - 7 * 86400000) return false;
      if (periodFilter === '30d' && printedMs < now.getTime() - 30 * 86400000) return false;

      if (!q) return true;

      const batchMatches =
        (batch.invoiceNum || '').toLowerCase().includes(q) ||
        (batch.providerRif || '').toLowerCase().includes(q) ||
        (batch.providerName || '').toLowerCase().includes(q) ||
        (batch.providerCode || '').toLowerCase().includes(q) ||
        (batch.fileName || '').toLowerCase().includes(q);

      if (batchMatches) return true;

      return Array.isArray(batch.items) && batch.items.some((item) =>
        (item.code || '').toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q)
      );
    });
  }, [history, searchQuery, periodFilter]);

  const totalFilteredLabels = useMemo(() => {
    return filteredHistory.reduce((acc, b) => acc + (b.totalLabels || 0), 0);
  }, [filteredHistory]);

  const toggleExpand = (batchId) => {
    setExpandedBatches((prev) => ({
      ...prev,
      [batchId]: !prev[batchId]
    }));
  };

  const getItemQty = (batchId, itemIndex, defaultQty) => {
    const key = `${batchId}:${itemIndex}`;
    return itemReprintQty[key] !== undefined ? itemReprintQty[key] : defaultQty;
  };

  const setItemQty = (batchId, itemIndex, val) => {
    const key = `${batchId}:${itemIndex}`;
    const qty = Math.max(1, parseInt(val, 10) || 1);
    setItemReprintQty((prev) => ({
      ...prev,
      [key]: qty
    }));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900 px-6 py-4 select-none">
      {/* Barra superior de filtros y acciones */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Historial de Etiquetas</span>
            <span className="px-2 py-0.5 text-xs bg-slate-800 text-slate-300 border border-slate-700 rounded-full font-mono tabular-nums">
              {filteredHistory.length} lotes · {totalFilteredLabels} etiq.
            </span>
          </h2>

          {/* Filtro de período */}
          <div className="flex items-center bg-slate-950/60 border border-slate-800 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriodFilter(opt.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                  periodFilter === opt.id
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Buscador */}
          <div className="relative flex-1 sm:w-72">
            <span className="absolute left-3 top-1.5 text-slate-500 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Factura, código, descripción, proveedor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-7 py-1.5 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-slate-200 placeholder-slate-500 outline-none select-text focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1 text-slate-500 hover:text-slate-300 font-bold cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          {/* Exportar CSV */}
          <button
            type="button"
            onClick={() => onExportCsv(filteredHistory)}
            disabled={filteredHistory.length === 0}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Exportar CSV</span>
          </button>

          {/* Limpiar historial (confirmación en línea de dos pasos) */}
          {history.length > 0 && (
            confirmClearAll ? (
              <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1">
                <span className="text-[11px] font-bold text-rose-300">¿Vaciar todo?</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmClearAll(false);
                    onClearHistory();
                  }}
                  className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded cursor-pointer"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold rounded cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5"
              >
                <span>🗑️</span>
                <span>Limpiar</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Lista de lotes */}
      <div className="flex-1 overflow-auto pr-1 space-y-3">
        {history.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center p-8 text-center">
            <div className="max-w-md p-8 rounded-2xl glass custom-shadow flex flex-col items-center">
              <div className="text-5xl mb-3">🗂️</div>
              <h3 className="text-lg font-bold text-white mb-2">Sin impresiones registradas</h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-5">
                Cada vez que imprimas etiquetas desde una factura, el lote quedará guardado aquí durante 6 meses para consultar, exportar o reimprimir.
              </p>
              <button
                type="button"
                onClick={onGoToInvoice}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Ir a Facturación
              </button>
            </div>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="border border-slate-800 rounded-xl bg-slate-900/50 p-10 text-center text-slate-400">
            <p className="text-sm font-semibold mb-2">No hay lotes que coincidan con el filtro actual.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setPeriodFilter('all');
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold text-slate-200 cursor-pointer"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          filteredHistory.map((batch) => {
            const isExpanded = Boolean(expandedBatches[batch.id]);
            const providerLabel = batch.providerName
              ? `${batch.providerName} (${batch.providerCode})`
              : batch.providerCode && batch.providerCode !== '00000'
                ? `Cód. ${batch.providerCode}`
                : 'Sin código prov.';

            return (
              <div
                key={batch.id}
                className="border border-slate-800 rounded-xl bg-slate-950/50 overflow-hidden"
              >
                {/* Cabecera del lote */}
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-900/70">
                  <div className="flex items-center flex-wrap gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleExpand(batch.id)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                      title={isExpanded ? 'Ocultar ítems' : 'Ver ítems del lote'}
                    >
                      {isExpanded ? '▾' : '▸'}
                    </button>

                    <span className="text-xs font-mono tabular-nums font-semibold text-slate-300">
                      {formatDateTime(batch.printedAt)}
                    </span>

                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-xs font-mono tabular-nums font-extrabold text-white">
                      #{batch.invoiceNum}
                    </span>

                    {batch.isReprint && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                        Reimpresión
                      </span>
                    )}

                    <span className="text-xs font-semibold text-slate-300 truncate max-w-[220px]" title={`${providerLabel} · RIF: ${batch.providerRif}`}>
                      {providerLabel}
                    </span>

                    <span className="text-[11px] font-mono tabular-nums text-slate-400">
                      BCV: <strong className="text-slate-200">{Number(batch.tasaBCV || 0).toFixed(2)}</strong> Bs
                    </span>

                    <span className="text-[11px] text-slate-500 truncate max-w-[160px]" title={`Impresora: ${batch.printerName}`}>
                      🖨️ {batch.printerName || 'Default'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs font-mono tabular-nums font-bold text-blue-300">
                      {batch.totalItems} ítems · {batch.totalLabels} etiq.
                    </span>

                    <button
                      type="button"
                      onClick={() => onReprintBatch(batch)}
                      disabled={isPrinting}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white disabled:text-slate-500 text-xs font-bold rounded-lg transition cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <span>🖨️</span>
                      <span>Reimprimir lote</span>
                    </button>

                    {confirmDeleteId === batch.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(null);
                            onDeleteBatch(batch.id);
                          }}
                          className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded cursor-pointer"
                        >
                          Borrar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold rounded cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(batch.id)}
                        title="Eliminar este registro del historial"
                        className="px-2 py-1 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 text-xs font-bold rounded-lg transition cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Detalle desplegable de artículos del lote */}
                {isExpanded && (
                  <div className="border-t border-slate-800/80 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs text-slate-300">
                      <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3 w-36">Código</th>
                          <th className="py-2 px-3">Descripción</th>
                          <th className="py-2 px-3 w-24 text-right">Costo USD</th>
                          <th className="py-2 px-3 w-28 text-center">Cifrado</th>
                          <th className="py-2 px-3 w-24 text-right">Impresas</th>
                          <th className="py-2 px-3 w-56 text-center">Reimpresión puntual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {(batch.items || []).map((item, idx) => {
                          const qty = getItemQty(batch.id, idx, item.quantity || 1);
                          return (
                            <tr key={`${batch.id}-${idx}`} className="hover:bg-slate-800/30">
                              <td className="py-2 px-3 font-mono font-semibold text-slate-200 select-text">
                                {item.code}
                              </td>
                              <td className="py-2 px-3 text-slate-300 select-text">
                                {item.description}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                                ${Number(item.costUSD || 0).toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] font-black text-blue-400">
                                  {item.cipherCode || '---'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-200">
                                {item.quantity}
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onPreviewItem(batch, item)}
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] font-bold text-slate-300 hover:text-white cursor-pointer"
                                    title="Previsualizar etiqueta"
                                  >
                                    👁️
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    value={qty}
                                    onChange={(e) => setItemQty(batch.id, idx, e.target.value)}
                                    className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-center font-mono tabular-nums font-bold text-white outline-none focus:border-blue-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => onReprintItem(batch, item, qty)}
                                    disabled={isPrinting || qty <= 0}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white disabled:text-slate-500 rounded text-[11px] font-bold transition cursor-pointer disabled:cursor-not-allowed"
                                  >
                                    🖨️ Reimprimir
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
