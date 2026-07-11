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

## 🎯 Prioridad de adopción (productor)
1. **Subtítulos quemados** (KillerSubtitles / captions-cli) — impacto directo en retención, bajo esfuerzo.
2. **Subida + SEO por API** (TriviaUploadAutomation / Notion2Tube) — ahorra tiempo operativo cuando publiquemos en volumen.
3. **Google Trends para el Radar Editorial** (pytrends) — alimenta ideas con datos.
4. **Long→Shorts** (SamurAIGPT) — solo cuando existan los formatos largos.
