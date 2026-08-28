# Aroma World — Estudio de Fórmulas

Herramienta web para **crear, gestionar y optimizar fórmulas únicas de fragancia**.
Construida con Next.js 15 y Tailwind CSS 4. No requiere base de datos ni servicios
externos: todo se guarda de forma persistente en tu navegador y puedes exportar un
respaldo en JSON cuando quieras.

## ¿Qué puedes hacer?

- **Registrar fórmulas** con nombre, familia olfativa, descripción y concentración.
- **Añadir ingredientes** (materias primas) indicando su tipo de nota
  (salida / corazón / fondo), porcentaje y costo por kilogramo.
- **Ver la pirámide olfativa** con la distribución de notas y compararla con los
  rangos clásicos de equilibrio (salida 15–25%, corazón 30–40%, fondo 40–55%).
- **Optimizar** con un clic: normaliza todos los porcentajes para que sumen 100%
  manteniendo las proporciones.
- **Calcular costos**: costo del concentrado por kilogramo.
- **Calculadora de lotes**: indica el tamaño del producto final y obtén la cantidad
  exacta (en gramos) de cada ingrediente, el alcohol/diluyente necesario y el costo.
- **Respaldo y portabilidad**: exporta e importa tus fórmulas en un archivo JSON.

## Cómo ejecutarlo

```bash
npm install
npm run dev      # entorno de desarrollo en http://localhost:3000
```

Para producción:

```bash
npm run build
npm start
```

## Dónde se guardan los datos

Las fórmulas se guardan en el `localStorage` del navegador, es decir, **en el
dispositivo donde las creas**. Por eso:

- Usa **«Exportar respaldo»** con frecuencia para guardar un archivo JSON.
- Para pasar tus fórmulas a otra computadora, expórtalas y luego usa **«Importar»**.

> ¿Necesitas que las fórmulas se sincronicen entre varios dispositivos o usuarios?
> Se puede añadir más adelante una base de datos (por ejemplo Postgres o SQLite)
> con rutas de API de Next.js. La lógica de cálculo ya está separada en
> `src/lib/formulas.js`, lista para conectarse a un backend.

## Estructura del proyecto

```
src/
  app/
    layout.jsx           # Layout raíz (idioma es, metadatos)
    page.jsx             # Página principal → renderiza la app
  components/aroma/
    AromaApp.jsx         # Estado principal, persistencia, importar/exportar
    FormulaList.jsx      # Panel con la lista de fórmulas
    FormulaEditor.jsx    # Editor de una fórmula + análisis y calculadora
    PyramidBar.jsx       # Barra de la pirámide olfativa
  lib/
    formulas.js          # Modelo de datos, almacenamiento y cálculos
```
