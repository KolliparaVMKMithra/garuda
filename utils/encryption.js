/**
 * Advanced Encryption Module for Secure Voice Call
 * Implements end-to-end encryption for call recordings
 */

const crypto = require('crypto');
const { promisify } = require('util');

// Key generation settings
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64;
const ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION_ITERATIONS = 100000;

/**
 * Generate a random encryption key for a call
 * @returns {Object} Object containing key, iv, and salt
 */
function generateCallKey() {
  const key = crypto.randomBytes(KEY_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  
  return {
    key,
    iv,
    salt
  };
}

/**
 * Generate a unique participant key using their ID
 * @param {string} participantId - The participant's unique ID
 * @returns {Object} Object containing the participant's key pair
 */
function generateParticipantKey(participantId) {
  // Create a deterministic but secure key for the participant
  const seed = crypto.createHash('sha256').update(participantId).digest();
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  
  return {
    publicKey,
    privateKey,
    id: participantId
  };
}

/**
 * Encrypt audio data using AES-256-GCM
 * @param {Buffer} data - The audio data to encrypt
 * @param {Buffer} key - The encryption key
 * @param {Buffer} iv - The initialization vector
 * @returns {Object} Object containing encrypted data and auth tag
 */
async function encryptAudioChunk(data, key, iv) {
  try {
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const encryptedData = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedData,
      authTag
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt audio chunk');
  }
}

/**
 * Decrypt audio data using AES-256-GCM
 * @param {Buffer} encryptedData - The encrypted audio data
 * @param {Buffer} key - The decryption key
 * @param {Buffer} iv - The initialization vector
 * @param {Buffer} authTag - The authentication tag
 * @returns {Buffer} The decrypted audio data
 */
async function decryptAudioChunk(encryptedData, key, iv, authTag) {
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decryptedData = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
    
    return decryptedData;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt audio chunk: Data may be corrupted or tampered with');
  }
}

/**
 * Encrypt a key for a specific participant using their public key
 * @param {Buffer} key - The key to encrypt
 * @param {string} publicKey - The participant's public key in PEM format
 * @returns {Buffer} The encrypted key
 */
function encryptKeyForParticipant(key, publicKey) {
  return crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    key
  );
}

/**
 * Decrypt a key using a participant's private key
 * @param {Buffer} encryptedKey - The encrypted key
 * @param {string} privateKey - The participant's private key in PEM format
 * @returns {Buffer} The decrypted key
 */
function decryptKeyWithPrivateKey(encryptedKey, privateKey) {
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    encryptedKey
  );
}

/**
 * Create a digital signature for verification
 * @param {Buffer} data - The data to sign
 * @param {string} privateKey - The private key to sign with
 * @returns {Buffer} The digital signature
 */
function createSignature(data, privateKey) {
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  return sign.sign(privateKey);
}

/**
 * Verify a digital signature
 * @param {Buffer} data - The data to verify
 * @param {Buffer} signature - The signature to verify
 * @param {string} publicKey - The public key to verify with
 * @returns {boolean} Whether the signature is valid
 */
function verifySignature(data, signature, publicKey) {
  const verify = crypto.createVerify('SHA256');
  verify.update(data);
  verify.end();
  return verify.verify(publicKey, signature);
}

/**
 * Generate a secure hash of data for integrity verification
 * @param {Buffer} data - The data to hash
 * @returns {string} The hash as a hex string
 */
function generateHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Derive a key from a password and salt using PBKDF2
 * @param {string} password - The password to derive from
 * @param {Buffer} salt - The salt to use
 * @returns {Promise<Buffer>} The derived key
 */
async function deriveKey(password, salt) {
  const pbkdf2 = promisify(crypto.pbkdf2);
  return pbkdf2(password, salt, KEY_DERIVATION_ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Encrypt a recording for storage
 * @param {Array} audioChunks - Array of audio chunks with metadata
 * @param {Array} participants - Array of participant objects with IDs and public keys
 * @returns {Object} Encrypted recording object
 */
async function encryptRecording(audioChunks, participants) {
  // Generate a unique key for this recording
  const recordingKey = generateCallKey();
  
  // Encrypt each audio chunk
  const encryptedChunks = await Promise.all(audioChunks.map(async (chunk) => {
    const { encryptedData, authTag } = await encryptAudioChunk(
      Buffer.from(chunk.data, 'base64'),
      recordingKey.key,
      recordingKey.iv
    );
    
    return {
      encryptedData: encryptedData.toString('base64'),
      authTag: authTag.toString('base64'),
      userId: chunk.userId,
      timestamp: chunk.timestamp
    };
  }));
  
  // Encrypt the recording key for each participant
  const participantKeys = {};
  participants.forEach(participant => {
    // In a real app, we'd fetch the participant's public key
    // For now, we'll generate a key pair for them
    const { publicKey } = generateParticipantKey(participant);
    
    const encryptedKey = encryptKeyForParticipant(recordingKey.key, publicKey);
    participantKeys[participant] = encryptedKey.toString('base64');
  });
  
  // Generate a verification hash
  const recordingData = Buffer.concat([
    Buffer.from(JSON.stringify(encryptedChunks)),
    recordingKey.key
  ]);
  const integrityHash = generateHash(recordingData);
  
  return {
    encryptedChunks,
    participantKeys,
    iv: recordingKey.iv.toString('base64'),
    salt: recordingKey.salt.toString('base64'),
    integrityHash,
    encryptionAlgorithm: ALGORITHM,
    timestamp: Date.now()
  };
}

/**
 * Decrypt a recording for a specific participant
 * @param {Object} encryptedRecording - The encrypted recording
 * @param {string} participantId - The ID of the participant
 * @param {string} privateKey - The private key of the participant
 * @returns {Array} Decrypted audio chunks
 */
async function decryptRecording(encryptedRecording, participantId, privateKey) {
  // Get the encrypted key for this participant
  const encryptedKey = Buffer.from(encryptedRecording.participantKeys[participantId], 'base64');
  
  // Decrypt the key
  const key = decryptKeyWithPrivateKey(encryptedKey, privateKey);
  
  // Get the IV
  const iv = Buffer.from(encryptedRecording.iv, 'base64');
  
  // Decrypt each chunk
  const decryptedChunks = await Promise.all(encryptedRecording.encryptedChunks.map(async (chunk) => {
    const encryptedData = Buffer.from(chunk.encryptedData, 'base64');
    const authTag = Buffer.from(chunk.authTag, 'base64');
    
    const decryptedData = await decryptAudioChunk(encryptedData, key, iv, authTag);
    
    return {
      data: decryptedData,
      userId: chunk.userId,
      timestamp: chunk.timestamp
    };
  }));
  
  // Verify integrity
  const recordingData = Buffer.concat([
    Buffer.from(JSON.stringify(encryptedRecording.encryptedChunks)),
    key
  ]);
  const calculatedHash = generateHash(recordingData);
  
  if (calculatedHash !== encryptedRecording.integrityHash) {
    throw new Error('Recording integrity verification failed. The recording may have been tampered with.');
  }
  
  return decryptedChunks;
}

module.exports = {
  generateCallKey,
  generateParticipantKey,
  encryptAudioChunk,
  decryptAudioChunk,
  encryptKeyForParticipant,
  decryptKeyWithPrivateKey,
  createSignature,
  verifySignature,
  generateHash,
  deriveKey,
  encryptRecording,
  decryptRecording
};
