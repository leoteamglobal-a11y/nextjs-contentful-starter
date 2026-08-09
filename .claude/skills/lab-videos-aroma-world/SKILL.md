---
name: lab-videos-aroma-world
description: >-
  Lab de videos de Aroma World: produce reels/anuncios de alta calidad con IA
  (imagen→video, voz IA, lip-sync) manteniendo calidad de cine y consistencia de
  marca. Úsalo siempre que se cree, edite o mejore un video/reel/anuncio para
  Aroma World, o cuando se hable de calidad de video, voz del narrador,
  sincronía de labios, marca de agua o estilo visual. Adapta (no copia) el motor
  de calidad de "El Último Narrador" al tono de lujo/fragancia. Palabras
  gatillo: video, reel, tiktok, anuncio, comercial, modelo, voz, locución,
  narrador, lip-sync, sincronía, marca de agua, calidad, higgsfield, seedance,
  kling, elevenlabs, fotorrealismo, 9:16.
---

# Lab de Videos · Aroma World

Motor de calidad para producir videos con IA que **se vean filmados, no generados**,
con **voz de marca consistente** y **sin marca de agua**. Adapta el sistema probado
de "El Último Narrador" (Constitución + Biblia + Checklist) al concepto de Aroma
World: **lujo, calma, deseo sensorial** — NO drama de terror.

## Regla de oro
La marca se reconoce en <10 s por su **voz fija + estilo visual fijo**. Toda pieza
pasa el **Checklist pre-export** antes de entregarse. Si algo se ve plástico o suena
mal, se **regenera** — no se entrega "a ver si cuela".

## 1. Voz oficial de Aroma World
- **Identidad:** voz **femenina, elegante, cálida, español neutro/Miami.** Es identidad
  de marca, no depende del proveedor. **Voz oficial confirmada: "Charlotte"**
  (hoy: ElevenLabs `eleven_multilingual_v2`, `voice_id: XB0fDUnXU5powFXDhCwa`,
  `language_code: es`). Si cambia el proveedor, la identidad "voz femenina elegante
  Charlotte" manda.
- **Naturalidad (regla dura — evitar voz robótica):**
  - `voice_settings` base: `stability 0.5 · similarity_boost 0.9 · style 0.28 ·
    use_speaker_boost true · speed 0.9` (ritmo lento = lujo).
  - **Pausas explícitas** con `<break time="0.3s–0.6s" />` entre frases (respira, no
    atropella). Puntos suspensivos `...` para dar peso antes del golpe.
  - Frases cortas (8–12 palabras), una idea por frase, palabra clave al final.
  - Pasar el guion por el `body` del TTS con `voice_settings` (no dejar el default plano).
- **Prosodia por bloque** (voice_settings distintos por intención — lujo = control, no drama):
  - Hook (intriga elegante): `stability 0.55 · style 0.30`
  - Narrativo: `stability 0.60 · style 0.25`
  - Dato / beneficio (claridad): `stability 0.65 · style 0.20`
  - CTA cálido: `stability 0.55 · style 0.30`
  - `similarity 0.85` **siempre** (articulación más nítida)
  - Ritmo ligeramente lento = sensación de lujo.
- La voz **sigue la emoción, no la puntuación**. Frases cortas (8–12 palabras), palabra
  clave al final.

## 2. Motor SIN marca de agua (crítico)
- **Higgsfield (plan Ultra) = sin marca de agua.** Generar y montar **dentro de
  Higgsfield**. **NUNCA** exportar el final por **Descript en plan gratis** (estampa
  marca de agua).
- **Modelo/persona hablando → `seedance_2_0`** con `start_image` + audio como
  `medias role: audio` (audio_references): hace **lip-sync real** y **bakea la voz**
  en el video (sin marca, 1080p, 9:16). Voz IA: generar en ElevenLabs → importar a
  Higgsfield con `media_import_url` (type audio) → pasar el media_id.
- **Producto / escena (sin rostro) → `kling3_0`** image-to-video (respeta el producto
  real vía `start_image`). Para bakear voz en escena sin boca, también sirve
  `seedance_2_0` con audio_references.
- **Producto real idéntico:** usar foto real del producto como referencia (`role: image`
  en imagen, `start_image` en video). Nunca deformar tamaño/forma/etiqueta.
- Descargar los clips por curl está **bloqueado por el proxy** (403) → no intentar
  ffmpeg local con los assets remotos; montar en la nube (Higgsfield).

## 3. Reglas duras de fotorrealismo (en CADA prompt)
Pedir explícitamente, con estas palabras o equivalentes:
- **Estilo fotorrealista cinematográfico** — nunca "ilustración/render 3D/arte digital".
- Textura real (piel, tela, superficies) — nada de plástico/cera.
- **Grano de cine / luz con caída natural** — evitar el brillo/nitidez de IA ("AI sheen").
- Sin simetría facial perfecta ni proporciones "de muñeco".
- Si sale plástico, sobre-nítido o con brillo IA → **se descarta y se regenera** con el
  prompt reforzado (no se pasa a entrega esperando que no se note).

## 4. Honestidad de datos ("todo real")
- Clasificar cada afirmación: **hecho comprobado / certificado / opinión.** Nunca
  presentar opinión o marketing como hecho.
- **Nunca inventar** un dato (cobertura, ml, %). Si no hay fuente, se omite.
- Claims permitidos hoy: **"Cumple IFRA"** (verificado con certificado del proveedor).
  **"Pet-safe" SOLO** cuando el proveedor confirme la lista de alérgenos (sin árbol de
  té, eucalipto, pino, cítricos/limoneno, canela, clavo, menta, gaulteria, ylang-ylang).
- Nunca: "100% seguro", "no tóxico", "cura", "dura 24 h garantizado", ni nombre/logo
  de una marca ajena (usar "inspirado en").

## 5. Estilo visual y estructura de marca
- **Formato:** vertical **9:16**, **1080p**.
- **Paleta:** azul marino + dorado, luz cálida, ambiente premium (hotel 5★, hogar de lujo).
- **Hook primero** (≤3 s): el gancho más fuerte en t=0 (pasa el test de mudo).
- **Rótulos en pantalla** (si aplican): mayúsculas, tercio bajo, blanco/ámbar, fade ~2.5 s,
  máximo 2–4. **Gradación de color natural** (nada saturado/artificial).
- **Tarjeta de cierre** de marca 3–4 s, siempre igual (logo AW + tagline).
- **CTA:** integrado natural — pedir seguir + **palabra clave → responder por DM**.
- **Audio broadcast:** normalizar a `loudnorm I=-14 · TP=-1.5 · LRA=11`. La voz nunca
  compite con música/SFX (verificar al oído en los picos).

## 6. Flujo de producción (orden)
1. **Guion + prosodia** (usa `fabrica-contenido-aroma-world` para el texto/gancho).
2. **Imagen base** (Higgsfield `nano_banana_pro`/marketing) con reglas de fotorrealismo
   + foto real del producto como referencia.
3. **Voz IA** (ElevenLabs, voice_settings del bloque) → importar a Higgsfield como audio.
4. **Video:** `seedance_2_0` (persona/lip-sync, bakea voz) o `kling3_0` (producto/escena).
5. **Ajustar duración** del video a la voz (evitar final en negro).
6. **Checklist pre-export** (abajo) → entregar link + caption/hashtags.

## 7. Checklist pre-export (ningún video lo salta)
- [ ] **Sin marca de agua** en todo el clip (verificado esquina inf. derecha).
- [ ] **Producto idéntico** (tamaño/forma/etiqueta) — sin deformación.
- [ ] **Fotorrealismo** — nada plástico ni "AI sheen"; si falla, regenerar.
- [ ] **Voz sincronizada** (si hay boca hablando, lip-sync real, no voz encima).
- [ ] **Sin final en negro** — video ≥ duración de la voz.
- [ ] **Claims reales** — IFRA ✅ solo si verificado; pet-safe solo con alérgenos.
- [ ] **Voz vs música/SFX** — voz clara en los picos.
- [ ] **9:16 · 1080p · color natural · tarjeta de cierre + CTA.**
- [ ] **Nada se publica sin visto final del dueño (Leo).**

## Lo que NO se trae de "El Último Narrador"
La voz "Miguel" (terror), la prosodia de máximo drama, la taxonomía leyenda/mito, el
cold-open de terror y el bloque tabú/comment-bait. Aroma World = **lujo, calma, deseo**.
