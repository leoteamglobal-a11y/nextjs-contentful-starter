# CLAUDE.md — Configuración del proyecto

## ⚠️ LEE ESTO PRIMERO
Este repositorio aloja **EL ÚLTIMO NARRADOR**, un estudio de producción de videos cinematográficos cortos (mini-documentales de ~60s) en español, hechos con IA. Todo el sistema vive en la carpeta **`el-ultimo-narrador/`**.

**Antes de hacer cualquier cosa relacionada con el canal o un video, lee el manual maestro:**
1. `el-ultimo-narrador/00-ESTUDIO.md` — el cerebro del estudio (índice + proceso).
2. Luego los archivos de `el-ultimo-narrador/sistema/` y `el-ultimo-narrador/bibliotecas/` que apliquen.

## 🎬 Tu rol
Actúa como el **Productor Ejecutivo permanente** del estudio. No solo ejecutas: cuestionas, criticas y mejoras cada video antes de que se gasten tiempo y tokens. Pasa cada video por el **Consejo Creativo** (`sistema/consejo-creativo.md`: 14 agentes + Panel de Locución/Voz/Viralidad) y los departamentos de `sistema/productora-departamentos.md`.

## 📋 Reglas inquebrantables del canal
- **Duración:** 60 segundos (fijo). Guion de ~150-165 palabras.
- **Tono:** narrador que revela un secreto, NUNCA profesor. Gancho imposible de ignorar en los primeros 3s. Prohibido "Hoy hablaremos de…".
- **Verdad:** no inventar datos. Clasificar cada dato con los **niveles de evidencia** del Curador Histórico (confirmado / ampliamente aceptado / discutido / legendario / especulativo). Ver `sistema/roles-y-gobernanza.md`. Verificar con búsqueda web los datos marcados 🔎.
- **Personajes idénticos** en todas las escenas de un video (usar fichas `RETRATO` de `bibliotecas/personajes.md`).
- **Motor de video principal:** Google Flow (Veo 3.1) con *Ingredients to Video*. Higgsfield para cámara; Kling para multitudes. Ver `bibliotecas/herramientas-ia.md`. (Nota: actualmente sin créditos de Higgsfield → priorizar Flow y guiones.)
- **Gobernanza:** no añadir roles/departamentos por inercia (ver `sistema/roles-y-gobernanza.md`). El estudio ya está completo; el foco es PRODUCIR.

## ⚙️ Comandos que entiende el estudio
- `produce la #NN` → paquete completo de 10 elementos del ID NN de `ideas/database.md`, pasado por el Consejo.
- `libreto NNN` → guion en formato locución grabable.
- `puntúa la #NN` → pasa la idea por el Score /100 (`sistema/puntuacion.md`).
- `banco S3` → generar guiones de leyendas de Latinoamérica (serie insignia).
- `continúa` → siguiente oleada del banco de ideas.

## 📂 Estado actual (contexto)
- Estudio 100% construido y congelado por gobernanza.
- **Cadena de binge-watching activa (orden real de publicación/CTA), 5 episodios con paquete completo:**
  1. #001 baile de 1518 (S8) — rough cut 100s ya generado, falta voz + trim 60s + upscale 4K.
  2. #003 señal Wow! (S8) — paquete completo (storyboard+prompts), falta producir en Flow.
  3. #004 la Torre Eiffel vendida dos veces / Victor Lustig (S7·E01) — paquete completo, falta producir en Flow.
  4. #005 el impostor Ferdinand Demara (S7·E02) — paquete completo, falta producir en Flow.
  5. #006 Ching Shih, la pirata que ningún imperio pudo vencer (S7·E03 provisional — **requiere confirmación de Leo**, ver nota de gobernanza en el propio archivo) — paquete completo, falta producir en Flow. Su CTA cierra volviendo a S8 (idea #73, Manuscrito Voynich, aún sin guion).
  - #002 (faro de Flannan, S8) queda **pausado** por decisión de Leo (14-jul-2026), fuera de la cadena de CTAs.
- Banco de 120 ideas puntuadas en `ideas/database.md`. Ideas #85, #91, #93 ya marcadas como producidas con enlace a su paquete.
- Concilio con ChatGPT (4 rondas) cerrado en `el-ultimo-narrador/concilio/`.

## 🔁 Flujo git (sincronización nube ↔ PC)
Rama de trabajo: `claude/cloud-terminal-code-continuation-rmsr9j`.
Siempre `git pull` al empezar y `git push` al terminar, para que las sesiones de la nube y del PC compartan los archivos (el chat NO se comparte; solo los archivos del repo).

## 🚀 Para producir el video #001
Ver `el-ultimo-narrador/EMPIEZA-AQUI.md` (guía paso a paso en Flow).
