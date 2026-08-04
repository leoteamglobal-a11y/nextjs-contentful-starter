# 💾 Punto de guardado — CasaHost (2026-08-02)

Estado del proyecto para retomar donde quedamos.

## ✅ Redes y cuentas creadas
- **Facebook:** Página "CasaHost" (logo + descripción + categoría Bienes raíces). Falta: subir portada HD, teléfono, 1er post.
- **Instagram:** @casahost305 — cuenta de empresa + bio bilingüe. Falta: subir posts, link.
- **Google Business:** "Casa Host" creado (áreas: Doral, Miami + otras). ⏳ SIN verificar (el email de verificación iba al dominio netlify que no existe → verificar con dominio propio o por teléfono/video).
- **Email:** casahost88@gmail.com

## 🎨 Assets entregados (en el chat)
- Logo CasaHost (2 versiones: con "MIAMI" y con "CO·HOSTING")
- Portada de Facebook HD (4920×1872, sin teléfono)
- 3 publicaciones cuadradas: Bienvenida, "3 errores", "¿Cuánto genera?"

## 🎬 Video promocional (EN PROGRESO)
Clips generados (Higgsfield, 9:16, links de descarga):
1. Interior de lujo: `hf_20260802_030443_04674147-9da9-483a-9901-b9254ac3b50b.mp4`
2. South Beach (playa turquesa): `hf_20260802_030757_129eca57-cb57-4fb3-86ef-7e6c5c7258de.mp4`
3. Brickell skyline (el favorito 🌆): `hf_20260802_030800_8081d565-c749-4653-acfb-51fb8551ea74.mp4`
(Base URL: https://d8j0ntlcm91z4.cloudfront.net/user_3FWcagCBK1GJUdHsnYi7Zrb78NA/)

Voz de prueba (ElevenLabs, "Marisol"): `hf_20260802_031038_2f5c4d7b-40b1-444f-b6f9-0baba6bd5144.mp3`
→ Feedback: la voz suena muy IA. Probar motor **minimax** + voz más cálida + pausas.

### Guion del promo (aprobado, ~15s / versión completa ~25s)
1. 🏠 Interior → "¿Tienes una propiedad en Miami y no tienes tiempo de rentarla?"
2. 🌆 Brickell → "CasaHost la administra de principio a fin."
3. 🏛️ Coral Gables → "Precios, huéspedes 24/7, limpieza y permisos."
4. 🌴 Doral → "Tú solo cobras cada mes."
5. 🏖️ South Beach → "18% todo incluido, sin cargos ocultos."
6. 🏊 Rooftop pool → "Pide tu evaluación gratis. CasaHost."

## 💳 Créditos Higgsfield
- Recargados 500 créditos (plan Ultra). Quedan ~470.
- ⚠️ Límite DIARIO de generaciones alcanzado hoy → se reinicia mañana.

## 📋 PRÓXIMOS PASOS (mañana, con el límite fresco)
1. Generar clips que faltan: Coral Gables, Doral, interiores, rooftop pool.
2. Rehacer la voz natural (minimax + voz cálida + pausas).
3. Unir clips + voz + subtítulos → promo final para IG/FB.
4. Subir las 3 publicaciones (una por día).
5. Instalar WhatsApp Business (+1 239 687 0181).
6. Decidir dominio: casahost.org ($8.49) o casahoststay.com ($11) — casahost.com está ocupado.
7. Verificar Google Business (con dominio o teléfono).
8. EMPEZAR A PROSPECTAR (realtors + dueños con el pack de mensajes).

## 🔁 Actualización 2026-08-03 (día 2)
- Probamos varias voces IA para el promo (Higgsfield / Seed Audio): Marisol, Elena, Isabella, Sienna. Feedback: aún no suenan lo bastante latinas/neutrales; buscamos voz femenina dulce, español latino nativo, sin acento gringo.
- Se topó otra vez el **límite diario de Higgsfield** → seguir mañana.
- El conector de **ElevenLabs** agregado en claude.ai NO aparece dentro de esta sesión de Code (requiere login interactivo / sesión nueva). Para usar el ElevenLabs bueno (español nativo) hay que abrir una sesión nueva con el conector activo.
- Creado **`PROMPT-CONTINUACION.md`**: prompt para pegar en una sesión nueva y retomar todo.
- Próximo paso #1: voz del promo con ElevenLabs nativo (femenina, dulce, latina).

## ✅ VOZ DEL PROMO DECIDIDA (2026-08-03, sesión nueva)
- El conector de ElevenLabs SÍ apareció disponible en esta sesión nueva de Claude Code → se generó y descargó localmente el guion completo con 9 candidatas de voz (todas en `eleven_multilingual_v2`, español, con el guion aprobado de ~18-22s):
  - Neutrales/dulces: Alisson, Ninoska, Carolina
  - Enérgicas: Ale, Natalia, Marcela
  - Caribeñas: Claudia (cubana), Amara (Caribe), Diana y Angelina (dominicanas, sin escuchar)
- **Voz ganadora: Claudia (cubana)**, `voice_id: tGaqHUoNeMUctS0nje4o`, con ajuste de expresividad para sonar más enérgica: `voice_settings = {stability: 0.3, similarity_boost: 0.8, style: 0.7, use_speaker_boost: true}`.
  - Pendiente afinar más esa misma combinación (más/menos energía) cuando se arme el video final — de momento queda como base aprobada.
- Archivos mp3 de las 9 candidatas quedaron en el scratchpad de la sesión (no en el repo, son borradores de audio).

## 📋 Pendiente #1 → CERRADO. Siguiente: Pendiente #2 (clips de Miami que faltan)
Clips que faltan según el guion (`hf_20260802_*` = ya generados: interior de lujo, South Beach, Brickell skyline):
- 🏛️ Coral Gables (bloque 3: "Precios, huéspedes 24/7, limpieza y permisos.")
- 🌴 Doral (bloque 4: "Tú solo cobras cada mes.")
- 🏊 Rooftop pool (bloque 6: "Pide tu evaluación gratis. CasaHost.")

⛔→✅ **Bloqueado 2026-08-03, resuelto mismo día:** al intentar generar los 3 clips con `kling3_0_turbo` (y luego `seedance_2_0_mini` para confirmar) → `403 grace_daily_limit_reached` en ambos modelos, límite de cuenta. Leo avisó que **Seedance estaba gratis por 24h** → se reintentó con `seedance_2_0` (mode fast, 720p, sin audio) y esta vez SÍ pasó. Los 3 clips que faltaban ya están generados y descargados localmente (el bloqueo de proxy de CloudFront que tenían anotado ya NO aplica, se descargan bien con curl):
- 🏛️ Coral Gables: `hf_20260804_025437_d421e460-98ba-4765-b1d0-1a07f6ff9725.mp4`
- 🌴 Doral: `hf_20260804_025451_70ac13a1-66a8-4ebe-bbf0-d500b7772cff.mp4`
- 🏊 Rooftop pool: `hf_20260804_025451_2ecf3428-5118-4fb4-ac3b-2d70c49efe78.mp4`
(Base URL: `https://d8j0ntlcm91z4.cloudfront.net/user_3FWcagCBK1GJUdHsnYi7Zrb78NA/`)

**Pendiente #2 → CERRADO.** Con esto ya están los 6 clips del guion completo (interior, Brickell, Coral Gables, Doral, South Beach, rooftop pool). Siguiente: pendiente #3, armar el video final (clips + voz Claudia + subtítulos).

## 🌐 Investigación de dominio (2026-08-03) — decisión EN PAUSA, no comprado
Precios reales verificados en Namecheap (no estimados):
- `casahost.org`: $8.48/año 1er año, $14.48/año renovación. Disponible.
- `casahoststay.com`: $11.28/año 1er año ($6.79 con cupón `NEWCOM4679`), $14.98/año renovación. Disponible.
- `casahost.com`: sigue ocupado (registrado desde 2004).
Recomendación dada (con datos, no decidida aún por Leo): `casahoststay.com` sobre `.org` — un `.org` se lee como organización sin fines de lucro, lo cual resta confianza comercial frente a dueños/realtors; la diferencia de precio es mínima. Leo dijo "por ahora el dominio no" → queda pausado, no comprado. Retomar cuando él lo pida.

## 📦 Todo el proyecto
Carpeta CasaHost (ZIP entregado) + repo: rama `claude/airbnb-income-system-rhi2yz`.
Para retomar: abrir el repo en una sesión nueva de Claude Code y pegar el contenido de `PROMPT-CONTINUACION.md`.
