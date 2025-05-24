// Simple Voice Call Application - Client Side
const socket = io();

// WebRTC configuration
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

// Main UI elements
const startCallBtn = document.getElementById('startCall');
const joinCallBtn = document.getElementById('joinCall');
const endCallBtn = document.getElementById('endCall');
const callIdInput = document.getElementById('callIdInput');
const statusText = document.getElementById('statusText');
const audioOptions = document.getElementById('audioOptions');
const useMicBtn = document.getElementById('useMic');
const useAudioFileBtn = document.getElementById('useAudioFile');
const audioFileSection = document.getElementById('audioFileSection');
const audioFileInput = document.getElementById('audioFileInput');
const audioPlayerContainer = document.getElementById('audioPlayerContainer');
const callApprovalSection = document.getElementById('callApprovalSection');
const recordingStatus = document.getElementById('recordingStatus');

// Create the callIdDisplay element if it doesn't exist
let callIdDisplay = document.getElementById('callIdDisplay');
if (!callIdDisplay) {
  callIdDisplay = document.createElement('div');
  callIdDisplay.id = 'callIdDisplay';
  callIdDisplay.className = 'call-id-display';
  const statusSection = document.querySelector('.status-section');
  if (statusSection) {
    statusSection.appendChild(callIdDisplay);
  }
}

// Create the participantsList element if it doesn't exist
let participantsList = document.getElementById('participants');
if (!participantsList) {
  participantsList = document.createElement('ul');
  participantsList.id = 'participants';
  participantsList.className = 'participants-list';
  const container = document.querySelector('.container');
  if (container) {
    container.appendChild(participantsList);
  }
}

// WebRTC variables
let peerConnections = {};
let localStream = null;
let callId = null;
let isHost = false;
let useAudioFile = false;
let audioFileBuffer = null;

// Handle audio input and setup WebRTC connections
function handleAudioInput(stream) {
  localStream = stream;
  
  // Log audio tracks to help with debugging
  const audioTracks = stream.getAudioTracks();
  console.log('Audio tracks:', audioTracks.length);
  
  if (audioTracks.length > 0) {
    console.log('Using audio device: ' + audioTracks[0].label);
    // Ensure track is enabled
    audioTracks[0].enabled = true;
  } else {
    console.warn('No audio tracks found in the stream!');
  }
  
  // Notify server we're ready to start connections
  socket.emit('ready', callId);
  console.log('Local stream acquired successfully');
}

// Create a peer connection with a specific user
async function createPeerConnection(userId) {
  console.log(`Creating peer connection for user ${userId}`);
  
  // Check if we already have a connection for this user
  if (peerConnections[userId]) {
    console.log(`Connection already exists for ${userId}, closing it first`);
    peerConnections[userId].close();
    delete peerConnections[userId];
  }
  
  try {
    const pc = new RTCPeerConnection(configuration);
    peerConnections[userId] = pc;
    
    // Add our local stream tracks to the connection
    if (localStream) {
      try {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
          console.log('Adding audio track to peer connection:', audioTracks[0].label);
          // Make sure track is enabled
          audioTracks[0].enabled = true;
          pc.addTrack(audioTracks[0], localStream);
        } else {
          console.error('No audio tracks found in local stream');
          // Try to get audio tracks again
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStream = stream;
          const tracks = stream.getAudioTracks();
          if (tracks.length > 0) {
            tracks[0].enabled = true;
            pc.addTrack(tracks[0], stream);
          }
        }
      } catch (e) {
        console.error('Error adding tracks to peer connection:', e);
      }
    } else {
      console.warn('No local stream available to add tracks from');
      // Try to get the stream if it doesn't exist
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream = stream;
        const tracks = stream.getAudioTracks();
        if (tracks.length > 0) {
          tracks[0].enabled = true;
          pc.addTrack(tracks[0], stream);
        }
      } catch (err) {
        console.error('Failed to get audio stream:', err);
      }
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${userId}`);
        socket.emit('ice-candidate', {
          to: userId,
          candidate: event.candidate
        });
      }
    };
    
    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${pc.iceConnectionState}`);
      
      // If connected, double check that audio is flowing
      if (pc.iceConnectionState === 'connected' || 
          pc.iceConnectionState === 'completed') {
        console.log('ICE connected, ensuring audio is playing');
        const audioElement = document.getElementById(`audio-${userId}`);
        if (audioElement && audioElement.paused) {
          audioElement.play().catch(e => console.warn('Could not play audio after ICE connected:', e));
        }
      }
    };
    
    // Handle incoming tracks (audio)
    pc.ontrack = (event) => {
      console.log(`Received track from ${userId}:`, event.track.kind);
      
      if (event.track.kind === 'audio') {
        // Create an audio element for the remote stream if it doesn't exist
        let audioElement = document.getElementById(`audio-${userId}`);
        
        if (!audioElement) {
          console.log(`Creating new audio element for ${userId}`);
          audioElement = document.createElement('audio');
          audioElement.id = `audio-${userId}`;
          audioElement.autoplay = true;
          audioElement.controls = true; // Add controls for debugging
          audioElement.volume = 1.0; // Set maximum volume
          audioElement.classList.add('remote-audio');
          document.body.appendChild(audioElement);
        }
        
        // Set the srcObject to the remote stream
        try {
          const remoteStream = new MediaStream();
          remoteStream.addTrack(event.track);
          audioElement.srcObject = remoteStream;
          
          // Ensure audio plays
          const playPromise = audioElement.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log(`Playing audio from ${userId}`);
                // Double check that audio is actually playing
                setTimeout(() => {
                  if (audioElement.paused) {
                    console.log('Audio was paused, trying to play again');
                    audioElement.play().catch(e => console.error('Error on retry play:', e));
                  }
                }, 1000);
              })
              .catch(error => {
                console.error(`Error playing audio: ${error}`);
                // Try again after a short delay
                setTimeout(() => {
                  audioElement.play().catch(e => console.error('Error on delayed play:', e));
                }, 2000);
              });
          }
        } catch (e) {
          console.error('Error setting up remote audio:', e);
        }
      }
      
      // Create label for the participant
      const userLabel = document.createElement('div');
      userLabel.textContent = `Participant: ${userId.substring(0, 6)}...`;
      userLabel.className = 'participant-label';
      
      // Add to the participants list
      if (participantsList) {
        const listItem = document.createElement('li');
        listItem.id = `participant-${userId}`;
        listItem.appendChild(userLabel);
        participantsList.appendChild(listItem);
      }
    };
    
    return pc;
  } catch (error) {
    console.error(`Error creating peer connection with ${userId}:`, error);
    return null;
  }
}

// Socket event handlers for WebRTC signaling
socket.on('user-ready', async (userId) => {
  console.log(`User ${userId} is ready to connect`);
  
  // Make sure we have audio access before creating the peer connection
  if (!localStream) {
    try {
      console.log('Requesting microphone access before creating offer');
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      handleAudioInput(localStream);
    } catch (error) {
      console.error('Failed to get microphone access:', error);
      alert('Microphone access is required for calls. Please allow microphone access and try again.');
      return;
    }
  }
  
  const peerConnection = await createPeerConnection(userId);
  
  if (peerConnection) {
    try {
      // Create and send offer
      console.log('Creating offer...');
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true
      });
      
      console.log('Setting local description...');
      await peerConnection.setLocalDescription(offer);
      
      console.log('Sending offer to remote peer...');
      socket.emit('offer', {
        to: userId,
        offer: offer
      });
      
      console.log(`Sent offer to ${userId}`);
    } catch (error) {
      console.error(`Error creating offer for ${userId}:`, error);
    }
  }
});

socket.on('offer', async (data) => {
  console.log(`Received offer from ${data.from}`);
  
  // Make sure we have audio access before answering
  if (!localStream) {
    try {
      console.log('Requesting microphone access before answering offer');
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      handleAudioInput(localStream);
    } catch (error) {
      console.error('Failed to get microphone access:', error);
      alert('Microphone access is required for calls. Please allow microphone access and try again.');
      return;
    }
  }
  
  const peerConnection = await createPeerConnection(data.from);
  
  if (peerConnection) {
    try {
      console.log('Setting remote description from offer...');
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      
      console.log('Creating answer...');
      const answer = await peerConnection.createAnswer({
        offerToReceiveAudio: true
      });
      
      console.log('Setting local description for answer...');
      await peerConnection.setLocalDescription(answer);
      
      console.log('Sending answer to peer...');
      socket.emit('answer', {
        to: data.from,
        answer: answer
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }
});

socket.on('answer', async (data) => {
  console.log(`Received answer from ${data.from}`);
  const peerConnection = peerConnections[data.from];
  
  if (peerConnection) {
    try {
      console.log('Setting remote description from answer...');
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      console.log('Remote description set successfully');
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  } else {
    console.warn(`No peer connection found for ${data.from}`);
  }
});

socket.on('ice-candidate', async (data) => {
  console.log(`Received ICE candidate from ${data.from}`);
  const peerConnection = peerConnections[data.from];
  
  if (peerConnection) {
    try {
      console.log('Adding ICE candidate...');
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      console.log('ICE candidate added successfully');
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  } else {
    console.warn(`No peer connection found for ${data.from}`);
  }
});

// Common function to start or join a call
async function initiateCall(isNewCall) {
  console.log(`Initiating ${isNewCall ? 'new' : 'existing'} call`);
  
  try {
    // Generate or get call ID first
    if (isNewCall) {
      // Generate unique call ID for new call
      callId = 'call-' + Math.random().toString(36).substring(2, 9);
      isHost = true; // This user is the host
    } else {
      // Use the provided call ID for joining
      callId = callIdInput.value.trim();
      if (!callId) {
        alert('Please enter a valid Call ID');
        return;
      }
      isHost = false; // This user is not the host initially
    }
    
    // Update UI immediately to show something is happening
    if (callIdDisplay) callIdDisplay.textContent = callId;
    if (statusText) statusText.textContent = `Status: ${isNewCall ? 'Starting' : 'Joining'} call...`;
    
    // Reset any existing connections
    for (const userId in peerConnections) {
      if (peerConnections[userId]) {
        try {
          peerConnections[userId].close();
        } catch (e) {
          console.warn('Error closing peer connection:', e);
        }
        delete peerConnections[userId];
      }
    }
    
    // Handle audio based on selected source
    if (!useAudioFile) {
      try {
        console.log('Requesting microphone access...');
        
        // First check if the browser supports getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Browser does not support getUserMedia API');
        }
        
        // Use simple audio constraints for maximum compatibility
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
        
        if (!localStream) {
          throw new Error('Failed to get local stream');
        }
        
        console.log('Microphone access granted');
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error('No audio tracks found in stream');
        }
        
        // Make sure track is enabled
        audioTracks[0].enabled = true;
        console.log('Audio track enabled:', audioTracks[0].enabled);
        
        // Now handle the audio input
        handleAudioInput(localStream);
      } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Microphone access is required for calls: ' + error.message);
        resetUI();
        return;
      }
    } else {
      // Using audio file - make sure one is selected
      if (!audioFileBuffer) {
        alert('Please select an audio file first');
        resetUI();
        return;
      }
    }
    
    // Update UI
    callIdDisplay.textContent = callId;
    callIdInput.disabled = true;
    startCallBtn.disabled = true;
    joinCallBtn.disabled = true;
    endCallBtn.disabled = false;
    
    // Show audio options
    audioOptions.style.display = 'block';
    
    // Join the call on the server
    try {
      socket.emit('join-call', callId);
      console.log(`Emitted join-call for ${callId}`);
    } catch (socketError) {
      console.error('Socket error when joining call:', socketError);
      alert('Connection error. Please refresh the page and try again.');
      resetUI();
      return;
    }
  } catch (error) {
    console.error('Error initiating call:', error);
    alert('Failed to initiate call: ' + (error.message || 'Please try again.'));
    resetUI();
  }
}

// Handle audio file upload
function handleAudioFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    audioFileBuffer = e.target.result;
    console.log('Audio file loaded:', file.name);
    shareAudioBtn.disabled = false;
  };
  reader.readAsArrayBuffer(file);
}

// Function to share audio file with call participants
function shareAudioFile() {
  if (!audioFileBuffer || !callId) {
    alert('Please select an audio file and join a call first');
    return;
  }
  
  // Convert ArrayBuffer to Base64 for sending
  const base64Data = arrayBufferToBase64(audioFileBuffer);
  
  // Send to all participants
  socket.emit('share-audio-file', {
    callId: callId,
    fileName: audioFileInput.files[0].name,
    audioData: base64Data
  });
  
  alert('Audio file shared with all participants');
}

// Helper function to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper function to convert Base64 to Blob
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  
  return new Blob(byteArrays, { type: mimeType });
}

// Call approval functions
function approveCall(userId) {
  console.log(`Approving user ${userId} to join call ${callId}`);
  
  // Send approval to server
  socket.emit('approve-call', {
    userId,
    callId
  });
  
  // Remove from pending list
  const pendingItem = document.getElementById(`pending-${userId}`);
  if (pendingItem) {
    pendingItem.remove();
  }
  
  // Check if there are any more pending approvals
  const pendingApprovalsElement = document.getElementById('pendingApprovals');
  if (pendingApprovalsElement && pendingApprovalsElement.children.length === 0) {
    // No more pending approvals, hide the section
    const callApprovalSection = document.getElementById('callApprovalSection');
    if (callApprovalSection) {
      callApprovalSection.style.display = 'none';
    }
  }
  
  console.log(`Approved user ${userId} to join call ${callId}`);
}

function rejectCall(userId) {
  console.log(`Rejecting user ${userId} from joining call ${callId}`);
  
  // Send rejection to server
  socket.emit('reject-call', {
    userId,
    callId
  });
  
  // Remove from pending list
  const pendingItem = document.getElementById(`pending-${userId}`);
  if (pendingItem) {
    pendingItem.remove();
  }
  
  // Check if there are any more pending approvals
  const pendingApprovalsElement = document.getElementById('pendingApprovals');
  if (pendingApprovalsElement && pendingApprovalsElement.children.length === 0) {
    // No more pending approvals, hide the section
    const callApprovalSection = document.getElementById('callApprovalSection');
    if (callApprovalSection) {
      callApprovalSection.style.display = 'none';
    }
  }
  
  console.log(`Rejected user ${userId} from joining call ${callId}`);
}

// End call function
function endCurrentCall() {
  if (!callId) return;
  
  console.log(`Ending call ${callId}`);
  
  // Notify server
  socket.emit('end-call', callId);
  
  // Close all peer connections
  for (const userId in peerConnections) {
    peerConnections[userId].close();
  }
  peerConnections = {};
  
  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  // Reset UI
  resetUI();
}

function resetUI() {
  // Reset UI elements - safely handle potentially null elements
  if (callIdInput) {
    callIdInput.disabled = false;
    callIdInput.value = '';
  }
  if (startCallBtn) startCallBtn.disabled = false;
  if (joinCallBtn) joinCallBtn.disabled = false;
  if (endCallBtn) endCallBtn.disabled = true;
  
  // Reset status - safely handle potentially null elements
  if (statusText) statusText.textContent = 'Status: Disconnected';
  if (callIdDisplay) callIdDisplay.textContent = '';
  
  // Hide sections - safely handle potentially null elements
  if (audioOptions) audioOptions.style.display = 'none';
  if (audioFileSection) audioFileSection.style.display = 'none';
  if (audioPlayerContainer) audioPlayerContainer.style.display = 'none';
  if (callApprovalSection) callApprovalSection.style.display = 'none';
  if (recordingStatus) recordingStatus.style.display = 'none';
  
  // Clear participant list
  if (participantsList) participantsList.innerHTML = '';
  const pendingApprovalsElement = document.getElementById('pendingApprovals');
  if (pendingApprovalsElement) pendingApprovalsElement.innerHTML = '';
  
  // Reset call state
  callId = null;
  isHost = false;
  isCallActive = false;
  
  // Stop any active streams
  if (localStream) {
    try {
      localStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
    } catch (e) {
      console.warn('Error stopping local stream:', e);
    }
    localStream = null;
  }
  
  // Close and clean up any peer connections
  for (const userId in peerConnections) {
    if (peerConnections[userId]) {
      try {
        peerConnections[userId].close();
      } catch (e) {
        console.warn('Error closing peer connection:', e);
      }
      delete peerConnections[userId];
    }
  }
  
  // Remove any remote audio elements
  const remoteAudios = document.querySelectorAll('.remote-audio');
  remoteAudios.forEach(audio => audio.remove());
  
  console.log('UI reset complete');
}

// Socket event handlers for call approval and recording
socket.on('approval-requested', (data) => {
  if (!isHost) return;
  
  console.log(`User ${data.userId} is requesting to join call ${data.callId}`);
  
  // Show the call approval section
  callApprovalSection.style.display = 'block';
  
  // Add to pending approvals list
  const pendingApprovalsElement = document.getElementById('pendingApprovals');
  if (!pendingApprovalsElement) {
    console.error('pendingApprovals element not found');
    return;
  }
  
  const li = document.createElement('li');
  li.id = `pending-${data.userId}`;
  li.innerHTML = `
    <span>User ${data.userId.substring(0, 6)}... wants to join</span>
    <div class="approval-buttons">
      <button class="btn approve-btn" onclick="approveCall('${data.userId}')">Approve</button>
      <button class="btn reject-btn" onclick="rejectCall('${data.userId}')">Reject</button>
    </div>
  `;
  pendingApprovalsElement.appendChild(li);
});

socket.on('approval-pending', (data) => {
  console.log(`Waiting for approval to join call ${data.callId}`);
  statusText.textContent = `Status: Waiting for host approval...`;
});

socket.on('call-approved', (data) => {
  console.log(`Your request to join call ${data.callId} was approved`);
  
  // Update UI
  callId = data.callId;
  statusText.textContent = `Status: In Call (ID: ${callId})`;
  endCallBtn.disabled = false;
  
  // Call joined successfully
  
  // Show call approval section if host
  if (isHost) {
    callApprovalSection.style.display = 'block';
  }
});

socket.on('call-rejected', (data) => {
  console.log(`Your request to join call ${data.callId} was rejected`);
  alert('Your request to join the call was rejected by the host.');
  resetUI();
});

socket.on('call-joined', (data) => {
  console.log(`Successfully joined call: ${data.callId}`);
  callId = data.callId;
  isHost = data.isHost;
  
  // Update UI
  callIdDisplay.textContent = callId;
  statusText.textContent = `Status: In Call (ID: ${callId})`;
  audioOptions.style.display = 'block';
  endCallBtn.disabled = false;
  
  // Call joined successfully
  
  // Show call approval section if host
  if (isHost) {
    callApprovalSection.style.display = 'block';
  }
});

socket.on('call-ended', (data) => {
  console.log(`Call ${data.callId} has ended`);
  alert('The call has ended.');
  
  // Close all peer connections
  for (const userId in peerConnections) {
    peerConnections[userId].close();
  }
  peerConnections = {};
  
  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  // Reset UI
  resetUI();
});

socket.on('user-left', (userId) => {
  console.log(`User ${userId} left the call`);
  
  // Close peer connection with this user
  if (peerConnections[userId]) {
    peerConnections[userId].close();
    delete peerConnections[userId];
  }
  
  // Remove from participants list
  const container = document.getElementById(`container-${userId}`);
  if (container && container.parentElement) {
    container.parentElement.remove();
  }
  
  // Add message to participants list
  const li = document.createElement('li');
  li.textContent = `User ${userId.substring(0, 6)}... left the call`;
  participantsList.appendChild(li);
});

socket.on('user-joined', (userId) => {
  console.log(`User ${userId} joined the call`);
  
  // Add to participants list
  const listItem = document.createElement('li');
  listItem.textContent = `Participant joined: ${userId.substring(0, 6)}...`;
  listItem.id = `participant-${userId}`;
  participantsList.appendChild(listItem);
});

socket.on('audio-file-shared', (data) => {
  console.log(`Received shared audio file from ${data.from}`);
  
  // Convert Base64 to Blob
  const audioBlob = base64ToBlob(data.audioData, 'audio/mpeg');
  const audioUrl = URL.createObjectURL(audioBlob);
  
  // Create audio player
  const audioPlayer = document.createElement('audio');
  audioPlayer.controls = true;
  audioPlayer.src = audioUrl;
  
  // Create container
  const container = document.createElement('div');
  container.className = 'audio-player-item';
  container.innerHTML = `<p>Shared audio: ${data.fileName}</p>`;
  container.appendChild(audioPlayer);
  
  // Add to player container
  audioPlayerContainer.innerHTML = '';
  audioPlayerContainer.appendChild(container);
  audioPlayerContainer.style.display = 'block';
  
  // Add message to participants list
  const li = document.createElement('li');
  li.textContent = `User ${data.from.substring(0, 6)}... shared audio: ${data.fileName}`;
  participantsList.appendChild(li);
});

// UI event listeners
useMicBtn.addEventListener('click', () => {
  useAudioFile = false;
  useMicBtn.classList.add('btn-active');
  useAudioFileBtn.classList.remove('btn-active');
  audioFileSection.style.display = 'none';
});

useAudioFileBtn.addEventListener('click', () => {
  useAudioFile = true;
  useAudioFileBtn.classList.add('btn-active');
  useMicBtn.classList.remove('btn-active');
  audioFileSection.style.display = 'block';
});

audioFileInput.addEventListener('change', handleAudioFileUpload);
shareAudioBtn.addEventListener('click', shareAudioFile);

// Initialize UI on page load
function initializeUI() {
  // Set initial UI state
  endCallBtn.disabled = true;
  audioOptions.style.display = 'none';
  audioFileSection.style.display = 'none';
  audioPlayerContainer.style.display = 'none';
  callApprovalSection.style.display = 'none';
  recordingStatus.style.display = 'none';
  shareAudioBtn.disabled = true;
  
  // Set default audio source to microphone
  useAudioFile = false;
  useMicBtn.classList.add('btn-active');
  
  console.log('UI initialized');
}

// Handle call controls
startCallBtn.addEventListener('click', () => initiateCall(true));

// Handle joining an existing call
joinCallBtn.addEventListener('click', () => initiateCall(false));

// Handle ending a call
endCallBtn.addEventListener('click', endCurrentCall);

// Run initialization when page loads
window.addEventListener('DOMContentLoaded', initializeUI);
