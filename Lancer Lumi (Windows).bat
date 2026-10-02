@echo off
rem Lance le capteur PC de Lumi (Windows) puis ouvre Lumi dans le navigateur.
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 capteur\lumi_capteur.py
  goto fin
)
where python >nul 2>nul
if %errorlevel%==0 (
  python capteur\lumi_capteur.py
  goto fin
)
echo.
echo Python est introuvable sur cet ordinateur.
echo Installe-le depuis https://www.python.org/downloads/ (coche "Add python.exe to PATH"),
echo puis relance ce fichier. En attendant, ouvre index.html : Lumi marche aussi sans capteur.
:fin
pause
