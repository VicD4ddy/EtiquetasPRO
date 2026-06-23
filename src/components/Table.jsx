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
  onPreview
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
      // Seleccionar todos los visibles
      const newSelected = [...selectedItems];
      filteredItems.forEach(item => {
        if (!newSelected.includes(item.code)) {
          newSelected.push(item.code);
        }
      });
      setSelectedItems(newSelected);
    } else {
      // Deseleccionar los visibles
      const codesToRemove = filteredItems.map(item => item.code);
      setSelectedItems(selectedItems.filter(code => !codesToRemove.includes(code)));
    }
  };

  const handleSelectOne = (code, checked) => {
    if (checked) {
      setSelectedItems([...selectedItems, code]);
    } else {
      setSelectedItems(selectedItems.filter(c => c !== code));
    }
  };

  const handleQtyChange = (code, val) => {
    const qty = parseInt(val) || 0;
    setPrintQuantities({
      ...printQuantities,
      [code]: qty
    });
  };

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(item => selectedItems.includes(item.code));

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900 px-6 py-3">
      {/* Controles de la Tabla */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 self-start sm:self-center">
          <span>Detalle de Repuestos</span>
          <span className="px-2 py-0.5 text-xs bg-slate-800 text-slate-400 border border-slate-700 rounded-full font-medium">
            {filteredItems.length} de {items.length} ítems
          </span>
        </h2>
        
        {/* Buscador */}
        <div className="relative w-full sm:w-80">
          <span className="absolute left-3 top-2 text-slate-500 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Buscar por código o descripción..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1.5 text-slate-500 hover:text-slate-300 font-bold"
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
              <th className="py-2.5 px-3 w-32">Código</th>
              <th className="py-2.5 px-3">Descripción</th>
              <th className="py-2.5 px-3 w-32 text-right">Cant. Factura</th>
              <th className="py-2.5 px-3 w-32 text-right">Costo Lista (Bs)</th>
              <th className="py-2.5 px-3 w-32 text-right">Costo (USD)</th>
              <th className="py-2.5 px-3 w-36 text-center">Cifrado LUCHAREMOS</th>
              <th className="py-2.5 px-3 w-40 text-center">Cant. Etiquetas</th>
              <th className="py-2.5 px-3 w-28 text-center">Acciones</th>
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
                const isSelected = selectedItems.includes(item.code);
                const costUSD = calculateCostUSD(item.costoListaUnit, tasaBCV);
                const cipherCode = tasaBCV > 0 ? encodeLUCHAREMOS(costUSD) : '---';
                const printQty = printQuantities[item.code] !== undefined ? printQuantities[item.code] : 0;

                return (
                  <tr
                    key={item.code}
                    className={`transition-colors duration-150 ${
                      isSelected
                        ? 'bg-blue-500/5 text-white'
                        : 'hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Checkbox Selección */}
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleSelectOne(item.code, e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 text-blue-500 focus:ring-blue-500 bg-slate-800 cursor-pointer"
                      />
                    </td>

                    {/* Código */}
                    <td className="py-2 px-3 font-mono font-semibold text-slate-200">
                      {item.code}
                    </td>

                    {/* Descripción */}
                    <td className="py-2 px-3 font-medium text-slate-300">
                      {item.description}
                    </td>

                    {/* Cantidad Factura */}
                    <td className="py-2 px-3 text-right font-semibold text-slate-400">
                      {item.qtyOrd}
                    </td>

                    {/* Costo Lista Bs */}
                    <td className="py-2 px-3 text-right text-slate-400 font-mono">
                      {item.costoListaUnit}
                    </td>

                    {/* Costo USD */}
                    <td className="py-2 px-3 text-right font-bold text-slate-200 font-mono">
                      {tasaBCV > 0 ? (
                        `$${costUSD.toFixed(2)}`
                      ) : (
                        <span className="text-yellow-500 text-xs font-semibold">Tasa requerida</span>
                      )}
                    </td>

                    {/* Cifrado LUCHAREMOS */}
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-black tracking-wider ${
                        tasaBCV > 0
                          ? 'bg-slate-800 text-blue-400 border border-slate-700'
                          : 'bg-slate-900/50 text-slate-600'
                      }`}>
                        {cipherCode}
                      </span>
                    </td>

                    {/* Cantidad Etiquetas */}
                    <td className="py-2 px-3 text-center">
                      <div className="flex justify-center items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(item.code, Math.max(0, printQty - 1))}
                          className="w-6 h-6 flex justify-center items-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 select-none font-bold text-xs"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={printQty}
                          onChange={(e) => handleQtyChange(item.code, e.target.value)}
                          className="w-16 px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-center text-sm font-bold text-white outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleQtyChange(item.code, printQty + 1)}
                          className="w-6 h-6 flex justify-center items-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 select-none font-bold text-xs"
                        >
                          +
                        </button>
                      </div>
                    </td>

                    {/* Acciones */}
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onPreview({
                          code: item.code,
                          description: item.description,
                          costoListaUnit: item.costoListaUnit
                        })}
                        disabled={tasaBCV <= 0}
                        title={tasaBCV <= 0 ? "Ingrese la Tasa BCV para previsualizar" : "Ver previsualización"}
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
