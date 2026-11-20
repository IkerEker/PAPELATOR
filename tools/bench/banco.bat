@echo off
rem PAPELATOR · banco de pruebas del motor (sin Photoshop). Doble clic. Necesita Node 18 o superior (https://nodejs.org).
rem Escribe tools\bench\resultados\motor_<PC>_<fecha>.json. Deja el PC tranquilo mientras corre (unos minutos).
cd /d "%~dp0\..\.."
node --max-old-space-size=12000 tools\bench\banco.js %*
pause
