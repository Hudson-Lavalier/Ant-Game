@echo off
REM UNDERFOOT QUICK LAUNCHER: opens the local HTML game from this folder.
REM Use npm start instead when a localhost server is preferred for development.
cd /d "%~dp0"
start "" "%~dp0index.html"
