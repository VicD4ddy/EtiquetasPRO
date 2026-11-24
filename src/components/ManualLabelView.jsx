import React, { useState } from 'react';
import { encodeLUCHAREMOS } from '../utils/encoder';

function getCurrentDateCode() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const y = String(d.getFullYear()).slice(-2);
  return `${m}/${y}`;
}

export default function ManualLabelView({
  tasaBCV,
  registeredProviders = [],
  onPreview,
  onPrintImmediate,
  onPrintList,
  isLoading = false,
  onNotify
}) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [costInput, setCostInput] = useState('');
  const [currency, setCurrency] = useState('USD'); // 'USD' | 'BS'
  const [providerCode, setProviderCode] = useState('00000');
  const [dateCode, setDateCode] = useState(getCurrentDateCode);
  const [quantity, setQuantity] = useState(1);

  const [manualItems, setManualItems] = useState([]);
  const [confirmClearList, setConfirmClearList] = useState(false);

  const parsedInputCost = parseFloat(String(costInput).replace(',', '.')) || 0;
  const effectiveCostUSD = currency === 'USD'
    ? parsedInputCost
    : (tasaBCV > 0 ? parsedInputCost / tasaBCV : 0);
  const effectiveCipher = encodeLUCHAREMOS(effectiveCostUSD);

  const validateForm = () => {
    if (!code.trim()) {
      onNotify && onNotify('Ingresa el código del repuesto.', 'error');
      return false;
    }
    if (currency === 'BS' && tasaBCV <= 0) {
      onNotify && onNotify('Ingresa una Tasa BCV válida arriba para convertir desde Bs.', 'error');
      return false;
    }
    if (effectiveCostUSD <= 0 || !effectiveCipher) {
      onNotify && onNotify('Ingresa un costo válido mayor a 0.', 'error');
      return false;
    }
    if ((parseInt(quantity, 10) || 0) <= 0) {
      onNotify && onNotify('La cantidad debe ser al menos 1.', 'error');
      return false;
    }
    return true;
  };

  const buildCurrentEntry = () => {
    const provMatch = registeredProviders.find(p => p.code === providerCode);
    return {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      code: code.trim(),
      description: description.trim() || 'REPUESTO',
      costUSD: effectiveCostUSD,
      costoListaUnit: currency === 'BS' ? parsedInputCost.toFixed(2).replace('.', ',') : '',
      cipherCode: effectiveCipher,
      providerCode: (providerCode || '00000').trim(),
      providerName: provMatch ? provMatch.name : '',
      dateCode: (dateCode || getCurrentDateCode()).trim(),
      quantity: Math.max(1, parseInt(quantity, 10) || 1)
    };
  };

  const handlePreviewCurrent = () => {
    if (!validateForm()) return;
    const entry = buildCurrentEntry();
    onPreview({
      code: entry.code,
      description: entry.description,
      cipherCode: entry.cipherCode,
      providerCode: entry.providerCode,
      dateCode: entry.dateCode
    });
  };

  const handlePrintNow = async () => {
    if (!validateForm()) return;
    const entry = buildCurrentEntry();
    await onPrintImmediate(entry);
  };

  const handleAddToList = () => {
    if (!validateForm()) return;
    const entry = buildCurrentEntry();
    setManualItems(prev => [...prev, entry]);
    setCode('');
    setDescription('');
    setCostInput('');
    setQuantity(1);
    onNotify && onNotify(`Agregado ${entry.code} (${entry.quantity} etiq.) a la lista manual.`, 'success');
  };

  const handleUpdateListQty = (id, val) => {
    const qty = Math.max(1, parseInt(val, 10) || 1);
    setManualItems(prev => prev.map(item => (item.id === id ? { ...item, quantity: qty } : item)));
  };

  const handleRemoveFromList = (id) => {
    setManualItems(prev => prev.filter(item => item.id !== id));
  };

  const totalListLabels = manualItems.reduce((acc, i) => acc + (i.quantity || 0), 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900 px-6 py-4 gap-4 overflow-hidden select-none">
      {/* Formulario de etiqueta rápida */}
      <div className="border border-slate-800 rounded-xl bg-slate-950/60 p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white">Etiqueta Manual / Suelta</h2>
            <p className="text-xs text-slate-400">
              Imprime un repuesto puntual al instante o arma una lista personalizada sin necesitar factura PDF.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
            <div className="text-xs text-slate-400">
              Costo USD:{' '}
              <strong className="text-white font-mono tabular-nums">
                ${effectiveCostUSD.toFixed(2)}
              </strong>
            </div>
            <div className="h-3.5 w-px bg-slate-800"></div>
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>Cifrado:</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-blue-400 font-mono font-black tracking-wider">
                {effectiveCipher || '---'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Código */}
          <div className="md:col-span-3 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Código del Repuesto *
            </label>
            <input
              type="text"
              placeholder="Ej: BKR 6E"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-white font-mono font-bold outline-none select-text"
            />
          </div>

          {/* Descripción */}
          <div className="md:col-span-5 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Descripción
            </label>
            <input
              type="text"
              placeholder="Ej: BUJIA NGK ESTANDAR"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-white font-semibold outline-none select-text"
            />
          </div>

          {/* Costo + Moneda (USD directo por defecto o Bs) */}
          <div className="md:col-span-4 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Costo Unitario *
            </label>
            <div className="flex items-center gap-1.5">
              <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setCurrency('USD')}
                  className={`px-2 py-1.5 rounded text-[11px] font-bold transition cursor-pointer ${
                    currency === 'USD' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  USD $
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency('BS')}
                  className={`px-2 py-1.5 rounded text-[11px] font-bold transition cursor-pointer ${
                    currency === 'BS' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Bs
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-white font-mono tabular-nums font-bold outline-none select-text"
              />
            </div>
          </div>

          {/* Proveedor */}
          <div className="md:col-span-6 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Proveedor (Catálogo o Código Manual)
            </label>
            <div className="flex items-center gap-2">
              <select
                value={registeredProviders.some(p => p.code === providerCode) ? providerCode : ''}
                onChange={(e) => {
                  if (e.target.value) setProviderCode(e.target.value);
                }}
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-slate-200 font-semibold outline-none cursor-pointer"
              >
                <option value="">-- Seleccionar del catálogo --</option>
                {registeredProviders.map((p) => (
                  <option key={p.id || p.code} value={p.code}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="00000"
                value={providerCode}
                onChange={(e) => setProviderCode(e.target.value)}
                className="w-24 px-2.5 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-white font-mono font-bold text-center outline-none select-text"
              />
            </div>
          </div>

          {/* Fecha MM/YY */}
          <div className="md:col-span-3 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Fecha (MM/AA)
            </label>
            <input
              type="text"
              placeholder="MM/AA"
              value={dateCode}
              onChange={(e) => setDateCode(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-white font-mono tabular-nums font-bold text-center outline-none select-text"
            />
          </div>

          {/* Cantidad */}
          <div className="md:col-span-3 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Cantidad Etiquetas
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg text-xs text-white font-mono tabular-nums font-bold text-center outline-none select-text"
            />
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={handlePreviewCurrent}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 rounded-xl transition cursor-pointer"
          >
            👁️ Vista Previa
          </button>
          <button
            type="button"
            onClick={handleAddToList}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            + Agregar a la lista
          </button>
          <button
            type="button"
            onClick={handlePrintNow}
            disabled={isLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white disabled:text-slate-500 text-xs font-bold rounded-xl transition cursor-pointer disabled:cursor-not-allowed"
          >
            🖨️ Imprimir ahora ({quantity})
          </button>
        </div>
      </div>

      {/* Lista acumulada de etiquetas manuales */}
      <div className="flex-1 flex flex-col min-h-0 border border-slate-800 rounded-xl bg-slate-900/50 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Lista de Etiquetas Manuales</h3>
            <span className="px-2 py-0.5 text-xs bg-slate-800 border border-slate-700 rounded-full font-mono tabular-nums text-slate-300">
              {manualItems.length} ítems · {totalListLabels} etiq.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {manualItems.length > 0 && (
              confirmClearList ? (
                <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1">
                  <span className="text-[11px] font-bold text-rose-300">¿Vaciar lista?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setManualItems([]);
                      setConfirmClearList(false);
                    }}
                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded cursor-pointer"
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearList(false)}
                    className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[11px] font-semibold rounded cursor-pointer"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearList(true)}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Vaciar lista
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => onPrintList(manualItems)}
              disabled={isLoading || manualItems.length === 0 || totalListLabels === 0}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white disabled:text-slate-500 text-xs font-bold rounded-lg transition cursor-pointer disabled:cursor-not-allowed"
            >
              🖨️ Imprimir Lista ({totalListLabels})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {manualItems.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center p-6 text-center text-slate-500 text-sm">
              No hay ítems en la lista. Usa <strong>+ Agregar a la lista</strong> para acumular varios repuestos o <strong>Imprimir ahora</strong> para una etiqueta puntual.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs text-slate-300">
              <thead className="sticky top-0 bg-slate-950 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3 w-36">Código</th>
                  <th className="py-2 px-3">Descripción</th>
                  <th className="py-2 px-3 w-24 text-center">Prov / Fecha</th>
                  <th className="py-2 px-3 w-24 text-right">USD</th>
                  <th className="py-2 px-3 w-28 text-center">Cifrado</th>
                  <th className="py-2 px-3 w-28 text-center">Cantidad</th>
                  <th className="py-2 px-3 w-28 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {manualItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-mono font-bold text-white">{item.code}</td>
                    <td className="py-2 px-3 text-slate-300">{item.description}</td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums text-slate-400">
                      {item.providerCode} · {item.dateCode}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-200">
                      ${item.costUSD.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono font-black text-blue-400">
                        {item.cipherCode}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleUpdateListQty(item.id, e.target.value)}
                        className="w-16 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-center font-mono tabular-nums font-bold text-white outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPreview(item)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] font-bold text-slate-300 hover:text-white cursor-pointer"
                          title="Previsualizar"
                        >
                          👁️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromList(item.id)}
                          className="px-2 py-1 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 rounded text-[11px] font-bold text-slate-400 hover:text-rose-300 cursor-pointer"
                          title="Quitar de la lista"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
