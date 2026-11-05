@echo off
cd /d "%~dp0"
for /d %%D in ("%~dp0.runtime\node-*-win-x64") do set "PATH=%%~fD;%PATH%"
call npm.cmd start
pause
