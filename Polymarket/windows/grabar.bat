@echo off
rem ===================================================================
rem  GRABAR - doble clic para empezar a grabar mercados.
rem
rem  Graba hasta que lo pares con Ctrl+C. Cuanto mas rato, mejores
rem  conclusiones. Los datos van a la carpeta journal\.
rem
rem  Para cambiar los mercados: edita la linea MERCADOS de abajo con
rem  el Bloc de notas. Los slugs salen del comando `search` (usa
rem  consola.bat).
rem ===================================================================

set MERCADOS=tec-mlb-nlchamp-2026-09-27-lad tec-mlb-champ-2026-09-27-atl tec-mlb-champ-2026-09-27-chc
set NOMBRE=mlb

call "%~dp0_comun.bat"
if errorlevel 1 exit /b 1

echo.
echo  ================================================
echo   Grabando: %NOMBRE%
echo.
echo   Para parar:  Ctrl + C
echo   No cierres esta ventana mientras grabe.
echo  ================================================
echo.

%PMBOT% watch %MERCADOS% --name %NOMBRE%

echo.
echo  Grabacion terminada. Los datos estan en journal\
echo.
pause
