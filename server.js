/**
 * Voice Call Server
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
// Serve files from amritapuri_first directory
app.use('/amritapuri_first', express.static(path.join(__dirname, '..', '..', 'amritapuri_first')));
app.use(express.json());

// Store active calls and pending approvals
const activeCalls = new Map();
const pendingApprovals = new Map();

// Socket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Request to join a call - now requires approval if call exists
  socket.on('join-call', (callId) => {
    console.log(`User ${socket.id} requesting to join call: ${callId}`);
    
    // Check if the call exists
    const room = io.sockets.adapter.rooms.get(callId);
    const hasParticipants = room && room.size > 0;
    
    if (hasParticipants) {
      // Call exists, request approval from host
      console.log(`Call ${callId} exists, requesting approval`);
      
      // Add to pending approvals
      if (!pendingApprovals.has(callId)) {
        pendingApprovals.set(callId, []);
      }
      
      pendingApprovals.get(callId).push({
        userId: socket.id,
        timestamp: Date.now()
      });
      
      // Notify the user they need approval
      socket.emit('approval-pending', {
        callId: callId
      });
      
      // Notify host of the join request
      socket.to(callId).emit('approval-requested', {
        userId: socket.id,
        callId: callId
      });
    } else {
      // This is a new call or user is the host, allow immediate join
      console.log(`User ${socket.id} starting new call or is host: ${callId}`);
      // Store call ID in socket data
      socket.data.callId = callId;
      
      // Add to active calls
      if (!activeCalls.has(callId)) {
        activeCalls.set(callId, [socket.id]);
      } else {
        activeCalls.get(callId).push(socket.id);
      }
      
      // Join the socket room
      socket.join(callId);
      
      // Notify user they've joined successfully
      socket.emit('call-joined', {
        callId: callId,
        isHost: true
      });
    }
  });
  
  // Handle call approval/rejection
  socket.on('approve-call', (data) => {
    const { userId, callId } = data;
    console.log(`User ${socket.id} approved ${userId} to join call ${callId}`);
    
    // Check if this user is in the call (can approve)
    if (socket.data.callId === callId) {
      // Remove from pending approvals
      if (pendingApprovals.has(callId)) {
        pendingApprovals.set(
          callId,
          pendingApprovals.get(callId).filter(req => req.userId !== userId)
        );
      }
      
      // Add to active calls
      if (activeCalls.has(callId)) {
        activeCalls.get(callId).push(userId);
      }
      
      // The userId socket will have its data.callId set when it joins
      
      // Notify the approved user
      io.to(userId).emit('call-approved', {
        callId: callId
      });
      
      // Socket join the room
      const userSocket = io.sockets.sockets.get(userId);
      if (userSocket) {
        userSocket.data.callId = callId;
        userSocket.join(callId);
      }
    }
  });
  
  socket.on('reject-call', (data) => {
    const { userId, callId } = data;
    console.log(`User ${socket.id} rejected ${userId} from joining call ${callId}`);
    
    // Check if this user is in the call (can reject)
    if (socket.data.callId === callId) {
      // Remove from pending approvals
      if (pendingApprovals.has(callId)) {
        pendingApprovals.set(
          callId,
          pendingApprovals.get(callId).filter(req => req.userId !== userId)
        );
      }
      
      // Notify the rejected user
      io.to(userId).emit('call-rejected', {
        callId: callId
      });
    }
  });

  // WebRTC signaling
  socket.on('ready', (callId) => {
    console.log(`User ${socket.id} is ready in call ${callId}`);
    // Notify all other users in the room that this user is ready to connect
    socket.to(callId).emit('user-ready', socket.id);
    
    // Get all users in the room and notify this user about them
    const room = io.sockets.adapter.rooms.get(callId);
    if (room) {
      // For each user in the room (except this one)
      for (const userId of room) {
        if (userId !== socket.id) {
          // Tell this socket about the existing user
          console.log(`Notifying ${socket.id} about existing user ${userId}`);
          socket.emit('user-ready', userId);
        }
      }
    }
  });

  socket.on('offer', (data) => {
    const { to, offer } = data;
    console.log(`Relaying offer from ${socket.id} to ${to}`);
    // Make sure the target socket exists before sending
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      console.log(`Target socket ${to} found, sending offer`);
      io.to(to).emit('offer', {
        from: socket.id,
        offer
      });
    } else {
      console.warn(`Target socket ${to} not found for offer`);
    }
  });

  socket.on('answer', (data) => {
    const { to, answer } = data;
    console.log(`Relaying answer from ${socket.id} to ${to}`);
    // Make sure the target socket exists before sending
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      console.log(`Target socket ${to} found, sending answer`);
      io.to(to).emit('answer', {
        from: socket.id,
        answer
      });
    } else {
      console.warn(`Target socket ${to} not found for answer`);
    }
  });

  socket.on('ice-candidate', (data) => {
    const { to, candidate } = data;
    console.log(`ICE candidate from ${socket.id} to ${to}`);
    
    // Make sure the target socket exists before sending
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      console.log(`Target socket ${to} found, sending ICE candidate`);
      io.to(to).emit('ice-candidate', {
        from: socket.id,
        candidate
      });
    } else {
      console.warn(`Target socket ${to} not found for ICE candidate`);
    }
  });

  socket.on('leave-call', (callId) => {
    const userCallId = socket.data.callId;
    if (userCallId && userCallId === callId) {
      console.log(`User ${socket.id} leaving call ${callId}`);
      socket.leave(callId);
      socket.data.callId = null;
      
      // Remove from active calls
      if (activeCalls.has(callId)) {
        activeCalls.set(
          callId,
          activeCalls.get(callId).filter(id => id !== socket.id)
        );
        
        // If no more users, remove the call
        if (activeCalls.get(callId).length === 0) {
          activeCalls.delete(callId);
        }
      }
      
      // Notify other participants
      socket.to(callId).emit('user-left', socket.id);
    }
  });
  
  socket.on('end-call', (callId) => {
    const userCallId = socket.data.callId;
    if (userCallId && userCallId === callId) {
      console.log(`User ${socket.id} ended call ${callId}`);
      
      // Notify all users in the call that it has ended
      io.to(callId).emit('call-ended', {
        callId: callId,
        message: 'Call has been ended by the host'
      });
      
      // Remove any pending approvals
      pendingApprovals.delete(callId);
      
      // Remove the call
      activeCalls.delete(callId);
    }
  });
  
  // Handle audio file sharing
  socket.on('share-audio-file', ({ callId, audioData, fileName }) => {
    const userCallId = socket.data.callId;
    
    if (userCallId && userCallId === callId) {
      console.log(`User ${socket.id} sharing audio file in call ${callId}`);
      
      // Forward to all other users in the call
      socket.to(callId).emit('audio-file-shared', {
        from: socket.id,
        audioData,
        fileName,
        timestamp: Date.now()
      });
    }
  });

  socket.on('disconnect', () => {
    const callId = socket.data.callId;
    if (callId) {
      socket.leave(callId);
      io.to(callId).emit('user-left', socket.id);
      
      // Remove from active calls
      if (activeCalls.has(callId)) {
        activeCalls.set(
          callId,
          activeCalls.get(callId).filter(id => id !== socket.id)
        );
        
        // If no more users, remove the call
        if (activeCalls.get(callId).length === 0) {
          activeCalls.delete(callId);
        }
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

// API endpoints
app.get('/test', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Simple endpoint to check server status
app.get('/status', (req, res) => {
  res.json({ status: 'ok', message: 'Voice call server is running' });
});

// Start server
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
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
  
  // Display available network addresses
  console.log('Available on:');
  for (const name in results) {
    for (const addr of results[name]) {
      console.log(`${name}: ${addr}:${PORT}`);
    }
  }
  
  console.log(`Access from your phone at: http://localhost:${PORT}`);
});
