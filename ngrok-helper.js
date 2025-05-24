const { exec } = require('child_process');
const fs = require('fs');

console.log('Starting ngrok tunnel...');

// Run ngrok
const ngrok = exec('ngrok http 3002');

// Listen for output
ngrok.stdout.on('data', (data) => {
  console.log(data);
  
  // Look for the forwarding URL
  const match = data.toString().match(/Forwarding\s+(https:\/\/[\w-]+\.ngrok\.io)/i);
  if (match && match[1]) {
    const url = match[1];
    console.log('\n==================================================');
    console.log('TWILIO CONFIGURATION INSTRUCTIONS:');
    console.log('==================================================');
    console.log('1. Go to your Twilio dashboard: https://www.twilio.com/console/phone-numbers');
    console.log('2. Click on your phone number: +18312636136');
    console.log('3. Under "Voice & Fax", set the following:');
    console.log(`   - A call comes in: Webhook`);
    console.log(`   - URL: ${url}/voice [POST]`);
    console.log(`   - Status Callback URL: ${url}/call-status [POST]`);
    console.log('4. Click Save');
    console.log('==================================================\n');
    
    // Save the URL to a file for reference
    fs.writeFileSync('ngrok-url.txt', `${url}\n\nVoice URL: ${url}/voice\nStatus URL: ${url}/call-status`);
  }
});

ngrok.stderr.on('data', (data) => {
  console.error(data);
});

ngrok.on('close', (code) => {
  console.log(`ngrok process exited with code ${code}`);
});

// Keep the script running
process.stdin.resume();
