# 🧠 CONSEJO CREATIVO IA — el proceso de revisión de cada video

> Ningún video se produce sin pasar por estas mesas. No es "una IA ejecutando órdenes": es un comité que discute, critica y mejora la idea ANTES de invertir tokens. Cuando trabajas conmigo, YO interpreto estas mesas en secuencia y te entrego la mejor versión, no la primera.

**Cómo se aplica:** al hacer `produce la #NN`, el paquete atraviesa las 9 mesas. Cada mesa deja una nota. La mesa 8 (Abogado del Diablo) puede devolver todo a reescritura. La mesa 9 decide.

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

### 9. 🎩 Director General (decisión final)
- Escucha a todas las mesas.
- Integra las mejoras.
- Entrega **la mejor versión posible** con veredicto: **APROBADO / REESCRIBIR / DESCARTAR** + "el cambio #1 para duplicar las vistas".

---

## 🧩 El Consejo de Sabios (multi-modelo) — versión sensata

No pasamos cada video por 5 modelos (eso frena la producción). Repartimos por **fortaleza**, solo donde aporta:

| Modelo | Rol | Cuándo usarlo |
|---|---|---|
| **Claude (yo)** | Productor Ejecutivo permanente + las 9 mesas + investigación/verificación web | Siempre. Es el motor del estudio. |
| **ChatGPT** | Estrategia y visión de conjunto; segundo par de ojos | En decisiones de rumbo del canal, no en cada video. |
| **Perplexity / Gemini** | Verificación de fuentes en datos 🔎 dudosos | Solo cuando un dato es delicado y quieres triple-check. |
| **Higgsfield / VEO / Kling / Flow** | Producción visual | En la generación. |

> Regla del productor: el multi-modelo entra en el **20% de decisiones caras** (rumbo del canal, datos delicados), no en el 80% operativo. Así ganas perspectiva sin perder velocidad.

---

## Salida estándar del Consejo (lo que recibes por cada video)
```
VEREDICTO: APROBADO / REESCRIBIR / DESCARTAR
Score: __/100
Serie: S_ · Episodio: E__
Notas por mesa (solo las accionables): ____
Abogado del Diablo — punto más débil: ____
Cambio #1 para duplicar vistas: ____
```
