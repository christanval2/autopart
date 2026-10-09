@echo off
title AutoParts - Arret
echo Arret des serveurs AutoParts...
taskkill /FI "WINDOWTITLE eq AutoParts-Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq AutoParts-Web*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq AutoParts-Mobile*" /T /F >nul 2>&1
echo Fenetres fermees. PostgreSQL et Redis tournent toujours
echo (docker stop autoparts-postgres autoparts-redis pour les arreter).
pause
