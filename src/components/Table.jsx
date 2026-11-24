import React, { useState } from 'react';

export default function Table({
  items,
  tasaBCV,
  selectedItems,
  setSelectedItems,
  printQuantities,
  setPrintQuantities,
  calculateCostUSD,
  encodeLUCHAREMOS,
  onPreview,
  onUpdateItem,
  onTogglePackMode,
  onSetAllOneLabel,
  onRestoreInvoiceQuantities
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filtrar los ítems basándose en el buscador
  const filteredItems = items.filter(item => {
    const query = searchQuery.toLowerCase();
    return (
      item.code.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
    );
  });

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const newSelected = [...selectedItems];
      filteredItems.forEach(item => {
        if (!newSelected.includes(item.id)) {
          newSelected.push(item.id);
        }
      });
      setSelectedItems(newSelected);
    } else {
      const idsToRemove = filteredItems.map(item => item.id);
      setSelectedItems(selectedItems.filter(id => !idsToRemove.includes(id)));
    }
  };

  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedItems([...selectedItems, id]);
    } else {
      setSelectedItems(selectedItems.filter(i => i !== id));
    }
  };

  const handleQtyChange = (id, val) => {
    const qty = Math.max(0, parseInt(val, 10) || 0);
    setPrintQuantities({
      ...printQuantities,
      [id]: qty
    });
  };

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(item => selectedItems.includes(item.id));

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900 px-6 py-3">
      {/* Controles de la Tabla */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 mb-3">
        <div className="flex items-center flex-wrap gap-2.5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Detalle de Repuestos</span>
            <span className="px-2 py-0.5 text-xs bg-slate-800 text-slate-400 border border-slate-700 rounded-full font-mono tabular-nums font-medium">
              {filteredItems.length} de {items.length} ítems
            </span>
          </h2>

          {/* Acciones rápidas de cantidad */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onSetAllOneLabel}
              title="Asignar 1 etiqueta por cada repuesto (útil para exhibición o estantes)"
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg text-[11px] font-bold text-slate-300 hover:text-white transition cursor-pointer"
            >
              1 etiq. c/u
            </button>
            <button
              type="button"
              onClick={onRestoreInvoiceQuantities}
              title="Restaurar cantidades calculadas de la factura (incluyendo regla ÷4)"
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg text-[11px] font-bold text-slate-300 hover:text-white transition cursor-pointer"
            >
              Cant. factura
            </button>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative w-full lg:w-80">
          <span className="absolute left-3 top-2 text-slate-500 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Buscar por código o descripción..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-7 py-1.5 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none select-text focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1.5 text-slate-500 hover:text-slate-300 font-bold cursor-pointer"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Contenedor de la Tabla */}
      <div className="flex-1 overflow-auto border border-slate-800 rounded-xl bg-slate-900/50">
        <table className="w-full text-left border-collapse text-slate-300">
          <thead className="sticky top-0 bg-slate-950 z-10 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3 w-12 text-center">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-slate-700 text-blue-500 focus:ring-blue-500 bg-slate-800 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-3 w-44">Código</th>
              <th className="py-2.5 px-3">Descripción</th>
              <th className="py-2.5 px-3 w-28 text-right">Cant. Factura</th>
              <th className="py-2.5 px-3 w-32 text-right">Costo Lista (Bs)</th>
              <th className="py-2.5 px-3 w-28 text-right">Costo (USD)</th>
              <th className="py-2.5 px-3 w-36 text-center">Cifrado LUCHAREMOS</th>
              <th className="py-2.5 px-3 w-48 text-center">Cant. Etiquetas</th>
              <th className="py-2.5 px-3 w-24 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-sm">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan="9" className="py-6 px-3 text-center text-slate-500">
                  No se encontraron repuestos con los criterios de búsqueda.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedItems.includes(item.id);
                const costUSD = calculateCostUSD(item.costoListaUnit, tasaBCV);
                const cipherCode = tasaBCV > 0 ? encodeLUCHAREMOS(costUSD) : '---';
                const printQty = printQuantities[item.id] !== undefined ? printQuantities[item.id] : 0;

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors duration-150 ${
                      item.needsReview
                        ? 'bg-amber-500/5 border-l-2 border-l-amber-500 text-white'
                        : isSelected
                          ? 'bg-blue-500/5 text-white'
                          : 'hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Checkbox Selección */}
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleSelectOne(item.id, e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 text-blue-500 focus:ring-blue-500 bg-slate-800 cursor-pointer"
                      />
                    </td>

                    {/* Código (Editable en línea) */}
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1">
                        {item.needsReview && (
                          <span
                            title={item.warning || 'Verificar separación entre código y descripción'}
                            className="text-amber-400 text-xs flex-shrink-0 cursor-help"
                          >
                            ⚠️
                          </span>
                        )}
                        <input
                          type="text"
                          value={item.code}
                          onChange={(e) => onUpdateItem && onUpdateItem(item.id, 'code', e.target.value)}
                          placeholder="Código..."
                          title={item.needsReview && item.warning ? item.warning : 'Clic para editar código'}
                          className={`w-full px-2 py-1 rounded text-sm font-mono font-semibold text-slate-200 outline-none select-text transition ${
                            item.needsReview || !item.code.trim()
                              ? 'bg-slate-800/70 border border-amber-500/50 focus:border-blue-500'
                              : 'bg-transparent hover:bg-slate-800/70 focus:bg-slate-800 border border-transparent hover:border-slate-700 focus:border-blue-500'
                          }`}
                        />
                      </div>
                    </td>

                    {/* Descripción (Editable en línea) */}
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => onUpdateItem && onUpdateItem(item.id, 'description', e.target.value)}
                        placeholder="Descripción..."
                        title="Clic para editar descripción"
                        className={`w-full px-2 py-1 rounded text-sm font-medium text-slate-300 outline-none select-text transition ${
                          item.needsReview
                            ? 'bg-slate-800/70 border border-amber-500/40 focus:border-blue-500'
                            : 'bg-transparent hover:bg-slate-800/70 focus:bg-slate-800 border border-transparent hover:border-slate-700 focus:border-blue-500'
                        }`}
                      />
                    </td>

                    {/* Cantidad Factura */}
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-400">
                      {item.qtyOrd}
                    </td>

                    {/* Costo Lista Bs */}
                    <td className="py-2 px-3 text-right text-slate-400 font-mono tabular-nums">
                      {item.costoListaUnit}
                    </td>

                    {/* Costo USD */}
                    <td className="py-2 px-3 text-right font-bold text-slate-200 font-mono tabular-nums">
                      {tasaBCV > 0 ? (
                        `$${costUSD.toFixed(2)}`
                      ) : (
                        <span className="text-yellow-500 text-xs font-semibold font-sans">Tasa req.</span>
                      )}
                    </td>

                    {/* Cifrado LUCHAREMOS */}
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-black tracking-wider ${
                        tasaBCV > 0
                          ? 'bg-slate-800 text-blue-400 border border-slate-700'
                          : 'bg-slate-900/50 text-slate-600'
                      }`}>
                        {cipherCode}
                      </span>
                    </td>

                    {/* Cantidad Etiquetas + Badge regla ÷4 */}
                    <td className="py-2 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex justify-center items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(item.id, Math.max(0, printQty - 1))}
                            className="w-6 h-6 flex justify-center items-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 select-none font-bold text-xs cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={printQty}
                            onChange={(e) => handleQtyChange(item.id, e.target.value)}
                            className="w-14 px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-center text-sm font-mono tabular-nums font-bold text-white outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleQtyChange(item.id, printQty + 1)}
                            className="w-6 h-6 flex justify-center items-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 select-none font-bold text-xs cursor-pointer"
                          >
                            +
                          </button>
                          {item.isPackEligible && onTogglePackMode && (
                            <button
                              type="button"
                              onClick={() => onTogglePackMode(item.id)}
                              title={
                                item.packMode === 'pack4'
                                  ? 'Regla activa: 1 etiqueta por cada 4 unidades. Clic para cambiar a 1:1'
                                  : 'Modo 1:1 activo. Clic para aplicar regla Juego ÷4'
                              }
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                                item.packMode === 'pack4'
                                  ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 hover:bg-blue-500/25'
                                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {item.packMode === 'pack4' ? '÷4' : '1:1'}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Acciones */}
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onPreview({
                          code: item.code.trim(),
                          description: item.description.trim(),
                          costoListaUnit: item.costoListaUnit
                        })}
                        disabled={tasaBCV <= 0 || !item.code.trim()}
                        title={
                          !item.code.trim()
                            ? 'Complete el código para previsualizar'
                            : tasaBCV <= 0
                              ? 'Ingrese la Tasa BCV para previsualizar'
                              : 'Ver previsualización'
                        }
                        className="px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        👁️ Ver
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
