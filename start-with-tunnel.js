const { spawn } = require('child_process');
const { createServer } = require('http');
const express = require('express');
const ngrok = require('ngrok');
const twilio = require('twilio');
const twilioConfig = require('./twilio-config');

// Start the main server process
console.log('Starting voice call server...');
const server = spawn('node', ['server.js'], { stdio: 'inherit' });

// Create a small admin server to display the ngrok URL
const app = express();
const adminServer = createServer(app);

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Voice Call Admin</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .container { background: #f5f5f5; padding: 20px; border-radius: 8px; }
          h1 { color: #1a73e8; }
          .url { background: #e6f4ea; padding: 10px; border-radius: 4px; margin: 10px 0; word-break: break-all; }
          .instructions { background: #fff; padding: 15px; border-radius: 4px; margin-top: 20px; border: 1px solid #ddd; }
          .instructions ol { padding-left: 20px; }
          .instructions li { margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Voice Call Website Admin</h1>
          <p>Your voice call website is running with Twilio integration.</p>
          
          ${global.ngrokUrl ? `
            <h2>Public URL:</h2>
            <div class="url">${global.ngrokUrl}</div>
            
            <h2>Twilio Configuration:</h2>
            <div class="url">Voice URL: ${global.ngrokUrl}/voice (POST)</div>
            <div class="url">Status URL: ${global.ngrokUrl}/call-status (POST)</div>
            
            <div class="instructions">
              <h3>Instructions:</h3>
              <ol>
                <li>Go to your <a href="https://www.twilio.com/console/phone-numbers" target="_blank">Twilio dashboard</a></li>
                <li>Click on your phone number: ${twilioConfig.phoneNumber}</li>
                <li>Under "Voice & Fax", set the following:
                  <ul>
                    <li>A call comes in: Webhook</li>
                    <li>URL: ${global.ngrokUrl}/voice (POST)</li>
                    <li>Status Callback URL: ${global.ngrokUrl}/call-status (POST)</li>
                  </ul>
                </li>
                <li>Click Save</li>
                <li>Now you can call ${twilioConfig.phoneNumber} from any phone and answer it on your website!</li>
              </ol>
            </div>
          ` : `<p>Waiting for ngrok tunnel to be established...</p>`}
        </div>
      </body>
    </html>
  `);
});

// Start the admin server on a different port
const ADMIN_PORT = 3003;
adminServer.listen(ADMIN_PORT, () => {
  console.log(`Admin server running at http://localhost:${ADMIN_PORT}`);
});

// Start ngrok tunnel
async function startNgrok() {
  try {
    const url = await ngrok.connect(3002);
    global.ngrokUrl = url;
    
    console.log('\n==================================================');
    console.log('NGROK TUNNEL ESTABLISHED');
    console.log('==================================================');
    console.log(`Public URL: ${url}`);
    console.log('\nTwilio Configuration:');
    console.log(`Voice URL: ${url}/voice (POST)`);
    console.log(`Status URL: ${url}/call-status (POST)`);
    console.log('\nOpen the admin dashboard:');
    console.log(`http://localhost:${ADMIN_PORT}`);
    console.log('==================================================\n');
    
    // Automatically configure Twilio if credentials are valid
    try {
      const twilioClient = twilio(twilioConfig.accountSid, twilioConfig.authToken);
      await twilioClient.incomingPhoneNumbers(twilioConfig.phoneNumber)
        .update({
          voiceUrl: `${url}/voice`,
          statusCallback: `${url}/call-status`
        });
      console.log('Twilio phone number automatically configured!');
    } catch (err) {
      console.log('Could not automatically configure Twilio. Please configure manually.');
    }
    
  } catch (err) {
    console.error('Error starting ngrok:', err);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  
  // Close ngrok tunnel
  try {
    await ngrok.kill();
    console.log('Ngrok tunnel closed');
  } catch (err) {
    console.error('Error closing ngrok tunnel:', err);
  }
  
  // Kill the server process
  server.kill();
  
  // Close the admin server
  adminServer.close();
  
  process.exit(0);
});

// Start the ngrok tunnel
startNgrok();
