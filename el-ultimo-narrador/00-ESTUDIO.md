# 🎬 EL ÚLTIMO NARRADOR — MANUAL DE OPERACIONES DEL ESTUDIO

> Documento maestro. Esto no es un canal, es un **estudio de producción**: un sistema que produce mini-documentales cinematográficos en español con la misma identidad y calidad, video tras video.

Si solo lees un archivo, lee este. Es el índice y el cerebro del estudio.

---

## 🧭 Filosofía

**Sistema, no colección.** Un canal muere cuando cada video se hace "como salga". Un estudio sobrevive porque tiene un método: elegir historia → pasarla por el filtro → producirla con moldes probados → medir → mejorar. Producir el video #300 debe ser tan consistente como el #1.

**Validar antes de escalar.** No construimos 1,000 historias antes del primer video. Construimos el sistema mínimo, publicamos 3 videos, medimos qué funciona en NUESTRO nicho, y *después* escalamos con datos reales.

---

## 🗺️ Mapa del estudio

```
el-ultimo-narrador/
├── 00-ESTUDIO.md                  ← estás aquí (índice + cerebro)
│
├── sistema/                       FASE 1 · El sistema operativo
│   ├── biblia-de-marca.md         → voz, firma visual, intro/cierre, tagline
│   ├── puntuacion.md              → Score /100 (umbral 85) + checklist productor ejecutivo
│   └── calendario.md              → cadencia de publicación (pendiente)
│
├── bibliotecas/                   FASE 2-4 · Los moldes y activos
│   ├── patrones-virales.md        → 30 moldes de historia que funcionan
│   ├── estructuras.md             → 20 estructuras de guion de 60s
│   ├── ganchos.md                 → 50+ ganchos reutilizables
│   ├── personajes.md              → fichas físicas fijas (consistencia entre videos)
│   ├── escenarios.md              → prompts de escenarios espectaculares reutilizables
│   ├── musica-sfx.md              → paletas sonoras
│   ├── miniaturas.md              → fórmulas de miniatura de alto CTR
│   └── prompts-maestros.md        → prompts para cada etapa (Claude/VEO/Higgsfield/Flow/Kling)
│
├── ideas/
│   └── database.md                → banco de historias puntuadas (120 → 500)
│
├── producciones/
│   └── PLANTILLA.md               → los 10 elementos de cada video
│
└── laboratorio/                   FASE 5 · El bucle que aprende
    ├── resultados.md              → datos reales por video (pendiente)
    └── experimentos.md            → hipótesis A/B (pendiente)
```

---

## 🚦 Estado de construcción (roadmap)

| Fase | Pieza | Estado |
|---|---|---|
| 1 | Manual maestro (este archivo) | ✅ |
| 1 | Biblia de marca | ✅ |
| 1 | Sistema de puntuación /100 + checklist productor | ✅ |
| 2 | Patrones virales (30) | ✅ |
| 2 | Estructuras narrativas (20) | ✅ |
| 2 | Biblioteca de ganchos (50) | ✅ |
| 3 | Biblioteca de personajes | ✅ (semilla) |
| 3 | Escenarios / Música / Miniaturas | ✅ (plantilla + semilla) |
| 4 | Prompts maestros | ✅ |
| — | Banco de ideas | 🔄 120/500 |
| 🚦 | **Validar con 3 videos reales** | ⏳ siguiente hito |
| 5 | Escala a 500-1000 + pipeline 1→4 + bitácora | ⏳ tras validar |

---

## ⚙️ El proceso industrial (cómo se hace un video)

1. **Elegir historia** del banco (`ideas/database.md`).
2. **Puntuar** con `sistema/puntuacion.md`. ¿≥ 85/100? Sigue. ¿No? Se descarta o reformula.
3. **Asignar molde**: un patrón viral + una estructura narrativa + un gancho de las bibliotecas.
4. **Producir los 10 elementos** con `producciones/PLANTILLA.md`, usando personajes y escenarios reutilizables.
5. **Auto-crítica de productor ejecutivo** (checklist en `puntuacion.md`). Si no pasa, se reescribe.
6. **Generar con IA** (prompts maestros → Higgsfield/VEO/Kling/Flow).
7. **Publicar y medir** → `laboratorio/resultados.md`.
8. **Aprender** → ajustar los moldes para el siguiente.

> Comandos que entiende el estudio (dímelos en el chat):
> - `produce la #NN` → paquete completo de 10 elementos.
> - `puntúa la #NN` → pasa la idea por el Score /100.
> - `continúa` → siguiente oleada del banco de ideas.
> - `construye [pieza]` → crea/expande una biblioteca.
