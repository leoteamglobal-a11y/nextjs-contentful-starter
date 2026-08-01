import Link from 'next/link';
import { Calculator, LeadForm } from './LandingClient.jsx';

export const metadata = {
  title: 'CoHost Pro — Genera ingresos con Airbnb sin ser dueño',
  description:
    'Administramos tu propiedad en Airbnb por ti. Tú ganas, nosotros nos encargamos de todo. Servicio de co-hosting profesional.',
};

const steps = [
  { n: '01', title: 'Nos das acceso', text: 'Firmamos un acuerdo simple de administración. Tú sigues siendo el dueño; nosotros operamos.' },
  { n: '02', title: 'Optimizamos el anuncio', text: 'Fotos, descripción, precios dinámicos y calendario. Tu propiedad lista para reservar.' },
  { n: '03', title: 'Gestionamos huéspedes', text: 'Check-in, mensajes, limpieza y reseñas. Cero estrés para ti.' },
  { n: '04', title: 'Tú cobras cada mes', text: 'Recibes tu depósito mensual. Nosotros solo cobramos una comisión sobre lo generado.' },
];

const benefits = [
  { icon: '📈', title: 'Ingresos pasivos reales', text: 'Tu propiedad trabaja mientras tú haces tu vida. Sin llamadas a media noche.' },
  { icon: '🔑', title: 'Sin invertir tu tiempo', text: 'Nos encargamos de la operación completa, de principio a fin.' },
  { icon: '⭐', title: 'Más reservas, mejores reseñas', text: 'Precios dinámicos y atención profesional que suben tu ocupación.' },
  { icon: '🛡️', title: 'Solo ganamos si tú ganas', text: 'Cobramos comisión sobre reservas reales. Nuestro incentivo es tu rendimiento.' },
];

export default function AirbnbLanding() {
  return (
    <main className="text-gray-900 bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between max-w-6xl px-6 py-4 mx-auto">
          <span className="text-xl font-extrabold text-rose-600">CoHost<span className="text-gray-900">Pro</span></span>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <a href="#como-funciona" className="hidden text-gray-600 sm:inline hover:text-rose-600">Cómo funciona</a>
            <a href="#calculadora" className="hidden text-gray-600 sm:inline hover:text-rose-600">Calculadora</a>
            <Link href="/airbnb/panel" className="text-gray-600 hover:text-rose-600">Panel</Link>
            <a href="#contacto" className="px-4 py-2 text-white transition rounded-lg bg-rose-600 hover:bg-rose-500">
              Solicitar evaluación
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 py-20 sm:py-28 bg-gradient-to-b from-rose-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-4 py-1 mb-6 text-sm font-semibold rounded-full text-rose-700 bg-rose-100">
            Co-hosting profesional de Airbnb
          </span>
          <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">
            Convierte tu propiedad en <span className="text-rose-600">ingresos mensuales</span>, sin mover un dedo.
          </h1>
          <p className="max-w-2xl mx-auto mt-6 text-lg text-gray-600">
            Administramos tu departamento o casa en Airbnb de principio a fin. Tú eres el dueño, tú cobras cada mes,
            nosotros hacemos todo el trabajo. Solo cobramos una comisión sobre lo que generamos.
          </p>
          <div className="flex flex-col justify-center gap-4 mt-8 sm:flex-row">
            <a href="#contacto" className="px-8 py-4 text-lg font-semibold text-white transition rounded-lg bg-rose-600 hover:bg-rose-500">
              Solicita tu evaluación gratis
            </a>
            <a href="#calculadora" className="px-8 py-4 text-lg font-semibold transition border-2 border-gray-300 rounded-lg hover:border-rose-600 hover:text-rose-600">
              Calcula tu potencial
            </a>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center sm:text-4xl">¿Por qué darle tu propiedad a un co-host?</h2>
          <div className="grid gap-8 mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b) => (
              <div key={b.title} className="p-6 transition border border-gray-100 shadow-sm rounded-2xl hover:shadow-md">
                <div className="mb-4 text-4xl">{b.icon}</div>
                <h3 className="mb-2 text-lg font-bold">{b.title}</h3>
                <p className="text-gray-600">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="px-6 py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center sm:text-4xl">Cómo funciona</h2>
          <p className="mt-3 text-center text-gray-600">Cuatro pasos. Tú te relajas, tu propiedad produce.</p>
          <div className="grid gap-6 mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="p-6 bg-white shadow-sm rounded-2xl">
                <div className="mb-3 text-2xl font-extrabold text-rose-200">{s.n}</div>
                <h3 className="mb-2 font-bold">{s.title}</h3>
                <p className="text-sm text-gray-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Calculator */}
      <section id="calculadora" className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center sm:text-4xl">¿Cuánto puedes ganar?</h2>
          <p className="mt-3 mb-12 text-center text-gray-600">
            Mueve los controles y mira la comisión que generarías administrando una sola propiedad.
          </p>
          <Calculator />
        </div>
      </section>

      {/* Contact / Lead form */}
      <section id="contacto" className="px-6 py-20 bg-gradient-to-b from-white to-rose-50">
        <div className="grid max-w-6xl gap-12 mx-auto lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">Empieza hoy, sin costo inicial</h2>
            <p className="mt-4 text-lg text-gray-600">
              Solicita una evaluación gratuita de tu propiedad. Analizamos tu mercado, estimamos tus ingresos
              potenciales y te explicamos exactamente cómo trabajaríamos juntos.
            </p>
            <ul className="mt-6 space-y-3 text-gray-700">
              {['Evaluación de mercado sin costo', 'Sin permanencia forzosa', 'Comisión solo sobre reservas reales', 'Tú mantienes el control total de tu propiedad'].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="text-rose-600">✓</span>{item}
                </li>
              ))}
            </ul>
          </div>
          <LeadForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-10 text-sm text-center text-gray-400 border-t border-gray-100">
        <p>CoHost Pro — Sistema de co-hosting de Airbnb. Construido con Next.js.</p>
        <p className="mt-2">
          <Link href="/airbnb/panel" className="text-rose-600 hover:underline">Ir al panel de gestión →</Link>
        </p>
      </footer>
    </main>
  );
}
