# 🤖 PROMPTS MAESTROS (uno por etapa de producción)

> Copia-pega estos prompts para ejecutar cada etapa con la misma calidad e identidad. Diseñados para Claude (texto) y para los motores de video/imagen (Higgsfield, VEO, Flow, Kling).

Todos asumen el contexto del estudio. Si trabajas conmigo en el chat, basta con `produce la #NN` y ejecuto la cadena completa. Estos prompts son para cuando trabajes solo o con otra IA.

---

## 1. 🔎 Investigación (verificación de datos)
```
Actúa como investigador documental riguroso. Sobre esta historia: "[TEMA]".
Dame: (1) los hechos confirmados por fuentes confiables, (2) qué partes son
leyenda/no verificadas, (3) las 3 fuentes más sólidas, (4) el dato más
sorprendente y REAL, (5) cualquier controversia histórica.
No inventes. Si algo no está confirmado, dilo explícitamente.
```

## 2. ✍️ Guion (60s)
```
Eres guionista de documentales cinematográficos. Escribe un guion de 150-165
palabras (60s) sobre "[TEMA]", para el canal EL ÚLTIMO NARRADOR.
Molde: [patrón viral]. Estructura: [nº de estructuras.md]. Gancho base: [de ganchos.md].
Reglas: narrador que revela un secreto, NO profesor. Primeros 5s imposibles de
ignorar (abre un bucle). Cada frase sube la curiosidad. Cero relleno. Un giro
en el segundo ~50. Cierre con la tagline y un gancho al siguiente video por
curiosidad. Lenguaje sencillo, presente. Prohibido "Hoy hablaremos de".
Marca con 🔎 cualquier dato que requiera verificación.
```

## 3. 🎬 Storyboard
```
Convierte este guion en un storyboard de escenas de 5-6s. Para cada escena:
qué ocurre, qué se ve, movimiento de cámara, iluminación, emoción, ambiente,
color, composición. Mantén los personajes idénticos entre escenas (usa las
fichas RETRATO). El plano cambia cada 5-6s. Marca la escena del giro.
```

## 4. 🎥 Prompt de video IA (por escena)
```
Genera el prompt para [motor: Higgsfield/VEO/Kling]. Formato:
[RETRATO del personaje literal] + [acción] + [escenario de escenarios.md] +
[plano y lente: ej. 35mm, plano medio] + [movimiento de cámara] + [luz] +
[base de estilo del canal] + "hyper-detailed, cinematic, 8k, Netflix documentary look".
Personajes IDÉNTICOS en todas las escenas. Devuélveme un prompt por escena,
numerados, listos para copiar.
```
> Nota por motor (ver `herramientas-ia.md`): **Flow (Veo 3.1)** = motor principal → ancla el personaje con *Ingredients to Video* (sube el RETRATO como imagen de referencia), monta en SceneBuilder, exporta 9:16 4K, silencia el diálogo generado. **Higgsfield** → cuando el plano vive del movimiento de cámara (describe el movimiento explícito). **Kling** → respaldo para acción/multitudes.

## 5. 🗣️ Narración (locución)
```
Toma el guion y divídelo por escena, dando el texto EXACTO de locución de cada
una, sincronizado con el storyboard (5-6s por escena, ~14-16 palabras).
Marca dónde baja la música y dónde va el silencio del giro.
```

## 6. 🔍 SEO
```
Para este video del canal EL ÚLTIMO NARRADOR genera:
- Título final (el de mayor CTR de 10 variantes)
- Descripción (2-3 frases con keywords naturales + 1 pregunta que invite a comentar)
- 15 hashtags (mezcla de amplios y de nicho, en español)
- 15 etiquetas/tags
- 8 keywords principales
- 1 comentario fijado que genere debate o dé un dato extra
Optimiza para búsqueda en español con baja competencia.
```

## 7. 🖼️ Miniatura
```
Propón 5 miniaturas usando las fórmulas de miniaturas.md. Para cada una:
composición, sujeto, texto sobreimpreso (3-5 palabras), paleta de marca.
Indica cuál tendría mayor CTR y por qué.
```

## 8. 🎬 Auto-crítica (Productor Ejecutivo)
```
Actúa como productor ejecutivo escéptico. Evalúa este paquete con el checklist
de puntuacion.md (10 preguntas). Puntúa /100. Si algo es débil, dime QUÉ
reescribir y por qué. Termina con: APROBADO / REESCRIBIR / DESCARTAR y
"el cambio #1 para duplicar las vistas".
```

---

## 🔗 Cadena completa (orden de ejecución)
1 Investigación → 2 Guion → **8 Auto-crítica** → (reescribir si hace falta) → 3 Storyboard → 4 Prompts video → 5 Narración → 6 SEO → 7 Miniatura → producir en IA → publicar → registrar en laboratorio.

> Trabajando conmigo en el chat, todo esto lo disparo con **`produce la #NN`**.
