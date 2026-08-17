@echo off
rem ===================================================================
rem  Atajo para escribir `pmbot ...` en vez de la ruta larga.
rem
rem  Funciona porque cmd busca en la carpeta actual antes que en el
rem  PATH, asi que estando en la carpeta del proyecto `pmbot doctor`
rem  encuentra este archivo. Se apana solo el PYTHONPATH, de modo que
rem  no depende de que la ventana venga preparada.
rem
rem  La clave si tiene que venir del entorno: la pone consola.bat.
rem ===================================================================

setlocal
set PYTHONPATH=%~dp0src
"%~dp0.venv\Scripts\python.exe" -m pmbot.cli %*
exit /b %errorlevel%
