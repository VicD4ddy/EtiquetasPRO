import React, { useState, useMemo } from 'react';

export default function ProvidersModal({
  isOpen,
  onClose,
  providers = [],
  onSaveProvider,
  onDeleteProvider
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [rif, setRif] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const filteredProviders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q) ||
      (p.rif || '').toLowerCase().includes(q)
    );
  }, [providers, searchQuery]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setRif('');
    setFormError('');
  };

  const handleStartEdit = (prov) => {
    setEditingId(prov.id);
    setName(prov.name || '');
    setCode(prov.code || '');
    setRif(prov.rif || '');
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      setFormError('El nombre y el código del proveedor son obligatorios.');
      return;
    }

    const duplicate = providers.find((p) =>
      p.id !== editingId &&
      (p.code.toLowerCase() === code.trim().toLowerCase() || p.name.toLowerCase() === name.trim().toLowerCase())
    );
    if (duplicate && !editingId) {
      setFormError(`Ya existe "${duplicate.name}" (${duplicate.code}). Edítalo en la lista si deseas actualizarlo.`);
      return;
    }

    setFormError('');
    const ok = await onSaveProvider({
      id: editingId,
      name: name.trim(),
      code: code.trim(),
      rif: rif.trim()
    });
    if (ok) {
      resetForm();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🏢</span> Gestor de Proveedores
            </h3>
            <p className="text-xs text-slate-400">
              Crea, edita o elimina proveedores y sus códigos asociados al RIF.
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

        {/* Formulario Crear / Editar */}
        <form onSubmit={handleSubmit} className="p-5 border-b border-slate-800 bg-slate-950/50 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5 flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Nombre del Proveedor *
              </label>
              <input
                type="text"
                placeholder="Ej: Repuestos Sotomayor, C.A."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg text-xs text-white font-semibold outline-none select-text"
              />
            </div>
            <div className="sm:col-span-3 flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Código *
              </label>
              <input
                type="text"
                placeholder="Ej: 00071"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg text-xs text-white font-mono font-bold outline-none select-text"
              />
            </div>
            <div className="sm:col-span-4 flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                RIF (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: J303261205"
                value={rif}
                onChange={(e) => setRif(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg text-xs text-white font-mono font-bold outline-none select-text"
              />
            </div>
          </div>

          {formError && (
            <div className="text-xs font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-1.5">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg cursor-pointer"
              >
                Cancelar edición
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition cursor-pointer"
            >
              {editingId ? 'Guardar cambios' : '+ Agregar proveedor'}
            </button>
          </div>
        </form>

        {/* Buscador y tabla */}
        <div className="p-5 flex-1 flex flex-col min-h-0 gap-3 overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-400 font-mono tabular-nums">
              {filteredProviders.length} de {providers.length} proveedores
            </span>
            <input
              type="text"
              placeholder="Buscar por nombre, código o RIF..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 px-3 py-1.5 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg text-xs text-white placeholder-slate-500 outline-none select-text"
            />
          </div>

          <div className="flex-1 overflow-auto border border-slate-800 rounded-xl bg-slate-950/40">
            {filteredProviders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No hay proveedores registrados que coincidan.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs text-slate-300">
                <thead className="sticky top-0 bg-slate-950 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Nombre</th>
                    <th className="py-2 px-3 w-28">Código</th>
                    <th className="py-2 px-3 w-32">RIF</th>
                    <th className="py-2 px-3 w-36 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredProviders.map((prov) => (
                    <tr key={prov.id} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-semibold text-white">{prov.name}</td>
                      <td className="py-2 px-3 font-mono font-bold text-blue-300">{prov.code}</td>
                      <td className="py-2 px-3 font-mono text-slate-400">{prov.rif || '---'}</td>
                      <td className="py-2 px-3 text-center">
                        {confirmDeleteId === prov.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                if (editingId === prov.id) resetForm();
                                onDeleteProvider(prov.id);
                              }}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded cursor-pointer"
                            >
                              Borrar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 bg-slate-800 text-slate-300 text-[11px] font-semibold rounded cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(prov)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] font-bold text-slate-200 cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(prov.id)}
                              className="px-2 py-1 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 rounded text-[11px] font-bold text-slate-400 hover:text-rose-300 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
