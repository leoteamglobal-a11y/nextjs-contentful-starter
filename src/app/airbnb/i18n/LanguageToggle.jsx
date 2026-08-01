'use client';

import { useLang } from './context.jsx';

export function LanguageToggle({ className = '' }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`inline-flex items-center rounded-full border border-gray-200 bg-white p-0.5 text-xs font-semibold ${className}`}>
      {['es', 'en'].map((code) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`px-2.5 py-1 rounded-full transition ${
            lang === code ? 'bg-rose-600 text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
