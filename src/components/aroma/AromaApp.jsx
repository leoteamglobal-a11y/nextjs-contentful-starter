'use client';

import { useEffect, useRef, useState } from 'react';
import FormulaList from './FormulaList';
import FormulaEditor from './FormulaEditor';
import {
  emptyFormula,
  loadFormulas,
  saveFormulas,
  exportFormulas,
  importFormulas,
} from '../../lib/formulas';

export default function AromaApp() {
  const [formulas, setFormulas] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef(null);

  // Cargar desde localStorage al montar.
  useEffect(() => {
    setFormulas(loadFormulas());
    setLoaded(true);
  }, []);

  // Guardar automáticamente en cada cambio (después de la carga inicial).
  useEffect(() => {
    if (loaded) saveFormulas(formulas);
  }, [formulas, loaded]);

  function flash(message) {
    setNotice(message);
    setTimeout(() => setNotice(''), 3000);
  }

  function handleNew() {
    const f = { ...emptyFormula(), createdAt: Date.now(), updatedAt: Date.now() };
    setFormulas((prev) => [f, ...prev]);
    setEditingId(f.id);
  }

  function handleEdit(id) {
    setEditingId(id);
  }

  function handleDelete(id) {
    if (!window.confirm('¿Eliminar esta fórmula? Esta acción no se puede deshacer.')) return;
    setFormulas((prev) => prev.filter((f) => f.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function handleChange(updated) {
    setFormulas((prev) =>
      prev.map((f) => (f.id === updated.id ? { ...updated, updatedAt: Date.now() } : f))
    );
  }

  function handleExport() {
    const blob = new Blob([exportFormulas(formulas)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aroma-world-formulas.json';
    a.click();
    URL.revokeObjectURL(url);
    flash('Respaldo descargado ✓');
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importFormulas(String(reader.result));
        setFormulas((prev) => {
          const existing = new Set(prev.map((f) => f.id));
          const merged = [...prev];
          for (const f of imported) {
            if (existing.has(f.id)) {
              // Reemplaza la versión existente.
              const idx = merged.findIndex((m) => m.id === f.id);
              merged[idx] = f;
            } else {
              merged.push(f);
            }
          }
          return merged;
        });
        flash(`Importadas ${imported.length} fórmula(s) ✓`);
      } catch (err) {
        window.alert('No se pudo importar el archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const editing = formulas.find((f) => f.id === editingId) || null;

  return (
    <main className="min-h-screen">
      <header className="border-b border-sand bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <div>
            <h1 className="font-serif text-2xl tracking-tight text-ink">
              Aroma <span className="text-amber">World</span>
            </h1>
            <p className="text-xs uppercase tracking-[0.2em] text-mocha">Estudio de fórmulas</p>
          </div>
          <div className="text-right text-xs text-mocha">
            <p>Perfumería · Creación &amp; Optimización</p>
          </div>
        </div>
      </header>

      {notice && (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {!loaded ? (
          <p className="text-sm text-mocha">Cargando…</p>
        ) : editing ? (
          <FormulaEditor
            formula={editing}
            onChange={handleChange}
            onBack={() => setEditingId(null)}
          />
        ) : (
          <FormulaList
            formulas={formulas}
            onNew={handleNew}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onExport={handleExport}
            onImport={handleImportClick}
          />
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportFile}
        className="hidden"
      />

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center text-xs text-mocha sm:px-6">
        Tus fórmulas se guardan en este dispositivo. Usa «Exportar respaldo» para no perder tu trabajo.
      </footer>
    </main>
  );
}
