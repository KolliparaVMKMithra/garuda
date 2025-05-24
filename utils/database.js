/**
 * Secure Database Module for Voice Call Recordings
 * Implements encrypted storage with access control
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Database settings
const DB_DIR = path.join(__dirname, '..', 'data');
const RECORDINGS_DIR = path.join(DB_DIR, 'recordings');
const KEYS_DIR = path.join(DB_DIR, 'keys');
const METADATA_FILE = path.join(DB_DIR, 'metadata.json');

// Ensure database directories exist
function initializeDatabase() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(RECORDINGS_DIR)) {
      fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(KEYS_DIR)) {
      fs.mkdirSync(KEYS_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(METADATA_FILE)) {
      fs.writeFileSync(METADATA_FILE, JSON.stringify({
        recordings: [],
        lastUpdated: Date.now()
      }));
    }
    
    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    return false;
  }
}

/**
 * Store an encrypted recording in the database
 * @param {Object} encryptedRecording - The encrypted recording data
 * @param {string} callId - The ID of the call
 * @param {Array} participants - Array of participant IDs
 * @returns {string} The ID of the stored recording
 */
async function storeRecording(encryptedRecording, callId, participants) {
  try {
    // Initialize database if needed
    initializeDatabase();
    
    // Generate a unique ID for the recording
    const recordingId = `rec_${callId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    // Store the encrypted chunks
    const recordingPath = path.join(RECORDINGS_DIR, `${recordingId}.json`);
    fs.writeFileSync(recordingPath, JSON.stringify(encryptedRecording));
    
    // Update metadata
    const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    metadata.recordings.push({
      id: recordingId,
      callId,
      participants,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: null
    });
    metadata.lastUpdated = Date.now();
    
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
    
    console.log(`Recording ${recordingId} stored successfully`);
    return recordingId;
  } catch (error) {
    console.error('Failed to store recording:', error);
    throw new Error('Failed to store recording');
  }
}

/**
 * Retrieve an encrypted recording from the database
 * @param {string} recordingId - The ID of the recording to retrieve
 * @param {string} userId - The ID of the user requesting the recording
 * @param {string} authToken - Authentication token for verification
 * @returns {Object} The encrypted recording
 */
async function retrieveRecording(recordingId, userId, authToken) {
  try {
    // Verify the user has access to this recording
    const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    const recordingMeta = metadata.recordings.find(r => r.id === recordingId);
    
    if (!recordingMeta) {
      throw new Error('Recording not found');
    }
    
    // Check if user is a participant
    if (!recordingMeta.participants.includes(userId)) {
      throw new Error('Access denied: User is not a participant in this recording');
    }
    
    // Verify auth token (simplified for demo)
    // In a real app, we'd use a proper authentication system
    if (!authToken || authToken.length < 10) {
      throw new Error('Invalid authentication token');
    }
    
    // Load the recording
    const recordingPath = path.join(RECORDINGS_DIR, `${recordingId}.json`);
    const encryptedRecording = JSON.parse(fs.readFileSync(recordingPath, 'utf8'));
    
    // Update access metadata
    recordingMeta.accessCount += 1;
    recordingMeta.lastAccessed = Date.now();
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
    
    // Log access for audit trail
    logAccess(recordingId, userId, 'retrieve');
    
    return encryptedRecording;
  } catch (error) {
    console.error(`Failed to retrieve recording ${recordingId}:`, error);
    throw error;
  }
}

/**
 * List all recordings a user has access to
 * @param {string} userId - The ID of the user
 * @returns {Array} Array of recording metadata objects
 */
function listUserRecordings(userId) {
  try {
    const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    
    // Filter recordings where user is a participant
    const userRecordings = metadata.recordings.filter(recording => {
      return recording.participants.includes(userId);
    });
    
    // Return sanitized metadata (without sensitive info)
    return userRecordings.map(recording => ({
      id: recording.id,
      callId: recording.callId,
      timestamp: recording.timestamp,
      participantCount: recording.participants.length
    }));
  } catch (error) {
    console.error('Failed to list user recordings:', error);
    return [];
  }
}

/**
 * Delete a recording from the database
 * @param {string} recordingId - The ID of the recording to delete
 * @param {string} userId - The ID of the user requesting deletion
 * @param {boolean} isHost - Whether the user is the host of the call
 * @returns {boolean} Whether the deletion was successful
 */
async function deleteRecording(recordingId, userId, isHost) {
  try {
    const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    const recordingIndex = metadata.recordings.findIndex(r => r.id === recordingId);
    
    if (recordingIndex === -1) {
      throw new Error('Recording not found');
    }
    
    const recording = metadata.recordings[recordingIndex];
    
    // Only the host or an admin can delete recordings
    if (!isHost && recording.participants[0] !== userId) {
      throw new Error('Access denied: Only the host can delete recordings');
    }
    
    // Delete the recording file
    const recordingPath = path.join(RECORDINGS_DIR, `${recordingId}.json`);
    fs.unlinkSync(recordingPath);
    
    // Update metadata
    metadata.recordings.splice(recordingIndex, 1);
    metadata.lastUpdated = Date.now();
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
    
    // Log deletion for audit trail
    logAccess(recordingId, userId, 'delete');
    
    return true;
  } catch (error) {
    console.error(`Failed to delete recording ${recordingId}:`, error);
    return false;
  }
}

/**
 * Log access to recordings for audit purposes
 * @param {string} recordingId - The ID of the accessed recording
 * @param {string} userId - The ID of the user who accessed it
 * @param {string} action - The action performed (retrieve, delete, etc.)
 */
function logAccess(recordingId, userId, action) {
  try {
    const logDir = path.join(DB_DIR, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, `access_${new Date().toISOString().split('T')[0]}.log`);
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} | ${userId} | ${action} | ${recordingId}\n`;
    
    fs.appendFileSync(logFile, logEntry);
  } catch (error) {
    console.error('Failed to log access:', error);
  }
}

/**
 * Store a participant's key pair
 * @param {string} userId - The user's ID
 * @param {Object} keyPair - The user's key pair (public and private keys)
 */
function storeUserKeys(userId, keyPair) {
  try {
    const userKeyPath = path.join(KEYS_DIR, `${userId}.json`);
    fs.writeFileSync(userKeyPath, JSON.stringify(keyPair));
    return true;
  } catch (error) {
    console.error(`Failed to store keys for user ${userId}:`, error);
    return false;
  }
}

/**
 * Retrieve a participant's key pair
 * @param {string} userId - The user's ID
 * @returns {Object} The user's key pair
 */
function getUserKeys(userId) {
  try {
    const userKeyPath = path.join(KEYS_DIR, `${userId}.json`);
    if (!fs.existsSync(userKeyPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(userKeyPath, 'utf8'));
  } catch (error) {
    console.error(`Failed to retrieve keys for user ${userId}:`, error);
    return null;
  }
}

module.exports = {
  initializeDatabase,
  storeRecording,
  retrieveRecording,
  listUserRecordings,
  deleteRecording,
  storeUserKeys,
  getUserKeys
};
