'use client';

import { useCallback, useEffect, useState } from 'react';

// Hook de persistencia en localStorage. Cada colección del CRM vive bajo su propia clave.
export function useCollection(key) {
  const storageKey = `airbnb_crm_${key}`;
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
    setLoaded(true);
  }, [storageKey]);

  const persist = useCallback(
    (next) => {
      setItems(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* almacenamiento no disponible */
      }
    },
    [storageKey],
  );

  const add = useCallback((item) => persist([{ id: newId(), ...item }, ...itemsRef(storageKey)]), [persist, storageKey]);
  const update = useCallback(
    (id, patch) => persist(itemsRef(storageKey).map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [persist, storageKey],
  );
  const remove = useCallback((id) => persist(itemsRef(storageKey).filter((it) => it.id !== id)), [persist, storageKey]);

  return { items, loaded, add, update, remove, setAll: persist };
}

// Lee el estado más reciente desde localStorage para evitar cierres obsoletos en callbacks.
function itemsRef(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch {
    return [];
  }
}

let counter = 0;
function newId() {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}
