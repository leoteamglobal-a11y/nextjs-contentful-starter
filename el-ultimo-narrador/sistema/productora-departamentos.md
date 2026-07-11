# 🎬 LA PRODUCTORA — Organigrama de departamentos

> El **Consejo Creativo** (`consejo-creativo.md`) es el comité que aprueba y critica. **La Productora** es la tripulación completa que ejecuta cada área, como un estudio profesional. Cada departamento-agente piensa **como si trabajara en su software real**, aunque la ejecución final sea con IA (Flow/Higgsfield/Kling).

Regla: cada video atraviesa los departamentos en orden. Cada uno entrega su parte al siguiente y **vela por la continuidad**.

---

## 🟦 DESARROLLO

### 📚 Sala de Guionistas (Writers Room)
- **Función:** investigación (Mesa 1), guion (Mesa 3), *script doctor* que pule giro y ritmo.
- **Emula:** Final Draft + sala de escritores.
- **Entrega:** guion de 60s aprobado + verificación 🔎.

### 🗂️ Editorial / Continuidad de Marca
- **Función:** que el guion cumpla la Biblia de marca (voz, tagline, estructura).
- **Entrega:** guion alineado con `biblia-de-marca.md`.

---

## 🟩 PREPRODUCCIÓN

### 🎬 Dirección
- **Función:** visión global, ritmo, tono emocional, decisión creativa por escena.
- **Emula:** el director en el set.

### 🎥 Dirección de Fotografía (DF)
- **Función:** planos, lente (24/35/85mm), movimiento de cámara, luz, paleta (teal-orange), profundidad de campo.
- **Emula:** un DoP con cámara ARRI + esquema de luces.
- **Entrega:** especificación de cámara/luz por escena (va en el storyboard y en el prompt).

### 🎨 Departamento de Arte / Diseño de Producción
- **Función:** el mundo visual — época, props, arquitectura, coherencia histórica.
- **Emula:** concept art + production design.
- **Entrega:** notas de arte + props consistentes por escena.

### 👗 Vestuario
- **Función:** ficha de vestuario fija por personaje y época (parte del `RETRATO`).
- **Emula:** figurinista.
- **Entrega:** descripción de vestuario exacta e invariable → alimenta `personajes.md` (consistencia).

### 🗺️ Localizaciones (Location Scouting)
- **Función:** definir los escenarios (época correcta, atmósfera) reutilizando `escenarios.md`.
- **Emula:** location scout + set dressing.
- **Entrega:** escenario asignado por escena (con su prompt base guardado).

### 🎭 Casting / Personajes
- **Función:** fichas de personajes consistentes; en Flow, crear el *Ingredient* de referencia.
- **Entrega:** `RETRATO` por personaje en `personajes.md`.

### 🖼️ Storyboarding Automático
- **Función:** convertir el guion en storyboard visual (10 viñetas) generando imágenes de referencia por escena.
- **Emula:** storyboard artist + Boords.
- **En nuestro flujo:** genero un frame-clave por escena con IA de imagen → sirve de guía de composición y de *frame inicial* para Flow (Frames to Video).

### 📋 Script / Continuista (Continuity Supervisor) ⭐
- **Función CRÍTICA:** que **nada cambie sin querer** entre planos — mismo rostro, vestuario, props, luz, hora del día, dirección de miradas. El guardián de la consistencia.
- **Emula:** el/la script de rodaje.
- **Entrega:** checklist de continuidad por escena (ej.: "Troffea SIEMPRE descalza y ensangrentada; niebla presente Esc 1-2").

---

## 🟨 PRODUCCIÓN ("rodaje")

### 🎥 Generación de Tomas
- **Función:** generar cada escena con el motor correcto (`herramientas-ia.md`): Flow (Ingredients) base, Higgsfield (cámara), Kling (multitudes).
- **Entrega:** clips crudos por escena + seeds guardadas (para rehacer sin recomponer).

---

## 🟧 AUDIO

### 🔊 Diseño de Sonido / SFX
- **Función:** foley, ambiente, efectos (pasos, viento, multitud). Sincronizados a los cortes.
- **Emula:** sound designer en **Pro Tools**.

### 🎵 Música (Score)
- **Función:** tema según emoción (`musica-sfx.md`), beats, silencio del giro, logo sonoro.
- **Emula:** compositor + Suno/Udio.

### 🎙️ Locución / Narrador
- **Función:** grabar con la **voz oficial fija**.
- **Emula:** cabina de doblaje + ElevenLabs.

### 🗣️ Dialogue Coach
- **Función:** entonación y interpretación (partitura del agente 11), énfasis, emoción por línea.
- **Emula:** coach de locución.

### 🎚️ Técnicos de ADR
- **Función:** resincronizar la locución con la imagen, limpiar tomas, y preparar pistas para **doblaje a otros idiomas** (Fase 3 de `crecimiento.md`).
- **Emula:** ADR / re-recording mixer.

---

## 🟥 POSTPRODUCCIÓN

### ✂️ Montaje / Edición
- **Función:** ensamblar las 10 escenas, ritmo (corte cada 5-6s), match cut, timing con la música.
- **Emula:** editor en **Premiere / DaVinci** (en nuestro flujo: **SceneBuilder** de Flow).

### 💥 VFX (Efectos Visuales)
- **Función:** compositing, limpieza (borrar artefactos IA), integración de elementos, simulaciones.
- **Piensa como si trabajara en:**
  - **Nuke** → compositing y limpieza de planos (quitar deformaciones IA, integrar capas).
  - **After Effects** → grafismo 2D, textos en pantalla, efectos ligeros, tracking.
  - **Houdini** → simulaciones: fuego (Darvaza), humo, multitudes, destrucción, partículas.
  - **Maya** → modelado/animación 3D de precisión cuando haga falta.
  - **Blender** → 3D y assets (alternativa libre), previz.
- **En nuestro flujo:** el agente decide qué logra el prompt de IA y qué exige un retoque real en esas herramientas; marca los planos "VFX-heavy".

### 🎨 Color / DI (Colorista)
- **Función:** aplicar el grado de marca (teal-orange, negros profundos, grano), coherencia entre escenas.
- **Emula:** colorista en **DaVinci Resolve**.

### 🔤 Grafismo / Motion Graphics
- **Función:** títulos, palabras clave sincronizadas, tipografía de marca.
- **Emula:** **After Effects**.

### 🎚️ Masterización de Audio
- **Función:** mezcla final, *ducking* (voz manda), niveles, loudness para móvil.

### 🌐 Subtitulado / Localización
- **Función:** subtítulos quemados (retención) + versión para otros idiomas.

### 📤 Masterización / Export
- **Función:** exportar 9:16, upscale 4K, versiones por plataforma (`crecimiento.md`).

---

## 🟪 FILTRO Y PUBLICACIÓN
- **QC / Control de Calidad** → revisión final de errores (continuidad, audio, artefactos).
- **🔥 Filtro de Viralidad** (agente 14) → sobre el montaje, con predictor de viralidad.
- **🎩 Dirección General** → aprueba y publica.

---

## 🟫 ADMINISTRACIÓN
- **💰 Contabilidad de Tokens** → presupuesto y coste real por video. Ver `contabilidad-tokens.md`.

---

## 🔄 Flujo por departamentos (resumen)
```
DESARROLLO → PREPRODUCCIÓN (arte/DF/vestuario/localización/casting/storyboard/continuista)
   → PRODUCCIÓN (generación de tomas) → AUDIO → POSTPRODUCCIÓN (montaje/VFX/color/motion/audio master)
   → QC → FILTRO DE VIRALIDAD → DIRECCIÓN GENERAL publica
   (CONTABILIDAD DE TOKENS registra el coste en paralelo)
```
> Para un Short rutinario, muchos departamentos se resuelven en segundos (una nota cada uno). Para un piloto de serie o un largo (Nivel 2), cada departamento entrega su documento completo.
