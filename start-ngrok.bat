@echo off
echo Starting ngrok tunnel for voice call website...

REM Run ngrok and capture its output
FOR /F "tokens=* USEBACKQ" %%F IN (`ngrok http 3002 --log=stdout`) DO (
  SET ngrok_output=%%F
  echo %%F
  
  REM Extract the forwarding URL from ngrok output
  echo %%F | findstr "Forwarding" > nul
  if not errorlevel 1 (
    FOR /F "tokens=2 delims= " %%U IN ("%%F") DO (
      SET ngrok_url=%%U
      echo.
      echo ======================================================
      echo Twilio Configuration Instructions:
      echo ======================================================
      echo 1. Go to your Twilio dashboard: https://www.twilio.com/console/phone-numbers
      echo 2. Click on your phone number: +18312636136
      echo 3. Under "Voice & Fax", set the following:
      echo    - A call comes in: Webhook
      echo    - URL: %%U/voice [POST]
      echo    - Status Callback URL: %%U/call-status [POST]
      echo 4. Click Save
      echo ======================================================
      echo.
    )
  )
)

echo Ngrok tunnel closed.
