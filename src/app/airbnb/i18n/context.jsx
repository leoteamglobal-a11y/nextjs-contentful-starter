'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const LanguageContext = createContext({ lang: 'es', setLang: () => {}, t: (k) => k });

const STORAGE_KEY = 'cohost_lang';

export function LanguageProvider({ children, dictionary }) {
  const [lang, setLangState] = useState('es');

  // Detecta idioma guardado o del navegador (una sola vez, en cliente).
  useEffect(() => {
    let initial = 'es';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'es') {
        initial = saved;
      } else if (typeof navigator !== 'undefined' && navigator.language) {
        initial = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es';
      }
    } catch {
      /* localStorage no disponible */
    }
    setLangState(initial);
    try {
      document.documentElement.lang = initial;
    } catch {
      /* noop */
    }
  }, []);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next;
    } catch {
      /* noop */
    }
  }, []);

  // t('a.b.c') resuelve una clave anidada en el diccionario del idioma actual.
  const t = useCallback(
    (key) => {
      const dict = dictionary[lang] || dictionary.es;
      const val = key.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), dict);
      if (val === undefined) {
        // Fallback al español, luego a la propia clave.
        const es = key.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), dictionary.es);
        return es !== undefined ? es : key;
      }
      return val;
    },
    [dictionary, lang],
  );

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}
