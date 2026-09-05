@echo off
echo Setting up Vehicle Detection System...

:: Get WSL IP automatically
for /f "tokens=*" %%a in ('wsl hostname -I') do set WSL_IPS=%%a
for /f "tokens=1" %%a in ("%WSL_IPS%") do set WSL_IP=%%a

echo WSL IP detected: %WSL_IP%

:: Remove old proxy rules if they exist
netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=0.0.0.0 >nul 2>&1
netsh interface portproxy delete v4tov4 listenport=5000 listenaddress=0.0.0.0 >nul 2>&1

:: Add new proxy rules
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=%WSL_IP%
netsh interface portproxy add v4tov4 listenport=5000 listenaddress=0.0.0.0 connectport=5000 connectaddress=%WSL_IP%

:: Start Docker containers in WSL
echo Starting Docker containers...
wsl -e bash -c "cd ~/\"IIA Projects\"/vehicle-detection && ./docker.sh up &"

echo.
echo Done! Open your browser and go to:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:5000
echo.
pause