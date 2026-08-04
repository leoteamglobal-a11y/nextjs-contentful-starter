import { LanguageProvider } from './i18n/context.jsx';
import { dictionary } from './i18n/dictionary.js';

// Envuelve toda la sección /airbnb en el proveedor de idioma (EN/ES).
export default function AirbnbLayout({ children }) {
  return <LanguageProvider dictionary={dictionary}>{children}</LanguageProvider>;
}
