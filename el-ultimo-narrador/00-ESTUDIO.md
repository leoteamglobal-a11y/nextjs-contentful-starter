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
├── sistema/                       FASE 0-1 · Estrategia + sistema operativo
│   ├── 00-estrategia.md           → FASE 0: público, promesa, emoción, qué NO publicar
│   ├── biblia-de-marca.md         → voz, firma visual, intro/cierre, tagline
│   ├── puntuacion.md              → Score /100 (umbral 85) + checklist productor ejecutivo
│   ├── series.md                  → 8 series del canal (S3 Latinoamérica = arma secreta)
│   └── consejo-creativo.md        → las 9 mesas + Abogado del Diablo + multi-modelo
│
├── bibliotecas/                   FASE 2-4 · Los moldes y activos
│   ├── patrones-virales.md        → 30 moldes de historia que funcionan
│   ├── estructuras.md             → 20 estructuras de guion de 60s
│   ├── ganchos.md                 → 50+ ganchos reutilizables
│   ├── personajes.md              → fichas físicas fijas (consistencia entre videos)
│   ├── escenarios.md              → prompts de escenarios espectaculares reutilizables
│   ├── musica-sfx.md              → paletas sonoras
│   ├── miniaturas.md              → fórmulas de miniatura de alto CTR
│   ├── herramientas-ia.md         → qué motor usar (Flow/Veo 3.1 principal · Higgsfield · Kling)
│   └── prompts-maestros.md        → prompts para cada etapa (Claude/Flow/Higgsfield/Kling)
│
├── ideas/
│   └── database.md                → banco de historias puntuadas (120 → 500)
│
├── producciones/
│   └── PLANTILLA.md               → los 10 elementos de cada video
│
└── laboratorio/                   FASE 6 · El bucle que aprende con datos
    ├── resultados.md              → métricas reales por video + patrones
    └── experimentos.md            → hipótesis A/B a propósito
```

---

## 🚦 Estado de construcción (roadmap)

| Fase | Pieza | Estado |
|---|---|---|
| **0** | **Estrategia del canal** (público, promesa, emoción, líneas rojas) | ✅ (v1 — Leo confirma) |
| 1 | Manual maestro (este archivo) | ✅ |
| 1 | Biblia de marca | ✅ |
| 1 | Sistema de puntuación /100 + checklist productor | ✅ |
| 1 | **Sistema de series** (8 series) | ✅ |
| 1 | **Consejo Creativo** (9 mesas + Abogado del Diablo) | ✅ |
| 2 | Patrones virales (30) | ✅ |
| 2 | Estructuras narrativas (20) | ✅ |
| 2 | Biblioteca de ganchos (50) | ✅ |
| 3 | Biblioteca de personajes | ✅ (semilla) |
| 3 | Escenarios / Música / Miniaturas | ✅ (plantilla + semilla) |
| 4 | Prompts maestros | ✅ |
| **6** | **Laboratorio de datos** (resultados + experimentos) | ✅ (listo para llenar) |
| — | Banco de ideas | 🔄 120/500 |
| 🚦 | **Validar con 3 videos reales** | ⏳ siguiente hito |
| 5 | Escala a 500-1000 + pipeline 1→4 plataformas | ⏳ tras validar |

---

## ⚙️ El proceso industrial (cómo se hace un video)

Todo video pasa por el **Consejo Creativo** (`sistema/consejo-creativo.md`, 9 mesas). En resumen:

1. **Elegir historia** del banco (`ideas/database.md`) y su **serie** (`series.md`).
2. **Puntuar** con `sistema/puntuacion.md`. ¿≥ 85/100? Sigue. ¿No? Se descarta o reformula.
3. **Asignar molde**: un patrón viral + una estructura narrativa + un gancho de las bibliotecas.
4. **Producir los 10 elementos** con `producciones/PLANTILLA.md`, usando personajes y escenarios reutilizables.
5. **Consejo Creativo**: pasa por las 9 mesas, incluido el **Abogado del Diablo**. Si no sobrevive, se reescribe.
6. **Generar con IA** (prompts maestros → Higgsfield/VEO/Kling/Flow).
7. **Publicar y medir** → `laboratorio/resultados.md` (Fase 6).
8. **Aprender** → los patrones confirmados vuelven a las bibliotecas. El estudio mejora solo.

> Comandos que entiende el estudio (dímelos en el chat):
> - `produce la #NN` → paquete completo de 10 elementos.
> - `puntúa la #NN` → pasa la idea por el Score /100.
> - `continúa` → siguiente oleada del banco de ideas.
> - `construye [pieza]` → crea/expande una biblioteca.
