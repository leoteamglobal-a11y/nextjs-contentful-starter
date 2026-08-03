# Auto-guardado (nunca perder trabajo)

En entornos efímeros (Claude Code en la nube / contenedores que se reciclan),
**solo sobrevive lo que se hace `git commit` + `git push`**. Todo lo demás se
pierde al cerrar la sesión.

Este repo incluye `.claude/hooks/autosave.sh`, que en cada turno:

1. Copia el transcript de la conversación a `.conversations/`.
2. Hace `git add -A` + `commit` del trabajo.
3. Hace `git push` a la rama actual (con reintentos).

## Cómo activarlo (una sola vez, lo hace el usuario)

El clasificador de seguridad no permite que el agente se auto-instale una
automatización que hace `push` solo — hay que aprobarlo manualmente:

1. Registrar el hook en `~/.claude/settings.json` (global, todos los repos):

   ```json
   {
     "hooks": {
       "Stop": [
         { "hooks": [ { "type": "command", "command": "bash ~/.claude/hooks/autosave.sh", "timeout": 120 } ] }
       ]
     }
   }
   ```

   (Copiar también el script a `~/.claude/hooks/autosave.sh` para que aplique
   fuera de este repo.)

2. Ejecutar `/hooks` en Claude Code para recargar la config.

Desde ahí, cada turno se guarda y sube solo.

## Red de seguridad manual (siempre funciona)

Antes de cerrar, decir **"guardá y subí"** → commit + push inmediato.
Regla acordada: **"guardar" = commit + push a GitHub**, no basta con decir
"guardado".
