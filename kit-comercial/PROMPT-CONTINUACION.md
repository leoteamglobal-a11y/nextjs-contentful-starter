# 📋 Prompt para continuar CasaHost en Claude Code

> Copia TODO lo que está dentro del bloque de abajo y pégalo al iniciar una sesión nueva de Claude Code.

---

Estoy construyendo **CasaHost**, un negocio de co-hosting / administración de Airbnb en Miami-Dade y Broward. Administro propiedades de otros dueños por una comisión del **18%** (no soy dueño de las propiedades). Marca NO limitada a "Miami" (para no restringir el alcance). Retomamos un proyecto ya muy avanzado — NO empieces de cero, primero lee el estado actual del repo.

**Principio de trabajo:** guíame en todo, pero **cada decisión debe estar estudiada/respaldada con datos** (precios, competencia, regulación, etc.). Explícame las cosas de forma simple porque no tengo conocimientos técnicos.

## Repo y rama
- Repo: `leoteamglobal-a11y/nextjs-contentful-starter`
- Rama de trabajo: `claude/airbnb-income-system-rhi2yz` (desarrolla, commitea y pushea SIEMPRE aquí)
- Sitio premium: `public/casahost.html` (redirección raíz en `next.config.js`). Diseño turquesa/premium, bilingüe ES/EN.
- Panel CRM: `src/app/airbnb/panel/PanelClient.jsx` (con pipeline de Leads).
- Kit comercial: carpeta `kit-comercial/` (contratos .docx, propuesta, pitch deck, sheet de ingresos, playbooks HTML, guiones de venta, compliance por ciudad, estudio de mercado).
- Lee primero: `kit-comercial/PUNTO-DE-GUARDADO.md` para el estado detallado.

## Ya está HECHO
- Web premium bilingüe + 10 páginas por zona + formulario conectado a WhatsApp.
- Panel CRM con pipeline de Leads (nuevo → conversando → evaluación → propuesta → cerrado/perdido).
- Kit comercial completo + 5 playbooks con diseño + calculadora de rentabilidad.
- ZIP con todo el proyecto organizado en carpetas (1-Sitio-Web, 2-Contratos, etc.).
- Assets de marca: logo, portada Facebook HD, 3 publicaciones cuadradas.
- Perfiles creados (guiados): Facebook "CasaHost", Instagram @casahost305, Google Business "Casa Host" (SIN verificar aún).

## Datos clave
- WhatsApp: +1 239 687 0181
- Email negocio: casahost88@gmail.com (también existe casahost305 / casahost88@gmail.com)
- Instagram: @casahost305
- Comisión: 18% todo incluido, sin cargos ocultos.
- Paquetes de la web: 12% / 18% / 24% (validados vs mercado real Miami).

## PENDIENTE (lo que quiero seguir)
1. **Voz del video promo con ElevenLabs** (usa el conector de ElevenLabs que ya tengo activo). Quiero una **voz femenina, dulce, español latino/neutral, natural — NO acento gringo**. El motor "elevenlabs" de Higgsfield suena gringo; usa el ElevenLabs nativo directo. Genera el audio, descárgalo enseguida y entrégamelo como archivo reproducible (el link directo a veces expira o fuerza descarga — evita eso).
   - **Guion aprobado (~18-22s):** "¿Tienes una propiedad en Miami… y no tienes tiempo de rentarla? En CasaHost la administramos de principio a fin: precios, huéspedes, limpieza y permisos. Tú solo cobras cada mes. Dieciocho por ciento, todo incluido, sin cargos ocultos. Pide tu evaluación gratis… con CasaHost."
2. **Generar clips de Miami que faltan** (Higgsfield, 9:16, faceless, auténtico): Coral Gables, Doral, interiores de distintos tipos de propiedad, rooftop pool, distintas vistas. Ya tengo 3 clips (interior de lujo, South Beach, Brickell skyline — ver PUNTO-DE-GUARDADO.md).
3. **Armar el video final**: clips + voz natural + subtítulos → para Instagram/Facebook.
4. **Subir las 3 publicaciones** (una por día) a IG/FB.
5. **Instalar WhatsApp Business** con el número de arriba.
6. **Decidir dominio**: casahost.com está ocupado; opciones estudiadas: casahost.org (~$8.49) o casahoststay.com (~$11).
7. **Verificar Google Business** (con dominio propio o por teléfono/video).
8. **EMPEZAR A PROSPECTAR** dueños y realtors con el pack de mensajes ya creado (referidos: 10% de mi ganancia durante un año, sin mencionar montos en dinero).

## Notas técnicas del entorno
- El proxy de la sesión bloquea la descarga de archivos de Higgsfield (CloudFront) → no puedo bajar esos audios/clips; se reproducen en el widget de Higgsfield. Para ElevenLabs directo, descarga el mp3 inmediatamente antes de que expire el link y entrégalo con el archivo.
- Higgsfield tiene un **límite diario de generaciones**; si se topa, se reinicia al día siguiente.
- Yo (usuario) no puedo escuchar en el chat lo que tú no me entregues como archivo o widget reproducible; y tú no puedes escuchar el audio, así que yo soy el oído: entrégame cada take de forma que yo lo pueda reproducir.

Empieza leyendo `kit-comercial/PUNTO-DE-GUARDADO.md` y `kit-comercial/PROMPT-CONTINUACION.md`, dime en qué punto exacto estamos, y sigamos por el pendiente #1 (la voz con ElevenLabs).
