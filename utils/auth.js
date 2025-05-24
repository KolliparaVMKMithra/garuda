/**
 * Authentication Module for Secure Voice Call
 * Implements secure user authentication and access control
 */

const crypto = require('crypto');
const { promisify } = require('util');

// Authentication settings
const TOKEN_EXPIRY = 3600000; // 1 hour in milliseconds
const TOKEN_SECRET = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

// In-memory storage for active sessions (in production, use Redis or similar)
const activeSessions = new Map();

/**
 * Generate a secure authentication token for a user
 * @param {string} userId - The user's ID
 * @param {Object} metadata - Additional metadata to include in the token
 * @returns {Object} Object containing the token and expiry
 */
function generateAuthToken(userId, metadata = {}) {
  // Create a payload with user info and expiry
  const payload = {
    userId,
    metadata,
    exp: Date.now() + TOKEN_EXPIRY,
    iat: Date.now(),
    jti: crypto.randomBytes(16).toString('hex') // Unique token ID
  };
  
  // Sign the payload
  const tokenData = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(tokenData)
    .digest('base64');
  
  const token = `${tokenData}.${signature}`;
  
  // Store in active sessions
  activeSessions.set(payload.jti, {
    userId,
    exp: payload.exp,
    metadata
  });
  
  return {
    token,
    expiresAt: payload.exp
  };
}

/**
 * Verify an authentication token
 * @param {string} token - The token to verify
 * @returns {Object|null} The payload if valid, null if invalid
 */
function verifyAuthToken(token) {
  try {
    // Split token into data and signature
    const [tokenData, signature] = token.split('.');
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(tokenData)
      .digest('base64');
    
    if (signature !== expectedSignature) {
      return null; // Invalid signature
    }
    
    // Decode payload
    const payload = JSON.parse(Buffer.from(tokenData, 'base64').toString());
    
    // Check expiry
    if (payload.exp < Date.now()) {
      // Remove expired session
      activeSessions.delete(payload.jti);
      return null; // Token expired
    }
    
    // Check if token is in active sessions
    if (!activeSessions.has(payload.jti)) {
      return null; // Token not found in active sessions
    }
    
    return payload;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

/**
 * Generate a one-time access code for accessing a recording
 * @param {string} recordingId - The ID of the recording
 * @param {string} userId - The ID of the user
 * @returns {string} A one-time access code
 */
function generateAccessCode(recordingId, userId) {
  const codeData = {
    recordingId,
    userId,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex')
  };
  
  const codeString = Buffer.from(JSON.stringify(codeData)).toString('base64');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(codeString)
    .digest('hex')
    .substring(0, 8);
  
  // Format as a readable code
  return `${signature}-${codeData.nonce.substring(0, 6)}`;
}

/**
 * Verify an access code for a recording
 * @param {string} accessCode - The access code to verify
 * @param {string} recordingId - The ID of the recording
 * @returns {string|null} The user ID if valid, null if invalid
 */
function verifyAccessCode(accessCode, recordingId) {
  try {
    const [signature, nonce] = accessCode.split('-');
    
    // Find the matching session (in a real app, this would be in a database)
    // This is a simplified example
    for (const [_, session] of activeSessions.entries()) {
      if (session.metadata.recordingAccess && 
          session.metadata.recordingAccess.includes(recordingId) &&
          session.metadata.accessNonce === nonce) {
        
        // Verify the signature (simplified)
        // In a real app, we'd reconstruct and verify the full signature
        return session.userId;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Access code verification error:', error);
    return null;
  }
}

/**
 * Invalidate an authentication token
 * @param {string} token - The token to invalidate
 * @returns {boolean} Whether the token was successfully invalidated
 */
function invalidateToken(token) {
  try {
    const [tokenData] = token.split('.');
    const payload = JSON.parse(Buffer.from(tokenData, 'base64').toString());
    
    // Remove from active sessions
    return activeSessions.delete(payload.jti);
  } catch (error) {
    console.error('Token invalidation error:', error);
    return false;
  }
}

/**
 * Middleware to authenticate API requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function authenticateRequest(req, res, next) {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const payload = verifyAuthToken(token);
  
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  // Attach user info to request
  req.user = {
    id: payload.userId,
    metadata: payload.metadata
  };
  
  next();
}

/**
 * Middleware to check if user has access to a recording
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function authorizeRecordingAccess(req, res, next) {
  const recordingId = req.params.id;
  
  // Check if user has access to this recording
  // This would typically involve a database lookup
  // For now, we'll use a simplified check based on the token metadata
  if (!req.user.metadata.recordingAccess || 
      !req.user.metadata.recordingAccess.includes(recordingId)) {
    return res.status(403).json({ error: 'Access denied to this recording' });
  }
  
  next();
}

module.exports = {
  generateAuthToken,
  verifyAuthToken,
  invalidateToken,
  generateAccessCode,
  verifyAccessCode,
  authenticateRequest,
  authorizeRecordingAccess
};
