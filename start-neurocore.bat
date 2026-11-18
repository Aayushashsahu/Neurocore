@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "NEUROCORE local server" /min cmd /c "py -m http.server 8000"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python was not found. Install Python 3, or open index.html directly in your browser.
    pause
    exit /b 1
  )
  start "NEUROCORE local server" /min cmd /c "python -m http.server 8000"
)
timeout /t 2 /nobreak >nul
start "" http://localhost:8000
 echo NEUROCORE is running at http://localhost:8000
endlocal
