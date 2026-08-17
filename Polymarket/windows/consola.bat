@echo off
rem ===================================================================
rem  CONSOLA - abre una ventana con todo preparado.
rem
rem  Para cuando quieras escribir comandos a mano: buscar mercados,
rem  ver un informe, lanzar un backtest.
rem
rem  La clave se carga como variables de entorno, y las variables SI
rem  las hereda la ventana hija que abre `cmd /k` al final. Por eso
rem  aqui no hace falta ningun truco: `pmbot` funciona porque hay un
rem  pmbot.bat en la carpeta del proyecto.
rem ===================================================================

call "%~dp0_comun.bat"
if errorlevel 1 exit /b 1

cls
echo.
echo  ================================================
echo   Consola lista. Escribe los comandos con "pmbot"
echo  ================================================
echo.
echo   pmbot doctor                    ver si todo conecta
echo   pmbot search "mlb"              buscar mercados
echo   pmbot market UN-SLUG            detalles de un mercado
echo   pmbot report journal\ARCHIVO    que capturo una grabacion
echo   pmbot backtest journal\ARCHIVO  pasar los datos por la estrategia
echo.
echo   Para cerrar: escribe  exit
echo.

cmd /k
