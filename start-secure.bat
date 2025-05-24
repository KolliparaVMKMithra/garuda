@echo off
echo Starting Voice Call Website with secure tunnel...

REM Start the Node.js server in the background
start cmd /k "npm start"

REM Wait for the server to start
timeout /t 5

REM Start localtunnel to create a secure HTTPS URL
start cmd /k "lt --port 3001 --subdomain voice-call-website"

echo Server started! Check the command windows for the secure URL.
