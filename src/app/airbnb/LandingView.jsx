'use client';

import Link from 'next/link';
import { Calculator, LeadForm } from './LandingClient.jsx';
import { useLang } from './i18n/context.jsx';
import { LanguageToggle } from './i18n/LanguageToggle.jsx';

const CALC_URL = 'https://claude.ai/code/artifact/ee9b1292-8fdb-41a0-a127-aa9c3e9c343b';

export default function LandingView() {
  const { t } = useLang();

  return (
    <main className="text-gray-900 bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between max-w-6xl px-6 py-4 mx-auto">
          <span className="text-xl font-extrabold text-rose-600">
            {t('brand.pro')}<span className="text-gray-900">{t('brand.suffix')}</span>
          </span>
          <nav className="flex items-center gap-3 text-sm font-medium sm:gap-4">
            <a href="#como-funciona" className="hidden text-gray-600 sm:inline hover:text-rose-600">{t('nav.how')}</a>
            <a href="#calculadora" className="hidden text-gray-600 sm:inline hover:text-rose-600">{t('nav.calc')}</a>
            <a href="#regulacion" className="hidden text-gray-600 sm:inline hover:text-rose-600">{t('nav.rules')}</a>
            <Link href="/airbnb/panel" className="hidden text-gray-600 sm:inline hover:text-rose-600">{t('nav.panel')}</Link>
            <LanguageToggle />
            <a href="#contacto" className="px-4 py-2 text-white transition rounded-lg bg-rose-600 hover:bg-rose-500">{t('nav.cta')}</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 py-20 sm:py-28 bg-gradient-to-b from-rose-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-4 py-1 mb-6 text-sm font-semibold rounded-full text-rose-700 bg-rose-100">{t('hero.badge')}</span>
          <h1 className="text-4xl font-extrabold leading-tight text-balance sm:text-6xl">
            {t('hero.title')} <span className="text-rose-600">{t('hero.titleAccent')}</span>
          </h1>
          <p className="max-w-2xl mx-auto mt-6 text-lg text-gray-600">{t('hero.subtitle')}</p>
          <div className="flex flex-col justify-center gap-4 mt-8 sm:flex-row">
            <a href="#contacto" className="px-8 py-4 text-lg font-semibold text-white transition rounded-lg bg-rose-600 hover:bg-rose-500">{t('hero.ctaPrimary')}</a>
            <a href="#calculadora" className="px-8 py-4 text-lg font-semibold transition border-2 border-gray-300 rounded-lg hover:border-rose-600 hover:text-rose-600">{t('hero.ctaSecondary')}</a>
          </div>
        </div>
      </section>

      {/* Market stats */}
      <section className="px-6 py-16 text-white bg-gray-900">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">{t('market.heading')}</h2>
          <p className="max-w-2xl mx-auto mt-3 text-gray-400">{t('market.sub')}</p>
          <div className="grid gap-6 mt-10 sm:grid-cols-4">
            {t('market.stats').map((s, i) => (
              <div key={i}>
                <div className="text-3xl font-extrabold text-rose-400 sm:text-4xl">{s.value}</div>
                <div className="mt-1 text-sm text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-xs text-gray-600">{t('market.source')}</p>
        </div>
      </section>

      {/* Benefits */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center sm:text-4xl">{t('benefits.heading')}</h2>
          <div className="grid gap-8 mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {t('benefits.items').map((b, i) => (
              <div key={i} className="p-6 transition border border-gray-100 shadow-sm rounded-2xl hover:shadow-md">
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
          <h2 className="text-3xl font-bold text-center sm:text-4xl">{t('steps.heading')}</h2>
          <p className="mt-3 text-center text-gray-600">{t('steps.sub')}</p>
          <div className="grid gap-6 mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {t('steps.items').map((s, i) => (
              <div key={i} className="p-6 bg-white shadow-sm rounded-2xl">
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
          <h2 className="text-3xl font-bold text-center sm:text-4xl">{t('calc.heading')}</h2>
          <p className="max-w-2xl mx-auto mt-3 mb-12 text-center text-gray-600">{t('calc.sub')}</p>
          <Calculator />
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center sm:text-4xl">{t('pricing.heading')}</h2>
          <p className="mt-3 mb-12 text-center text-gray-600">{t('pricing.sub')}</p>
          <div className="grid gap-6 md:grid-cols-3">
            {t('pricing.plans').map((p, i) => (
              <div key={i} className={`p-6 rounded-2xl border ${p.hi ? 'bg-rose-600 text-white border-rose-600 shadow-xl md:-translate-y-2' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  {p.hi && <span className="px-2 py-0.5 text-xs font-bold rounded bg-rose-800">{t('pricing.popular')}</span>}
                </div>
                <p className={`mt-2 ${p.hi ? 'text-rose-100' : 'text-gray-500'}`}>
                  <span className={`text-4xl font-extrabold ${p.hi ? 'text-white' : 'text-rose-600'}`}>{p.pct}</span>
                </p>
                <p className={`mt-2 text-sm ${p.hi ? 'text-rose-100' : 'text-gray-600'}`}>{p.ideal}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {p.feats.map((f, j) => (
                    <li key={j} className="flex gap-2">
                      <span className={p.hi ? 'text-white' : 'text-rose-600'}>✓</span>{f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-center text-gray-500">{t('pricing.note')}</p>
        </div>
      </section>

      {/* Compliance / Regulations */}
      <section id="regulacion" className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center sm:text-4xl">{t('compliance.heading')}</h2>
          <p className="max-w-3xl mx-auto mt-3 text-center text-gray-600">{t('compliance.sub')}</p>

          {/* Taxes */}
          <h3 className="mt-12 mb-4 text-sm font-bold tracking-wide text-gray-500 uppercase">{t('compliance.taxHeading')}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {t('compliance.taxes').map((tx, i) => (
              <div key={i} className="p-5 border border-gray-100 shadow-sm rounded-2xl">
                <div className="flex items-baseline justify-between">
                  <span className="font-bold">{tx.area}</span>
                  <span className="text-2xl font-extrabold text-rose-600">{tx.value}</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">{tx.note}</p>
              </div>
            ))}
          </div>

          {/* Cities */}
          <h3 className="mt-12 mb-4 text-sm font-bold tracking-wide text-gray-500 uppercase">{t('compliance.citiesHeading')}</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {t('compliance.cities').map((c, i) => (
              <div key={i} className="p-5 border border-gray-100 shadow-sm rounded-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold">{c.city}</h4>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${toneCls(c.tone)}`}>{c.level}</span>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-gray-600">
                  {c.points.map((pt, j) => (
                    <li key={j} className="flex gap-2"><span className="text-gray-400">•</span>{pt}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Checklist */}
          <div className="grid gap-8 mt-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h3 className="mb-4 text-sm font-bold tracking-wide text-gray-500 uppercase">{t('compliance.checklistHeading')}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {t('compliance.checklist').map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-rose-600">✓</span>{item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-6 text-white bg-gray-900 rounded-2xl">
              <p className="text-lg font-bold">{t('compliance.cta')}</p>
              <a href="#contacto" className="inline-block px-6 py-3 mt-4 font-semibold text-white transition rounded-lg bg-rose-600 hover:bg-rose-500">{t('hero.ctaPrimary')}</a>
            </div>
          </div>

          <p className="mt-8 text-xs text-center text-gray-400">{t('compliance.disclaimer')}</p>
        </div>
      </section>

      {/* Contact / Lead form */}
      <section id="contacto" className="px-6 py-20 bg-gradient-to-b from-white to-rose-50">
        <div className="grid max-w-6xl gap-12 mx-auto lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">{t('lead.heading')}</h2>
            <p className="mt-4 text-lg text-gray-600">{t('lead.sub')}</p>
            <ul className="mt-6 space-y-3 text-gray-700">
              {t('lead.bullets').map((item, i) => (
                <li key={i} className="flex items-start gap-3"><span className="text-rose-600">✓</span>{item}</li>
              ))}
            </ul>
          </div>
          <LeadForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-10 text-sm text-center text-gray-400 border-t border-gray-100">
        <p>{t('brand.pro')}{t('brand.suffix')} — {t('footer.tagline')}</p>
        <p className="flex flex-wrap justify-center gap-4 mt-3">
          <Link href="/airbnb/panel" className="text-rose-600 hover:underline">{t('footer.panel')}</Link>
          <a href={CALC_URL} target="_blank" rel="noopener noreferrer" className="text-rose-600 hover:underline">{t('footer.calc')}</a>
        </p>
      </footer>
    </main>
  );
}

function toneCls(tone) {
  if (tone === 'red') return 'bg-red-100 text-red-700';
  if (tone === 'amber') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}
