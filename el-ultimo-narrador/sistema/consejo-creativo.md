# 🧠 CONSEJO CREATIVO IA — el proceso de revisión de cada video

> Ningún video se produce sin pasar por estas mesas. No es "una IA ejecutando órdenes": es un comité que discute, critica y mejora la idea ANTES de invertir tokens. Cuando trabajas conmigo, YO interpreto estas mesas en secuencia y te entrego la mejor versión, no la primera.

**Cómo se aplica:** al hacer `produce la #NN`, el paquete atraviesa las **9 mesas creativas + el Panel de Locución, Voz y Viralidad (agentes 10-14)**. Cada mesa/agente deja una nota. La mesa 8 (Abogado del Diablo) puede devolver todo a reescritura; el agente 14 (Viralidad) puede frenar la publicación. La mesa 9 decide.

---

## Las 9 mesas

### 1. 🔎 Investigador
- Busca la historia y **verifica que sea real** (fuentes confiables; usa búsqueda web para datos 🔎).
- Encuentra el dato poco conocido que será el giro.
- Detecta si el tema está saturado en YouTube en español. Si lo está → propone el ángulo único o descarta.

### 2. 🎬 Productor Ejecutivo
- Puntúa con `puntuacion.md` (/100). **< 85 = rechazada.**
- Decide si vale la pena. Si no alcanza el estándar, no pasa.

### 3. ✍️ Guionista
- Convierte la historia en relato de 60s (150-165 palabras).
- Maximiza curiosidad, mete un giro en el ~seg 50, cierra con tagline + puente.

### 4. ⏱️ Director de Retención
- Analiza segundo por segundo: ¿dónde se aburriría el espectador?
- Marca los puntos de fuga (segundos donde caería la curva) y propone el arreglo (cortar, acelerar, abrir un nuevo bucle).

### 5. 🎥 Director de Cine
- Define planos, ritmo, iluminación y **continuidad visual** (personajes idénticos, look de marca).
- Asigna la estructura de storyboard (cambio de plano cada 5-6s).

### 6. 🤖 Especialista en IA
- Optimiza los prompts para Higgsfield / VEO / Flow / Kling.
- Reutiliza personajes (`personajes.md`) y escenarios (`escenarios.md`) para **reducir tokens** y reforzar identidad.

### 7. 📈 Experto en YouTube
- Título (mejor de 10), miniatura, SEO, CTA y hora de publicación (según `00-estrategia.md` y datos de Fase 6).
- Asigna la serie y el número de episodio.

### 8. 😈 Abogado del Diablo *(la mesa que sube la calidad de 7 a 9)*
Su única misión es **destruir la idea**. Responde sin piedad:
- ¿Por qué alguien haría clic en ESटO y no en otro?
- ¿Qué tiene de diferente frente a lo que ya existe?
- ¿Qué haría **MrBeast** con este gancho? ¿Qué haría **Netflix** con esta historia?
- ¿Qué parte ELIMINARÍA por aburrida?
- ¿Cuál es el punto más débil y cómo lo explotaría un competidor?
> Si la idea sobrevive al Abogado del Diablo, es fuerte. Si no, vuelve a la mesa 3.

### 🎙️ PANEL DE LOCUCIÓN, VOZ Y VIRALIDAD (agentes 10-14)
> Revisan la **producción** antes de publicar: cómo suena y si va a funcionar. Estándar completo en `bibliotecas/locucion-y-voz.md`.

**10. 📝 Editor de Lenguaje** — español neutro, registro narrador (no profesor), frases de una respiración (≤14-16 palabras), cero relleno/anglicismos. Prueba en voz alta: si tropieza, se reescribe.

**11. 🎵 Director de Locución (Entonación)** — marca la *partitura* sobre el guion: énfasis, pausas (`/` `//`), subidas `↑` / bajadas `↓`, acelerar `»` / frenar `«` y el `[silencio]` antes del giro. Curva: subir en la escalada, frenar y bajar en la revelación.

**12. 🔤 Especialista en Dicción** — caza trabalenguas y cacofonías, da la pronunciación figurada de nombres extranjeros (ej. *Troffea → "TRO-fea"*), simplifica números difíciles, verifica que cada frase fluya sin partirse.

**13. 🎤 Casting y Consistencia de Voces** — voz oficial ÚNICA en todos los videos (config ElevenLabs recomendada), decide el tratamiento de citas/personajes, y silencia el diálogo generado por Veo/Flow (la voz de marca manda).

**14. 🔥 Filtro de Viralidad (portero final)** — sobre el video YA montado: ¿frena el scroll?, ¿motivo para compartir?, ¿el giro sorprende montado?, ¿título/miniatura cumplen?, ¿sobra algún segundo? Puede usar un **predictor de viralidad** real. Veredicto: ✅ PUBLICAR / ✏️ AJUSTAR / ❌ NO PUBLICAR.

### 9. 🎩 Director General (decisión final)
- Escucha a todas las mesas **y al Panel de Audio y Viralidad**.
- Integra las mejoras.
- Entrega **la mejor versión posible** con veredicto: **APROBADO / REESCRIBIR / DESCARTAR** + "el cambio #1 para duplicar las vistas".
- Da el visto bueno de publicación solo después del agente 14.

---

## 🧩 El Consejo de Sabios (multi-modelo) — SISTEMA DE NIVELES

> Convergencia del Concilio (Ronda 2): la complejidad debe ser **proporcional al valor esperado** del contenido. No todos los videos merecen el mismo comité.

### Nivel 1 — el 90% de los videos
Solo **dos actores**: **Claude** (motor: 9 mesas + investigación/verificación web + producción) y **ChatGPT** (arquitectura creativa + estrategia + retención + crítica). Suficiente y rápido.

### Nivel 2 — el 10% de alto valor
Cuando el video es un **lanzamiento de serie, un documental largo (Nivel B/C), un patrocinado o un piloto importante**, se suma:
- Búsqueda web reforzada (verificación profunda).
- Otro modelo (Perplexity/Gemini) **solo si aporta algo específico**.

| Actor | Rol | Cuándo |
|---|---|---|
| **Claude** | Sistema operativo, investigación, producción, documentación, automatización | Siempre (N1 y N2) |
| **ChatGPT** | Arquitectura del estudio, narrativa, retención, estrategia, optimización, dirección creativa | Siempre (N1 y N2) |
| **Búsqueda web / otro modelo** | Verificación profunda / perspectiva extra | Solo Nivel 2 |
| **Flow / Higgsfield / Kling** | Producción visual | En la generación |

> Regla: *la complejidad es proporcional al valor esperado.* Un Short cualquiera = Nivel 1. El piloto de una serie = Nivel 2.

---

## 🛣️ Carriles del estudio (división de trabajo — Concilio Ronda 2)

| Miembro | Carril |
|---|---|
| **Claude** | Sistema operativo · investigación · producción de paquetes · generación de imagen/video · documentación · automatización |
| **ChatGPT** | Arquitectura del estudio · narrativa · retención · estrategia · optimización · análisis crítico · **dirección creativa** |
| **Leo** | Director General · decisión final · visión · priorización |

**Handoff para no pisarnos:** ChatGPT define el *qué y el porqué* creativo (marcos, ángulos, dirección). Claude ejecuta el *cómo* (produce, investiga, documenta y genera en el repo). Cuando hay solape en "narrativa/retención", ChatGPT propone el marco y Claude lo aplica al guion concreto y lo pasa por las 9 mesas.

---

## Salida estándar del Consejo (lo que recibes por cada video)
```
VEREDICTO: APROBADO / REESCRIBIR / DESCARTAR
Score: __/100
Serie: S_ · Episodio: E__
Notas por mesa (solo las accionables): ____
Abogado del Diablo — punto más débil: ____
Lenguaje/Dicción — correcciones: ____
Partitura de entonación: ✔ marcada
Voz oficial + config: ____
Filtro de Viralidad — veredicto: ✅/✏️/❌ + ajustes: ____
Cambio #1 para duplicar vistas: ____
```
