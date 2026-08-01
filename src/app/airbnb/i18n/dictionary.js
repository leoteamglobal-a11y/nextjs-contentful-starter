// Diccionario bilingüe (ES / EN) del sistema de co-hosting para Miami-Dade y Broward.
// Contenido basado en el estudio de mercado (datos 2024–2026).

export const dictionary = {
  es: {
    brand: { pro: 'CoHost', suffix: 'Pro' },
    brandTag: 'Co-hosting profesional de Airbnb · Miami-Dade y Broward',
    nav: { how: 'Cómo funciona', calc: 'Calculadora', rules: 'Regulación', panel: 'Panel', cta: 'Evaluación gratis' },

    hero: {
      badge: 'Co-hosting de Airbnb en el Sur de Florida',
      title: 'Tu propiedad en Miami, generando ingresos —',
      titleAccent: 'sin que muevas un dedo.',
      subtitle:
        'Administramos tu Airbnb en Miami-Dade y Broward de principio a fin: precios, huéspedes, limpieza y — lo más importante aquí — el cumplimiento legal. Tú cobras cada mes; nosotros hacemos todo por una comisión transparente.',
      ctaPrimary: 'Solicita tu evaluación gratis',
      ctaSecondary: 'Calcula tu potencial',
    },

    market: {
      heading: 'Un mercado de los mejores de EE. UU.',
      sub: 'Miami-Dade y Broward reciben casi 50 millones de visitantes al año. La demanda existe; la diferencia la hace una buena gestión.',
      stats: [
        { value: '28.3M', label: 'visitantes/año en Miami-Dade' },
        { value: '~21M', label: 'visitantes/año en Broward' },
        { value: '$210–375', label: 'tarifa por noche según zona' },
        { value: '50–68%', label: 'ocupación típica' },
      ],
      source: 'Fuentes: GMCVB, Visit Lauderdale, AirDNA/AirROI/Airbtics (2024–2026). Cifras de referencia.',
    },

    benefits: {
      heading: '¿Por qué darle tu propiedad a un co-host local?',
      items: [
        { icon: '📈', title: 'Ingresos sin el trabajo', text: 'Tu propiedad produce mientras tú haces tu vida. Sin mensajes a media noche ni limpiezas de última hora.' },
        { icon: '⚖️', title: 'Cumplimiento legal incluido', text: 'Licencias, Certificate of Use, impuestos turísticos y reglas por ciudad. Te mantenemos legal y sin multas.' },
        { icon: '🗣️', title: 'Servicio bilingüe local', text: 'Atención en español e inglés, aquí en el Sur de Florida. Nada de call centers nacionales impersonales.' },
        { icon: '🔍', title: 'Comisión transparente', text: 'Una tarifa clara, sin cargos ocultos, sin contrato de permanencia. Solo ganamos si tú ganas.' },
      ],
    },

    steps: {
      heading: 'Cómo funciona',
      sub: 'Cuatro pasos. Tú te relajas, tu propiedad produce.',
      items: [
        { n: '01', title: 'Evaluación y acuerdo', text: 'Analizamos tu zona y potencial, y firmamos un acuerdo simple. Tú mantienes el control de tu propiedad.' },
        { n: '02', title: 'Legal y listo', text: 'Tramitamos licencias y registros (DBPR, Certificate of Use, impuestos) y optimizamos el anuncio.' },
        { n: '03', title: 'Operamos todo', text: 'Precios dinámicos, huéspedes, check-in, limpieza y reseñas. De principio a fin.' },
        { n: '04', title: 'Cobras cada mes', text: 'Recibes tu depósito con un reporte claro. Nuestra comisión sale solo de reservas reales.' },
      ],
    },

    calc: {
      heading: '¿Cuánto puede generar tu propiedad?',
      sub: 'Elige tu zona en Miami-Dade o Broward y ajusta los valores. Verás tu ingreso estimado y nuestra comisión transparente.',
      county: 'Condado',
      counties: { 'miami-dade': 'Miami-Dade', broward: 'Broward' },
      neighborhood: 'Zona (autocompleta tarifas)',
      neighborhoodCustom: 'Personalizado',
      rate: 'Tarifa por noche',
      occupancy: 'Ocupación',
      commission: 'Nuestra comisión',
      costs: 'Costos mensuales (limpieza, servicios)',
      tagRestricted: 'Zona con reglas STR estrictas — ver Regulación',
      tagOk: 'Zona generalmente permisiva',
      resGross: 'Ingreso bruto de la propiedad',
      resCommission: 'Nuestra comisión',
      resCosts: 'Costos operativos',
      resNet: 'Tu ingreso neto mensual',
      resNights: 'Noches ocupadas al mes',
      resYear: 'al año, sin que tú operes nada',
      note: 'Estimación de referencia según datos de mercado 2024–2026. Los números reales dependen de tu propiedad, zona y temporada. En la evaluación gratuita calculamos tu potencial exacto.',
    },

    pricing: {
      heading: 'Precio justo y transparente',
      sub: 'La competencia cobra del 15% al 50%, muchas veces con cargos ocultos. Nosotros no.',
      plans: [
        { name: 'Esencial', pct: '15%', ideal: 'Dueños que ya operan y solo quieren apoyo en anuncio y precios.', feats: ['Anuncio y precios dinámicos', 'Distribución multi-plataforma', 'Reporte mensual'], hi: false },
        { name: 'Full Management', pct: '18%', ideal: 'Quieres que hagamos absolutamente todo, incluido el compliance.', feats: ['Todo lo de Esencial', 'Huéspedes 24/7 bilingüe', 'Limpieza y check-in', 'Licencias e impuestos', 'Gestión de reseñas'], hi: true },
        { name: 'Premium', pct: '22%', ideal: 'Propiedades de lujo con atención dedicada.', feats: ['Todo lo de Full', 'Fotografía profesional', 'Staging y amenities', 'Gerente de cuenta dedicado'], hi: false },
      ],
      popular: 'MÁS POPULAR',
      note: 'Sin cargo de alta. Sin contrato de permanencia. Comisión solo sobre reservas reales.',
    },

    compliance: {
      heading: 'Legal en el Sur de Florida, sin dolores de cabeza',
      sub: 'Las reglas de alquiler a corto plazo cambian de ciudad a ciudad y son de las más estrictas del país. Este es tu mapa — y nosotros lo tramitamos por ti.',
      disclaimer: 'Información general con fines educativos, no asesoría legal. Las reglas cambian y varían según la propiedad; verifica con cada autoridad. Última síntesis: 2026.',
      taxHeading: 'Impuestos turísticos',
      taxes: [
        { area: 'Miami-Dade', value: '~13%', note: '6% estatal + 1% sobretasa + 6% del condado. El anfitrión es responsable aunque la plataforma no lo cobre todo.' },
        { area: 'Broward', value: '~11–13%', note: '6% estatal + 6% Tourist Development Tax + 1% sobretasa. Se remite directo al condado.' },
        { area: 'Miami Beach', value: '+4%', note: 'Resort tax municipal propio. El # de licencia y de resort tax debe aparecer en cada anuncio.' },
      ],
      citiesHeading: 'Reglas por ciudad',
      cities: [
        { city: 'Miami Beach', level: 'Muy estricto', tone: 'red', points: ['Mínimo 6 meses en la mayoría de zonas residenciales', 'Alquiler corto solo en zonas MXE, RM-2 y RM-3', 'Multas históricas de $20k–$100k (hoy en disputa legal)'] },
        { city: 'Doral', level: 'Estricto', tone: 'red', points: ['Prohibido menos de 7 días', 'Máximo 3 rentas por año por propiedad', 'Certificate of Use + 6% resort tax'] },
        { city: 'Ciudad de Miami', level: 'Permisivo con reglas', tone: 'amber', points: ['DBPR + Certificate of Use + Business Tax Receipt', 'Prohibido en zonas RM-1, unifamiliar y TH', 'Permitido en zonas T5 y T6'] },
        { city: 'Sunny Isles Beach', level: 'Estricto', tone: 'amber', points: ['Licencia por unidad ($100 registro)', 'Responsable disponible 24/7 + seguro', 'La ciudad monitorea Airbnb/VRBO'] },
        { city: 'Fort Lauderdale', level: 'Permisivo con registro', tone: 'green', points: ['Registro de $350 (incluye 2 inspecciones)', 'Renovación $160 / $80 según ocupación', 'Certificado de cumplimiento tras inspección'] },
        { city: 'Hollywood', level: 'Permisivo con registro', tone: 'green', points: ['Licencias estatal + condado + ciudad', 'Impuesto combinado ~13%', 'Uno de los mejores mercados de Broward'] },
      ],
      checklistHeading: 'Checklist para operar legal',
      checklist: [
        'Confirmar la zonificación antes de todo',
        'Licencia estatal DBPR (vacation rental)',
        'Registro de impuesto estatal (FL DOR)',
        'Cuenta de impuesto turístico del condado',
        'Certificate of Use (Miami-Dade)',
        'Registro / licencia de la ciudad',
        'Business Tax Receipt(s)',
        'Inspección de seguridad + seguro STR',
      ],
      cta: 'Nosotros tramitamos todo esto por ti',
    },

    lead: {
      heading: 'Empieza hoy, sin costo inicial',
      sub: 'Solicita una evaluación gratuita de tu propiedad. Analizamos tu zona, estimamos tus ingresos y te decimos exactamente cómo trabajaríamos juntos.',
      bullets: ['Evaluación de mercado sin costo', 'Cumplimiento legal incluido', 'Comisión transparente desde 15%', 'Servicio bilingüe local'],
      formTitle: 'Solicita tu evaluación gratuita',
      formSub: 'Déjanos tus datos y te decimos cuánto puede generar tu propiedad.',
      name: 'Nombre completo *',
      contact: 'Teléfono o email *',
      city: 'Ciudad / zona',
      properties: '¿Cuántas propiedades?',
      message: 'Cuéntanos sobre tu propiedad (opcional)',
      messagePlaceholder: 'Condo de 2 recámaras en Brickell, actualmente vacío...',
      submit: 'Quiero mi evaluación gratis',
      sending: 'Enviando…',
      disclaimer: 'Sin compromiso. Respondemos en menos de 24 horas.',
      successTitle: '¡Solicitud recibida!',
      successBody: 'Gracias. Te contactaremos pronto para agendar una llamada y calcular el potencial de tu propiedad.',
      successPanel: 'Ver el panel de gestión →',
      errorPrefix: '⚠️ ',
    },

    footer: { tagline: 'Sistema de co-hosting de Airbnb para Miami-Dade y Broward.', panel: 'Panel de gestión →', calc: 'Calculadora para compartir →' },
  },

  en: {
    brand: { pro: 'CoHost', suffix: 'Pro' },
    brandTag: 'Professional Airbnb co-hosting · Miami-Dade & Broward',
    nav: { how: 'How it works', calc: 'Calculator', rules: 'Regulations', panel: 'Dashboard', cta: 'Free evaluation' },

    hero: {
      badge: 'Airbnb co-hosting in South Florida',
      title: 'Your Miami property, earning income —',
      titleAccent: 'without you lifting a finger.',
      subtitle:
        'We run your Airbnb in Miami-Dade and Broward end to end: pricing, guests, cleaning, and — most importantly here — legal compliance. You get paid every month; we do the work for one transparent commission.',
      ctaPrimary: 'Request your free evaluation',
      ctaSecondary: 'Estimate your potential',
    },

    market: {
      heading: 'One of the strongest markets in the U.S.',
      sub: 'Miami-Dade and Broward welcome nearly 50 million visitors a year. The demand is there; great management makes the difference.',
      stats: [
        { value: '28.3M', label: 'visitors/yr in Miami-Dade' },
        { value: '~21M', label: 'visitors/yr in Broward' },
        { value: '$210–375', label: 'nightly rate by area' },
        { value: '50–68%', label: 'typical occupancy' },
      ],
      source: 'Sources: GMCVB, Visit Lauderdale, AirDNA/AirROI/Airbtics (2024–2026). Reference figures.',
    },

    benefits: {
      heading: 'Why hand your property to a local co-host?',
      items: [
        { icon: '📈', title: 'Income without the work', text: 'Your property earns while you live your life. No midnight messages, no last-minute cleanings.' },
        { icon: '⚖️', title: 'Compliance included', text: 'Licenses, Certificate of Use, tourist taxes and city-by-city rules. We keep you legal and fine-free.' },
        { icon: '🗣️', title: 'Local bilingual service', text: 'Support in English and Spanish, right here in South Florida. No impersonal national call centers.' },
        { icon: '🔍', title: 'Transparent commission', text: 'One clear rate, no hidden fees, no lock-in contract. We only earn when you earn.' },
      ],
    },

    steps: {
      heading: 'How it works',
      sub: 'Four steps. You relax, your property earns.',
      items: [
        { n: '01', title: 'Evaluation & agreement', text: 'We analyze your area and potential, then sign a simple agreement. You keep full control of your property.' },
        { n: '02', title: 'Legal & ready', text: 'We handle licenses and registrations (DBPR, Certificate of Use, taxes) and optimize the listing.' },
        { n: '03', title: 'We run everything', text: 'Dynamic pricing, guests, check-in, cleaning and reviews. End to end.' },
        { n: '04', title: 'You get paid monthly', text: 'You receive your payout with a clear report. Our commission comes only from real bookings.' },
      ],
    },

    calc: {
      heading: 'How much could your property earn?',
      sub: 'Pick your area in Miami-Dade or Broward and adjust the values. See your estimated income and our transparent commission.',
      county: 'County',
      counties: { 'miami-dade': 'Miami-Dade', broward: 'Broward' },
      neighborhood: 'Area (auto-fills rates)',
      neighborhoodCustom: 'Custom',
      rate: 'Nightly rate',
      occupancy: 'Occupancy',
      commission: 'Our commission',
      costs: 'Monthly costs (cleaning, utilities)',
      tagRestricted: 'Area with strict STR rules — see Regulations',
      tagOk: 'Generally permissive area',
      resGross: 'Property gross income',
      resCommission: 'Our commission',
      resCosts: 'Operating costs',
      resNet: 'Your monthly net income',
      resNights: 'Booked nights per month',
      resYear: 'per year, without you operating anything',
      note: 'Reference estimate based on 2024–2026 market data. Actual numbers depend on your property, area and season. In the free evaluation we calculate your exact potential.',
    },

    pricing: {
      heading: 'Fair, transparent pricing',
      sub: 'Competitors charge 15% to 50%, often with hidden fees. We don’t.',
      plans: [
        { name: 'Essential', pct: '15%', ideal: 'Owners already operating who just want listing and pricing help.', feats: ['Listing & dynamic pricing', 'Multi-platform distribution', 'Monthly report'], hi: false },
        { name: 'Full Management', pct: '18%', ideal: 'You want us to do absolutely everything, compliance included.', feats: ['Everything in Essential', '24/7 bilingual guest support', 'Cleaning & check-in', 'Licensing & taxes', 'Review management'], hi: true },
        { name: 'Premium', pct: '22%', ideal: 'Luxury properties with dedicated attention.', feats: ['Everything in Full', 'Professional photography', 'Staging & amenities', 'Dedicated account manager'], hi: false },
      ],
      popular: 'MOST POPULAR',
      note: 'No setup fee. No lock-in contract. Commission only on real bookings.',
    },

    compliance: {
      heading: 'Legal in South Florida, no headaches',
      sub: 'Short-term rental rules change city by city and are among the strictest in the country. Here’s your map — and we handle it for you.',
      disclaimer: 'General educational information, not legal advice. Rules change and vary by property; verify with each authority. Last synthesis: 2026.',
      taxHeading: 'Tourist taxes',
      taxes: [
        { area: 'Miami-Dade', value: '~13%', note: '6% state + 1% surtax + 6% county bundle. The host is liable even if the platform doesn’t collect it all.' },
        { area: 'Broward', value: '~11–13%', note: '6% state + 6% Tourist Development Tax + 1% surtax. Remitted directly to the county.' },
        { area: 'Miami Beach', value: '+4%', note: 'Its own municipal resort tax. License # and resort tax # must appear in every listing.' },
      ],
      citiesHeading: 'Rules by city',
      cities: [
        { city: 'Miami Beach', level: 'Very strict', tone: 'red', points: ['6-month minimum in most residential zones', 'Short stays only in MXE, RM-2 and RM-3 zones', 'Historic fines of $20k–$100k (currently in litigation)'] },
        { city: 'Doral', level: 'Strict', tone: 'red', points: ['Under 7 days prohibited', 'Max 3 rentals per year per property', 'Certificate of Use + 6% resort tax'] },
        { city: 'City of Miami', level: 'Permissive with rules', tone: 'amber', points: ['DBPR + Certificate of Use + Business Tax Receipt', 'Banned in RM-1, single-family and TH zones', 'Allowed in T5 and T6 zones'] },
        { city: 'Sunny Isles Beach', level: 'Strict', tone: 'amber', points: ['License per unit ($100 registration)', '24/7 responsible party + insurance', 'City monitors Airbnb/VRBO'] },
        { city: 'Fort Lauderdale', level: 'Permissive with registration', tone: 'green', points: ['$350 registration (includes 2 inspections)', 'Renewal $160 / $80 by occupancy', 'Certificate of compliance after inspection'] },
        { city: 'Hollywood', level: 'Permissive with registration', tone: 'green', points: ['State + county + city licensing', 'Combined tax ~13%', 'One of Broward’s top markets'] },
      ],
      checklistHeading: 'Checklist to operate legally',
      checklist: [
        'Confirm zoning before anything',
        'State DBPR vacation-rental license',
        'State tax registration (FL DOR)',
        'County tourist-tax account',
        'Certificate of Use (Miami-Dade)',
        'City registration / license',
        'Business Tax Receipt(s)',
        'Safety inspection + STR insurance',
      ],
      cta: 'We handle all of this for you',
    },

    lead: {
      heading: 'Start today, no upfront cost',
      sub: 'Request a free evaluation of your property. We analyze your area, estimate your income and tell you exactly how we’d work together.',
      bullets: ['Free market evaluation', 'Compliance included', 'Transparent commission from 15%', 'Local bilingual service'],
      formTitle: 'Request your free evaluation',
      formSub: 'Leave your details and we’ll tell you how much your property could earn.',
      name: 'Full name *',
      contact: 'Phone or email *',
      city: 'City / area',
      properties: 'How many properties?',
      message: 'Tell us about your property (optional)',
      messagePlaceholder: '2-bedroom condo in Brickell, currently vacant...',
      submit: 'Get my free evaluation',
      sending: 'Sending…',
      disclaimer: 'No obligation. We reply within 24 hours.',
      successTitle: 'Request received!',
      successBody: 'Thank you. We’ll contact you soon to schedule a call and calculate your property’s potential.',
      successPanel: 'Open the management dashboard →',
      errorPrefix: '⚠️ ',
    },

    footer: { tagline: 'Airbnb co-hosting system for Miami-Dade & Broward.', panel: 'Management dashboard →', calc: 'Shareable calculator →' },
  },
};
