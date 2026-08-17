@echo off
rem ===================================================================
rem  Instalacion. Doble clic UNA VEZ, la primera vez y despues de
rem  actualizar el codigo.
rem ===================================================================

cd /d "%~dp0.."
echo.
echo  ================================================
echo   Instalando. Tarda uno o dos minutos.
echo  ================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo  [!] Python no esta instalado, o no se marco la casilla
    echo      "Add python.exe to PATH" al instalarlo.
    echo.
    echo      Descargalo en https://www.python.org/downloads/
    echo      y MARCA esa casilla en la primera pantalla.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version') do echo  Python encontrado: %%v
echo.

if not exist ".venv\Scripts\python.exe" (
    echo  Creando el entorno...
    python -m venv .venv
    if errorlevel 1 goto :fallo
) else (
    echo  El entorno ya existe, lo reutilizo.
)

echo  Instalando librerias...
.venv\Scripts\python.exe -m pip install --quiet --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto :fallo

echo.
echo  ================================================
echo   Listo.
echo  ================================================
echo.
if not exist "windows\clave.bat" (
    echo   Siguiente paso: crear tu clave.
    echo.
    echo   1. Copia  windows\clave.ejemplo.bat
    echo   2. Renombra la copia a  clave.bat
    echo   3. Abrela con el Bloc de notas y pon tus datos
    echo.
) else (
    echo   Ya tienes tu clave puesta. Puedes usar grabar.bat
    echo.
)
pause
exit /b 0

:fallo
echo.
echo  [!] Algo fallo en la instalacion. Copia el texto de arriba
echo      y pasaselo a Claude.
echo.
pause
exit /b 1
