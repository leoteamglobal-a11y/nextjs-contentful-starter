#!/usr/bin/env bash
# Auto-save hook: al terminar cada turno de Claude, guarda el transcript de la
# conversacion y hace commit+push del trabajo a la rama actual.
# Objetivo: en entornos efimeros (contenedor que se recicla) nunca perder nada.
# Activar registrandolo como hook "Stop" en ~/.claude/settings.json (ver SETUP).
set -uo pipefail
REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$REPO" || exit 0
INPUT="$(cat)"
TRANSCRIPT="$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)"
SESSION="$(printf '%s' "$INPUT" | jq -r '.session_id // "session"' 2>/dev/null)"
if [ -n "${TRANSCRIPT:-}" ] && [ -f "$TRANSCRIPT" ]; then
  mkdir -p "$REPO/.conversations"
  cp "$TRANSCRIPT" "$REPO/.conversations/${SESSION}.jsonl" 2>/dev/null || true
fi
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
{ [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; } && exit 0
git add -A 2>/dev/null
git -c user.name="claude-autosave" -c user.email="noreply@anthropic.com" \
    commit -q -m "auto-save: progreso guardado" 2>/dev/null || exit 0
for delay in 0 2 4 8; do
  [ "$delay" -gt 0 ] && sleep "$delay"
  git push -u origin "$BRANCH" >/dev/null 2>&1 && exit 0
done
exit 0
