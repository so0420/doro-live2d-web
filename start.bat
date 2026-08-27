@echo off
cd /d "%~dp0"
start "" http://localhost:8012/
node server.js
pause
