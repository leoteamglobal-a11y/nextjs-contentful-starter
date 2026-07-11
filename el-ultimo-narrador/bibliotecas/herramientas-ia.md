# 🛠️ HERRAMIENTAS DE IA — qué motor usar para cada cosa

> No todos los motores sirven para lo mismo. Este es el mapa oficial del estudio. Regla de oro: **la consistencia de personaje manda** → el motor que mejor la mantenga es el principal.

Actualizado: julio 2026.

---

## 🥇 Google Flow (Veo 3.1) — MOTOR NARRATIVO PRINCIPAL

Por qué es nuestro caballo de batalla para las secuencias con personajes:

| Función de Flow | Para qué la usamos |
|---|---|
| **Ingredients to Video** | 🎯 LA clave. Subes una imagen de referencia del personaje (el `RETRATO`) y Flow lo mantiene IDÉNTICO en cada escena. Resuelve nuestra regla #1 de consistencia sin depender de que el prompt de texto acierte. |
| **Frames to Video** | Das un fotograma inicial y uno final; Flow crea la transición fluida entre ambos. Perfecto para el **match cut firma** y para controlar entradas/salidas de plano. |
| **SceneBuilder** | Editor de línea de tiempo: encadena y ordena los clips generados en una secuencia coherente. Aquí montamos las 10 escenas del video. |
| **Veo 3.1 nativo** | **9:16 vertical nativo** (¡nuestro formato madre!), **upscale a 4K**, **Scene Extension** (>60s continuos) y **audio nativo** (ambiente/SFX) en Ingredients/Frames/Extend. |

### Flujo de trabajo recomendado en Flow (por video)
1. **Crea el personaje como "Ingredient":** genera/usa una imagen de referencia con el `RETRATO` (de `personajes.md`). Guárdala como ingrediente.
2. **Genera cada escena** con *Ingredients to Video* + el prompt de esa escena (del paquete de producción). El personaje sale consistente.
3. **Transiciones:** usa *Frames to Video* para el match cut y para bridging entre escenas clave.
4. **Monta en SceneBuilder** las 10 escenas en orden; usa *Extend* si una necesita durar más.
5. **Audio:** deja el audio nativo de Veo SOLO como ambiente/SFX. **Silencia cualquier diálogo generado** → la locución es SIEMPRE nuestra voz de marca fija.
6. **Exporta 9:16, upscale 4K.**

> Ventaja estratégica: Ingredients + 9:16 nativo hacen de Flow la opción más eficiente para nuestro formato exacto, con la mejor continuidad de personaje.

---

## 🥈 Higgsfield — MOVIMIENTO DE CÁMARA Y ESTILO

- Fuerte en **movimientos de cámara cinematográficos con presets** (dolly, orbit, crash zoom), VFX y planos muy estilizados.
- Úsalo para escenas donde el **movimiento de cámara** es el protagonista (nuestros "planos firma": travelling de revelación, cenital, crash zoom al giro).
- También para imágenes sueltas espectaculares (miniaturas, escenarios de `escenarios.md`).
- En prompts: describe el movimiento de cámara EXPLÍCITO.

## 🥉 Kling — ALTERNATIVA / RESPALDO

- Buen motor de movimiento y físicas; úsalo como alternativa cuando Flow o Higgsfield no den el plano.
- Útil para planos de acción o multitudes con movimiento complejo (ej. Esc 3-4 del video #001: masa bailando).

## 🎙️ Voz y audio (fuera de los motores de video)
- **Locución:** ElevenLabs (u otra) con la **voz oficial fija** del canal. Nunca la voz generada por el motor de video.
- **Música/SFX:** ver `musica-sfx.md` (Suno/Udio para temas a medida; Epidemic/Freesound para SFX).

---

## 🧭 Regla de decisión rápida
- ¿Escena con personaje que debe repetirse? → **Flow (Ingredients).**
- ¿El plano vive del movimiento de cámara? → **Higgsfield.**
- ¿Transición/match cut controlado? → **Flow (Frames to Video).**
- ¿Montaje de la secuencia? → **Flow (SceneBuilder).**
- ¿Imagen fija (miniatura/escenario)? → **Higgsfield** o generador de imagen.
- ¿Un motor falla el plano? → prueba **Kling**.

> Los prompts del paquete de producción están escritos para funcionar en los tres; en Flow, además, ancla el personaje con el Ingredient para máxima consistencia.
