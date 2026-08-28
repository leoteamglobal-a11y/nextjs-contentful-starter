import '../../styles/globals.css';

export const metadata = {
  title: 'Aroma World — Estudio de Fórmulas',
  description:
    'Herramienta para crear, gestionar y optimizar fórmulas únicas de fragancia: ingredientes, pirámide olfativa, costos y lotes.',
};

export default async function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
