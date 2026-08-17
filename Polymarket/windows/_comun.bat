@echo off
rem ===================================================================
rem  Preparacion compartida por los demas .bat de esta carpeta.
rem  No se ejecuta solo: lo llaman los otros.
rem
rem  Comprueba en orden las tres cosas que pueden faltar, y para en la
rem  primera con un mensaje que dice que hacer. Un lanzador que falla
rem  con un error de Python no sirve de nada a quien no programa.
rem ===================================================================

cd /d "%~dp0.."

if not exist ".venv\Scripts\python.exe" (
    echo.
    echo  [!] Falta la instalacion.
    echo.
    echo      Haz doble clic en  windows\instalar.bat  y espera a que
    echo      termine. Solo hay que hacerlo una vez.
    echo.
    pause
    exit /b 1
)

if not exist "windows\clave.bat" (
    echo.
    echo  [!] Falta tu clave.
    echo.
    echo      1. Copia  windows\clave.ejemplo.bat
    echo      2. Renombra la copia a  clave.bat
    echo      3. Abrela con el Bloc de notas y pon tu key_id y tu secret
    echo.
    pause
    exit /b 1
)

call "windows\clave.bat"

if "%POLYMARKET_KEY_ID%"=="pon_aqui_tu_key_id" (
    echo.
    echo  [!] clave.bat todavia tiene el texto de ejemplo.
    echo      Abrelo con el Bloc de notas y pon tus datos de verdad.
    echo.
    pause
    exit /b 1
)

set PYTHONPATH=src
set PMBOT=.venv\Scripts\python.exe -m pmbot.cli
exit /b 0
