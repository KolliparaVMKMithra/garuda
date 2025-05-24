# Real-time Secure Voice Call Application

A real-time voice call application with advanced encryption and security features for the cybersecurity hackathon. This application demonstrates secure communication with end-to-end encryption, access control, and integrity verification. This is a real-time voice call website that allows users to make voice calls through their web browsers using WebRTC and Socket.IO.

## Features

- Real-time voice calls using WebRTC and Socket.IO
- Audio file upload and playback during calls
- Call approval system for secure participant management
- Automatic call recording with advanced encryption
- Simple and intuitive user interface

## Security Features

### End-to-End Encryption
- **AES-256-GCM Encryption**: All audio data is encrypted using the Advanced Encryption Standard with 256-bit keys in Galois/Counter Mode
- **RSA Key Exchange**: Secure key exchange using RSA-2048 asymmetric encryption
- **Unique Keys Per Call**: Each call generates a unique encryption key that is securely shared only with participants

### Access Control
- **Participant-Based Access**: Only participants of a call can access its recordings
- **Time-Limited Access Tokens**: Access tokens expire after a set time for enhanced security
- **Multi-Factor Authentication**: Access to recordings requires both an access token and user verification

### Data Integrity
- **Digital Signatures**: Recordings are digitally signed to verify authenticity
- **Integrity Verification**: Hash verification ensures recordings haven't been tampered with
- **Audit Logging**: All access attempts are logged for security analysis

### Secure Storage
- **Encrypted Storage**: Recordings are stored in an encrypted format
- **Secure Key Management**: Encryption keys are never stored in plaintext
- **Access Audit Trail**: Complete logs of who accessed recordings and when

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:3001`

## Usage

1. Click "Start Call" to initiate a voice call
2. Share the call ID with other participants
3. Other participants can join the call using the same ID
4. Click "End Call" to disconnect

## Technical Details

- Server: Node.js with Express and Socket.IO
- Client: HTML5, CSS3, JavaScript
- Audio Processing: Web Audio API
- Real-time Communication: Socket.IO

## Security Note

This is a basic implementation. For production use, consider:
- Adding authentication
- Implementing HTTPS
- Adding error handling
- Implementing proper CORS configuration
- Adding rate limiting
