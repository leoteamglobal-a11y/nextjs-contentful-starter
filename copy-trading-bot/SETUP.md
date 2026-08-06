# Guía de instalación paso a paso (para principiantes)

Esta guía te lleva de cero a tener el **monitor de alertas** corriendo en tu
computadora. No necesitás saber programar — solo copiar y pegar comandos.

> ⏱️ Tiempo estimado: 15–20 minutos.
> 💸 Costo: $0 (todo tiene plan gratis).
> 🔒 Este monitor **no toca tus fondos**. Solo lee la blockchain y te avisa.

---

## Paso 1 — Instalar Node.js

Node.js es el programa que hace correr el bot.

1. Andá a **https://nodejs.org**
2. Descargá la versión **LTS** (el botón de la izquierda).
3. Instalala (siguiente → siguiente → listo).
4. Para confirmar que quedó instalado, abrí una terminal:
   - **Windows:** tecla Windows → escribí `cmd` → Enter.
   - **Mac:** Cmd+Espacio → escribí `Terminal` → Enter.
5. Escribí esto y apretá Enter:
   ```bash
   node --version
   ```
   Si ves algo como `v20.x.x`, ✅ funciona.

---

## Paso 2 — Descargar el código

En la misma terminal, pegá estos comandos uno por uno:

```bash
git clone https://github.com/leoteamglobal-a11y/nextjs-contentful-starter.git
cd nextjs-contentful-starter/copy-trading-bot
npm install
```

> ¿No tenés `git`? Descargalo en https://git-scm.com o bajá el proyecto como ZIP
> desde GitHub (botón verde "Code" → "Download ZIP") y descomprimilo.

El `npm install` baja lo que el bot necesita. Esperá a que termine.

---

## Paso 3 — Probarlo YA (sin configurar nada)

Antes de sacar claves, comprobá que todo anda con la demo offline:

```bash
npm run watch:demo
```

Deberías ver alertas de ejemplo: una **NEW ENTRY**, una **EXIT**, y un aviso de
que el **ADD fue silenciado** (anti-chase). Si ves eso, ✅ el bot funciona.

---

## Paso 4 — Sacar tu API key de Helius (gratis)

Helius es lo que le deja al bot leer la blockchain de Solana.

1. Andá a **https://dashboard.helius.dev** y creá una cuenta (gratis).
2. En el panel vas a ver una **API Key** (una cadena larga de letras y números).
3. Copiala. La usás en el Paso 6.

---

## Paso 5 — Crear tu bot de Telegram (opcional pero recomendado)

Para recibir las alertas en el celular.

1. Abrí Telegram y buscá **@BotFather**.
2. Mandale `/newbot` y seguí los pasos (nombre + usuario que termine en `bot`).
3. Te va a dar un **token** (algo como `123456:ABC-DEF...`). Copialo.
4. Ahora buscá **@userinfobot**, abrilo y mandale cualquier mensaje.
5. Te responde con tu **Id** (un número). Copialo — ese es tu `chat_id`.
6. Importante: abrí tu bot nuevo (el que creaste) y mandale `/start`, así puede
   escribirte.

> Si te saltás este paso, no pasa nada: las alertas salen por la terminal.

---

## Paso 6 — Configurar tus claves

1. En la carpeta `copy-trading-bot`, copiá el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```
   (En Windows, si `cp` no anda: `copy .env.example .env`)

2. Abrí el archivo `.env` con el Bloc de notas (o cualquier editor) y completá:
   ```
   HELIUS_API_KEY=pegá-acá-tu-key-de-helius
   TELEGRAM_BOT_TOKEN=pegá-acá-el-token-del-bot
   TELEGRAM_CHAT_ID=pegá-acá-tu-id
   ```
   Guardá y cerrá.

> 🔒 **Nunca compartas tu `.env`.** Contiene tus claves. Ya está protegido para
> que no se suba a GitHub por accidente.

---

## Paso 7 — Encenderlo

**Una pasada de prueba** (revisa una vez y termina):
```bash
npm run watch:once
```

**Vigilancia continua** (queda corriendo y te alerta):
```bash
npm run watch
```
Dejá esa ventana abierta. Cada vez que **@reboot abra una posición nueva** o
**cierre una**, te llega la alerta. Para parar: `Ctrl + C`.

---

## ¿Cómo agrego o cambio wallets?

Abrí el archivo `watchlist.json` y agregá wallets a la lista:

```json
{
  "targets": [
    { "wallet": "H1XD6MKNWhJDaNBgsJxNWCMEb7yTTMeqCod1jfYhh9iq", "label": "@reboot" },
    { "wallet": "otra-direccion-aca", "label": "@otro-trader" }
  ]
}
```

Para **analizar** una wallet antes de vigilarla (ver si vale la pena):
```bash
npm run analyze -- LA_DIRECCION_DE_LA_WALLET
```

---

## Problemas comunes

| Síntoma | Solución |
|---|---|
| `node no se reconoce` | Reiniciá la terminal después de instalar Node. |
| `HELIUS_API_KEY is not set` | Te faltó completar el `.env` (Paso 6). |
| No llegan alertas a Telegram | ¿Le mandaste `/start` a tu bot? ¿El `chat_id` es correcto? |
| No pasa nada al correr `watch` | Es normal: solo alerta cuando el trader hace algo nuevo. Probá `watch:demo` para ver alertas de ejemplo. |

---

## Recordá siempre

- Esto **no es consejo financiero**. El copy trading tiene riesgo real de pérdida.
- El monitor **solo avisa** — vos decidís si operás, a mano, con lo que puedas
  perder.
- Mirá las alertas unas semanas **antes** de arriesgar plata. Aprendé primero.
