// Create a ringtone using the Web Audio API
function createRingtone() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // Create an oscillator for the ringtone
  function playTone(frequency, startTime, duration) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    
    // Apply a simple envelope
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }
  
  // Play a sequence of tones to create a ringtone
  const now = audioContext.currentTime;
  playTone(880, now, 0.3);      // A5
  playTone(0, now + 0.3, 0.1);  // Short pause
  playTone(988, now + 0.4, 0.3); // B5
  playTone(0, now + 0.7, 0.1);  // Short pause
  playTone(1318, now + 0.8, 0.5); // E6
}

// Export the function
window.createRingtone = createRingtone;
