# 🧰 HERRAMIENTAS OPEN-SOURCE PARA EL DEPTO. DE YOUTUBE

> Curaduría del Productor Ejecutivo. **Aviso clave:** casi todos los repos "faceless automation" generan contenido genérico (stock + TTS robótica) — exactamente lo que NUESTRA marca evita. Por eso: **adoptamos COMPONENTES sueltos, no los pipelines completos.** Nuestra generación premium sigue siendo Flow/Higgsfield/Kling.

Todos son públicos. Antes de usar cualquiera: revisar licencia y no meter claves/API keys en repos ajenos.

---

## ✅ Componentes que SÍ nos sirven (por subrol)

### 🔤 Subtítulos quemados (retención) — Depto YouTube · Post
Los subtítulos en pantalla suben la retención en Shorts. Estos hacen caption estilo TikTok (Whisper + FFmpeg), local y sin SaaS:
- **glenwrhodes/KillerSubtitles** — subtítulos animados palabra por palabra, FFmpeg incluido, cero dependencias. Enfocado y directo.
- **jurczykpawel/captions-cli** — karaoke word-level, Whisper + ffmpeg/libass.

### ⏫ Subida y programación (YouTube Data API) — Publicación
Patrón de subir/programar/etiquetar con la API oficial (referencia para automatizar nuestra ficha de publicación):
- **jadnell555/Notion2Tube** — sube, programa y trackea Shorts desde Notion vía YouTube Data API.
- **Chochi1/TriviaUploadAutomation** — automatiza subida + **SEO** (descripciones, tags) para contenido de **trivia/datos** (¡nuestro género!). Buen molde de metadatos.

### 🔭 Radar Editorial (tendencias) — el rol nuevo del Concilio
- **Dark2C/Viral-Faceless-Shorts-Generator** — ignora su generador de video, pero trae **scraper de Google Trends** (y `pytrends`) útil para detectar temas que suben. Alimenta `ideas/database.md`.

### 🪜 Escalera de contenido (1 largo → varios Shorts) — Nivel C→A
Cuando hagamos formato largo (Nivel B/C) y queramos sacar Shorts automáticamente:
- **SamurAIGPT/AI-Youtube-Shorts-Generator** (4.2k★) — corta long-form en 9:16 con Whisper + detección de momentos destacados por LLM. Alternativa libre a OpusClip. El más sólido y mantenido de la lista.

### 📚 Directorio para minar más adelante
- **sasharun/awesome-faceless** — lista de 80+ herramientas IA para faceless (TTS, text-to-video, edición). Útil como catálogo.

### 🧩 Referencias de pipeline/batch (arquitectura, no para copiar tal cual)
- **IgorShadurin/app.yumcut.com** (818★) — prompt→video vertical con guion/escenas/voz/subtítulos, batch, hooks de API. Buena referencia de arquitectura self-hosted.
- **leamsigc/ShortsGenerator** (325★) — automatización local (Nuxt/Python).

---

## ❌ Lo que NO adoptamos (y por qué)
Los generadores "todo-en-uno" faceless (auto-script + stock + TTS + auto-upload) producen contenido plano y sin alma — el opuesto de "mini-documental Netflix". Usarlos nos metería en el mar de slop del que queremos diferenciarnos. Nuestra ventaja es la **calidad cinematográfica + la voz de marca + la verificación histórica**. Eso no se automatiza con un repo de estos.

## 🧠 CLAUDE SKILLS de optimización viral / growth *(lo que Leo pidió)*

> Estas son **skills instalables** que Claude (yo) puede usar dentro del estudio para optimizar títulos, ganchos, miniaturas, SEO y detección de tendencias. Aviso de productor: hay muchas "granjas de skills" genéricas — cribamos por calidad y encaje con nuestra marca.

### Los mejores (por reputación y encaje)
- **zubair-trabzada/ai-marketing-claude** (2.1k★) — suite de 15 skills de marketing para Claude Code con subagentes: copy, calendarios de contenido, **inteligencia competitiva**, reportes. El más sólido.
- **kostja94/marketing-skills** (725★) — **160+ skills** de SEO, contenido, canales y estrategias. Sin lock-in. Mina de oro para el Depto de YouTube.
- **OpenClaudia/openclaudia-skills** (559★) — 34 skills de SEO, contenido, growth y analítica.
- **minhnv0807/ai-business-skills** (489★) — skills bilingües con **región LATAM** — encaja con la serie insignia S3 y el público hispano.
- **bradautomates/head-of-content** (138★) — research de contenido para redes; para el **Radar Editorial**.
- **AzkiVIP/creator-growth-suite** — skills específicas de oportunidades de contenido + optimización de **miniatura/título/CTR** (poco probada pero justo en el tema).

### Directorios para minar
- **ComposioHQ/awesome-claude-skills** (67k★) y **VoltAgent/awesome-agent-skills** (28k★) — catálogos enormes de skills.

### ⚡ Lo que ya tienes SIN instalar nada (importante)
El **Filtro de Viralidad** (agente 14) puede usar el **predictor de viralidad de Higgsfield** que ya está conectado en la sesión: analiza fuerza del gancho, retención y atención sobre un video real. Para *predecir* viralidad, esa es la mejor opción; las skills de arriba son para *optimizar* el empaquetado (títulos, ganchos, SEO, tendencias).

### 🎯 Mi recomendación (productor)
1. Para **predecir** viralidad de un video montado → **Higgsfield virality_predictor** (ya conectado, cero instalación).
2. Para **optimizar** títulos/ganchos/SEO/tendencias → cherry-pick de **ai-marketing-claude** + **marketing-skills**. No instalar todo (gobernanza: solo lo que aporte).
3. Puedo **instalar 1-2 skills concretas** en `.claude/skills/` del repo si quieres probarlas dentro del estudio.

---

## 🎯 Prioridad de adopción (productor)
1. **Subtítulos quemados** (KillerSubtitles / captions-cli) — impacto directo en retención, bajo esfuerzo.
2. **Subida + SEO por API** (TriviaUploadAutomation / Notion2Tube) — ahorra tiempo operativo cuando publiquemos en volumen.
3. **Google Trends para el Radar Editorial** (pytrends) — alimenta ideas con datos.
4. **Long→Shorts** (SamurAIGPT) — solo cuando existan los formatos largos.
