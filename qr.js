const qrcode = require('qrcode-terminal');

const { networkInterfaces } = require('os');
const nets = networkInterfaces();
const results = {};

for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
    if (net.family === 'IPv4' && !net.internal) {
      if (!results[name]) {
        results[name] = [];
      }
      results[name].push(net.address);
    }
  }
}

console.log('Available on:');
for (const [key, value] of Object.entries(results)) {
  console.log(`${key}: ${value.join(', ')}:3002`);
  const url = `http://${value[0]}:3002`;
  console.log(`Access from your phone at: ${url}`);
  console.log('\nScan this QR code with your phone camera:');
  qrcode.generate(url, {small: true});
}
