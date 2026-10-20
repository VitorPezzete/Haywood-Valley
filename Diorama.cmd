@echo off
rem Diorama: liga a ponte do plugin Diorama (tools/diorama_ponte.mjs) com o --plugin-watch.
rem Dois cliques neste arquivo. Se a ponte ja estiver no ar, avisa e fecha. Feche a janela para desligar.
chcp 65001 >nul
title Diorama — ponte
cd /d "%~dp0"
curl.exe -s -o nul -m 2 http://127.0.0.1:34873/status
if %errorlevel%==0 (
  echo.
  echo   A ponte do Diorama ja esta ligada. Nada a fazer.
  echo   Esta janela fecha sozinha.
  "%SystemRoot%\System32\timeout.exe" /t 4 >nul
  exit /b 0
)
set "PATH=C:\Program Files\nodejs;%USERPROFILE%\.aftman\bin;%PATH%"
if not exist "C:\Program Files\nodejs\node.exe" (
  echo   Nao achei o Node em C:\Program Files\nodejs. Instale o Node e tente de novo.
  pause
  exit /b 1
)
echo.
echo   Ligando a ponte do Diorama. Deixe esta janela aberta; feche para desligar.
echo.
"C:\Program Files\nodejs\node.exe" tools\diorama_ponte.mjs --plugin-watch
echo.
echo   A ponte parou.
pause
