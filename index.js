/***************
 * TwoSeats – index.js (reliable)
 * - Host ID:  `${roomCode}-HOST`
 * - Guest ID: `${roomCode}-GUEST`
 * - Data-channel handshake: "hello"/"ready"
 * - Guest ↔ Host camera calls (both ways)
 * - Host → Guest movie stream (captureStream)
 ***************/

let currentVideo = null;
let isHost = false;
let roomCode = null;

let localStream = null;
let isCameraOn = false;
let isMicOn = true;

let partnerNameGlobal = 'Mitch';

// PeerJS / WebRTC
let peer = null;
let conn = null;         // data channel
let mediaCallToPartner = null;  // our outgoing camera call
let mediaCallFromPartner = null; // incoming camera call
let movieCall = null;     // host's outgoing movie call

let myPeerId = null;
let targetPeerId = null;

let peerOpen = false;
let remoteReady = false;   // set after handshake
let meReady = false;       // set after we open & UI is ready

// ===== Init =====
window.addEventListener('load', () => {
  showWelcome();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('room')) {
    roomCode = urlParams.get('room');
    isHost = false;
    goToMoviePlatform();
    addChatMessage('System', 'Joined via invitation link!');
  }

  const lbl = document.getElementById('partnerVideoLabel');
  if (lbl) lbl.textContent = partnerNameGlobal;

  const pb = document.getElementById('progressBar');
  if (pb) {
    pb.addEventListener('input', function () {
      if (currentVideo) {
        const time = (this.value / 100) * currentVideo.duration;
        currentVideo.currentTime = time;
        addChatMessage('System', `⏭ Seeking to ${formatTime(time)}`);
      }
    });
  }
});

function showWelcome() {
  document.getElementById('welcomeScreen').style.display = 'flex';
  document.getElementById('invitationForm').style.display = 'none';
  document.getElementById('moviePlatform').style.display = 'none';
}

function showInvitationForm() {
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('invitationForm').style.display = 'flex';
  const innerForm = document.querySelector('.invitation-form');
  if (innerForm) innerForm.style.display = 'block';

  isHost = true;

  const now = new Date();
  now.setHours(now.getHours() + 2);
  document.getElementById('movieTime').value = now.toISOString().slice(0, 16);
}

function generateInvitation() {
  const partnerName = document.getElementById('partnerName').value.trim() || 'Beautiful';
  const movieTitle = document.getElementById('movieTitle').value.trim() || 'Our Special Movie';
  const message = document.getElementById('personalMessage').value.trim() || 'Can\'t wait to watch with you and see your beautiful face!';
  const movieTime = document.getElementById('movieTime').value;

  partnerNameGlobal = partnerName || 'My Butterfly';
  const partnerVideoLabel = document.getElementById('partnerVideoLabel');
  if (partnerVideoLabel) partnerVideoLabel.textContent = partnerNameGlobal;
  const partnerPlaceholder = document.getElementById('partnerVideoPlaceholder');
  if (partnerPlaceholder) {
    partnerPlaceholder.innerHTML = `<div>🦋</div><div>${partnerNameGlobal}</div>`;
  }

  roomCode = 'TS' + Math.random().toString(36).substr(2, 6).toUpperCase();

  const currentUrl = window.location.href.split('?')[0];
  const inviteLink = `${currentUrl}?room=${roomCode}`;

  const invitation = `Movie Date Invitation

Hey ${partnerName}!

${message}

 Movie: ${movieTitle}
 When: ${movieTime ? new Date(movieTime).toLocaleString() : 'Anytime you\'re ready!'}
 Room Code: ${roomCode}
Join our private theater:
${inviteLink}
Can't wait for our movie date!

Your Likkle Human,
Andy`;

  const inviteLinkElement = document.getElementById('inviteLink');
  const inviteMessageElement = document.getElementById('inviteMessage');
  const generatedInviteElement = document.getElementById('generatedInvite');
  const createInviteBtnElement = document.getElementById('createInviteBtn');

  if (inviteLinkElement && inviteMessageElement && generatedInviteElement && createInviteBtnElement) {
    inviteLinkElement.textContent = inviteLink;
    inviteMessageElement.textContent = invitation;
    generatedInviteElement.classList.remove('hidden');
    generatedInviteElement.style.display = 'block';
    createInviteBtnElement.disabled = true;
    createInviteBtnElement.textContent = 'Invitation Created!';
  } else {
    console.error('Could not find required UI elements');
  }
}

function sendWhatsApp() {
  const phoneRaw = (document.getElementById('partnerPhone').value || '').replace(/\D/g, '');
  const inviteText = document.getElementById('inviteMessage').textContent || '';
  if (!phoneRaw) return alert('Please enter your partner’s WhatsApp number (digits only, include country code).');
  if (!inviteText) return alert('Please create the invitation first.');
  const waUrl = `https://wa.me/${phoneRaw}?text=${encodeURIComponent(inviteText)}`;
  window.open(waUrl, '_blank');
}

function copyInvitation() {
  const invitation = document.getElementById('inviteMessage').textContent;
  navigator.clipboard.writeText(invitation).then(() => {
    alert('Full invitation copied!');
  }).catch(() => {
    const textArea = document.createElement('textarea');
    textArea.value = invitation;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert('Invitation copied!');
  });
}

function copyLink() {
  const link = document.getElementById('inviteLink').textContent;
  navigator.clipboard.writeText(link).then(() => {
    alert('Link copied!');
  }).catch(() => {
    const textArea = document.createElement('textarea');
    textArea.value = link;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert('Link copied!');
  });
}

function copyRoomLink() {
  const currentUrl = window.location.href.split('?')[0];
  const link = `${currentUrl}?room=${roomCode}`;
  navigator.clipboard.writeText(link).then(() => {
    alert('Room link copied!');
  }).catch(() => {
    const textArea = document.createElement('textarea');
    textArea.value = link;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert('Room link copied!');
  });
}

function joinWithCode() {
  const code = prompt('Enter the room code from your invitation:');
  if (code) {
    roomCode = code.toUpperCase();
    isHost = false;
    goToMoviePlatform();
  }
}

function goToMoviePlatform() {
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('invitationForm').style.display = 'none';
  document.getElementById('moviePlatform').style.display = 'block';

  if (roomCode) {
    document.getElementById('roomDisplay').textContent = roomCode;
    document.getElementById('currentRoomCode').textContent = roomCode;
  }
  updateConnectionStatus('Connected to TwoSeats', 'online');
  document.getElementById('sessionStatus').textContent = isHost ? 'Hosting movie night' : 'Joined movie night';

  addChatMessage('System', `Welcome to TwoSeats Theater!`);
  addChatMessage('System', `Room Code: ${roomCode}`);
  if (isHost) {
    addChatMessage('System', `Waiting for ${partnerNameGlobal} to join...`);
  } else {
    addChatMessage('System', 'You\'ve joined the movie date!');
  }

  initPeer();
}

function updateConnectionStatus(message, status) {
  document.getElementById('connectionStatus').textContent = message;
  const statusDot = document.getElementById('statusDot');
  statusDot.className = `status-indicator ${status}`;
}

// ===== PeerJS / WebRTC =====
function initPeer() {
  const hostId  = `${roomCode}-HOST`;
  const guestId = `${roomCode}-GUEST`;

  myPeerId     = isHost ? hostId  : guestId;
  targetPeerId = isHost ? guestId : hostId;

  try {
    peer = new Peer(myPeerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          // 👉 Add your TURN for tough networks (recommended for production):
          // { urls: 'turn:YOUR_TURN_SERVER', username: 'user', credential: 'pass' }
        ]
      }
    });
  } catch (e) {
    console.error('Peer creation error:', e);
    addChatMessage('System', 'Peer creation failed');
    return;
  }

  peer.on('open', (id) => {
    peerOpen = true;
    meReady = true;
    addChatMessage('System', `Peer ready (${id})`);

    // Establish data channel to the other side (whoever we are)
    if (!isHost) {
      conn = peer.connect(targetPeerId);
      conn.on('open', () => {
        addChatMessage('System', 'Data channel open');
        sendHello();
      });
      conn.on('data', handleIncomingData);
    } else {
      // Host waits for guest to connect via `peer.on('connection')`
    }
  });

  // Incoming data channel
  peer.on('connection', (c) => {
    conn = c;
    conn.on('open', () => {
      addChatMessage('System', 'Data channel open');
      sendHello();
    });
    conn.on('data', handleIncomingData);
  });

  // Incoming media calls
  peer.on('call', (incomingCall) => {
    const isMovie = incomingCall.metadata?.type === 'movie';

    // Camera: answer with our localStream if we have one (so we can be seen too).
    // Movie: answer without a stream.
    incomingCall.answer(isMovie ? undefined : (localStream || undefined));

    incomingCall.on('stream', (remoteStream) => {
      if (isMovie) {
        if (!isHost) renderRemoteMovie(remoteStream);
        addChatMessage('System', '🎬 Movie stream received');
      } else {
        // Camera stream → partner box
        const partnerVideo = document.getElementById('partnerVideo');
        const partnerPlaceholder = document.getElementById('partnerVideoPlaceholder');
        partnerVideo.srcObject = remoteStream;
        partnerVideo.style.display = 'block';
        if (partnerPlaceholder) partnerPlaceholder.style.display = 'none';
        addChatMessage('System', 'Camera stream received');
      }
    });

    // Keep references to close later if needed
    if (isMovie) movieCall = incomingCall; else mediaCallFromPartner = incomingCall;
  });

  peer.on('error', (err) => {
    console.error('Peer error:', err);
    addChatMessage('System', `Peer error: ${err.type || err.message}`);
  });
}

// ===== Handshake over data channel =====
function sendHello() {
  if (conn && conn.open) {
    conn.send({ type: 'hello', from: myPeerId });
  }
}

function handleIncomingData(msg) {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'hello') {
    // reply that we're ready
    if (conn && conn.open) conn.send({ type: 'ready', from: myPeerId });
  }

  if (msg.type === 'ready') {
    remoteReady = true;
    addChatMessage('System', 'Peer is ready');

    // If we are the host and already have a movie loaded & playing, ensure stream starts
    tryStartMovieShare();
  }

  if (msg.type === 'chat') {
    addChatMessage(partnerNameGlobal, msg.text);
  }
}

function tryStartMovieShare() {
  if (isHost && remoteReady && currentVideo && !currentVideo.paused) {
    startMovieShare();
  }
}

// ===== Movie Controls =====
function loadMovie() {
  const fileInput = document.getElementById('movieFile');
  const urlInput = document.getElementById('movieUrl');

  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const url = URL.createObjectURL(file);
    createVideoPlayer(url);
    addChatMessage('System', `Movie loaded: ${file.name}`);
  } else if (urlInput.value) {
    createVideoPlayer(urlInput.value);
    addChatMessage('System', 'Movie loaded from URL');
  } else {
    alert('Please select a file or enter a URL');
    return;
  }
}

function createVideoPlayer(src) {
  const videoArea = document.getElementById('videoArea');
  videoArea.innerHTML = `
    <video id="movieVideo" width="100%" height="100%" controls playsinline>
      <source src="${src}" type="video/mp4">
      Your browser does not support the video tag.
    </video>
  `;

  currentVideo = document.getElementById('movieVideo');

  currentVideo.addEventListener('play', () => {
    addChatMessage('System', '▶ Movie started');
    // Only host streams the movie to guest,
    // and only after we know the guest is ready
    tryStartMovieShare();
  });
  currentVideo.addEventListener('pause', () => {
    addChatMessage('System', '⏸ Movie paused');
  });
  currentVideo.addEventListener('timeupdate', updateProgressBar);
}

function startMovieShare() {
  if (!peer || !peerOpen) return addChatMessage('System', 'Peer not ready yet');
  if (!isHost) return;
  if (!remoteReady) return addChatMessage('System', 'Waiting for partner to be ready…');

  const videoEl = document.getElementById('movieVideo');
  if (!videoEl) return;

  const share = () => {
    const stream =
      videoEl.captureStream ? videoEl.captureStream() :
      videoEl.mozCaptureStream ? videoEl.mozCaptureStream() : null;

    if (!stream) {
      addChatMessage('System', 'captureStream not supported in this browser');
      return;
    }

    // Close previous movie call if any (avoid stale tracks)
    if (movieCall) { try { movieCall.close(); } catch {} movieCall = null; }

    const call = peer.call(targetPeerId, stream, { metadata: { type: 'movie' } });
    if (call) {
      call.on('stream', () => addChatMessage('System', '🎬 Movie streaming to partner'));
      movieCall = call;
    }
  };

  // must be playing in some browsers
  if (videoEl.readyState < 3 || videoEl.paused) {
    videoEl.addEventListener('playing', () => share(), { once: true });
    videoEl.play().catch(() => {});
  } else {
    share();
  }
}

// Guest renders remote movie into main area
function renderRemoteMovie(remoteStream) {
  const videoArea = document.getElementById('videoArea');
  videoArea.innerHTML = `
    <video id="remoteMovie" width="100%" height="100%" controls autoplay playsinline></video>
  `;
  const remoteMovie = document.getElementById('remoteMovie');
  remoteMovie.srcObject = remoteStream;
  remoteMovie.play().catch(() => {});
}

function togglePlay() {
  if (!currentVideo) return;
  if (currentVideo.paused) currentVideo.play();
  else currentVideo.pause();
}

function pauseMovie() {
  if (currentVideo) currentVideo.pause();
}

function syncTime() {
  addChatMessage('System', 'Synchronizing playback...');
  if (currentVideo) {
    addChatMessage('System', `Current time: ${formatTime(currentVideo.currentTime)}`);
  }
}

function toggleFullscreen() {
  if (!currentVideo) return;
  if (currentVideo.requestFullscreen) currentVideo.requestFullscreen();
  else if (currentVideo.webkitRequestFullscreen) currentVideo.webkitRequestFullscreen();
  else if (currentVideo.mozRequestFullScreen) currentVideo.mozRequestFullScreen();
}

function updateProgressBar() {
  if (!currentVideo) return;
  const progress = (currentVideo.currentTime / currentVideo.duration) * 100;
  document.getElementById('progressBar').value = progress || 0;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ===== Camera / Mic =====
async function toggleCamera() {
  const cameraBtn = document.getElementById('cameraBtn');

  if (!isCameraOn) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: isMicOn
      });

      const yourVideo = document.getElementById('yourVideo');
      const placeholder = document.getElementById('yourVideoPlaceholder');

      yourVideo.srcObject = localStream;
      yourVideo.style.display = 'block';
      placeholder.style.display = 'none';

      isCameraOn = true;
      cameraBtn.textContent = ' Stop';
      cameraBtn.style.background = '#c8a8e9';
      cameraBtn.style.color = '#1a1a1a';

      addChatMessage('System', 'Your camera is now on!');

      // Close any previous outgoing camera call
      if (mediaCallToPartner) { try { mediaCallToPartner.close(); } catch {} mediaCallToPartner = null; }

      // Call the partner with our camera
      if (peerOpen) {
        const call = peer.call(targetPeerId, localStream, { metadata: { type: 'camera' } });
        if (call) {
          // If remote also answers with a stream, show it in partner box
          call.on('stream', (remoteStream) => {
            const partnerVideo = document.getElementById('partnerVideo');
            const partnerPlaceholder = document.getElementById('partnerVideoPlaceholder');
            partnerVideo.srcObject = remoteStream;
            partnerVideo.style.display = 'block';
            if (partnerPlaceholder) partnerPlaceholder.style.display = 'none';
            addChatMessage('System', '📹 Remote camera connected');
          });
          mediaCallToPartner = call;
        }
      } else {
        addChatMessage('System', 'Peer not ready yet for camera; try again in a moment.');
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Could not access camera. Please check permissions and HTTPS.');
      addChatMessage('System', 'Camera access denied');
    }
  } else {
    // Turn off camera
    if (mediaCallToPartner) { try { mediaCallToPartner.close(); } catch {} mediaCallToPartner = null; }
    if (mediaCallFromPartner) { try { mediaCallFromPartner.close(); } catch {} mediaCallFromPartner = null; }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    const yourVideo = document.getElementById('yourVideo');
    const placeholder = document.getElementById('yourVideoPlaceholder');

    yourVideo.style.display = 'none';
    placeholder.style.display = 'flex';

    isCameraOn = false;
    cameraBtn.textContent = '📹 Camera';
    cameraBtn.style.background = '#3a3a3a';
    cameraBtn.style.color = '#c8a8e9';

    addChatMessage('System', 'Camera turned off');
  }
}

async function toggleMic() {
  const micBtn = document.getElementById('micBtn');

  if (localStream) {
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
      audioTracks[0].enabled = !isMicOn;
      isMicOn = !isMicOn;

      micBtn.textContent = isMicOn ? '🎤 Mic' : 'Mic Off';
      micBtn.style.background = isMicOn ? '#3a3a3a' : '#c8a8e9';
      micBtn.style.color = isMicOn ? '#c8a8e9' : '#1a1a1a';

      addChatMessage('System', isMicOn ? 'Microphone enabled' : 'Microphone muted');
    }
  } else {
    alert('Please start your camera first to enable microphone');
  }
}

async function switchCamera() {
  if (!isCameraOn || !localStream) return alert('Please start your camera first');

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    if (videoDevices.length > 1) {
      localStream.getTracks().forEach(track => track.stop());

      const facing = localStream.getVideoTracks()[0].getSettings().facingMode === 'user' ? 'environment' : 'user';
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: isMicOn
      });

      document.getElementById('yourVideo').srcObject = localStream;

      // Re-call with the new stream
      if (mediaCallToPartner) { try { mediaCallToPartner.close(); } catch {} mediaCallToPartner = null; }
      if (peerOpen) {
        const call = peer.call(targetPeerId, localStream, { metadata: { type: 'camera' } });
        mediaCallToPartner = call;
      }

      addChatMessage('System', 'Camera switched!');
    } else {
      addChatMessage('System', 'Only one camera available');
    }
  } catch (error) {
    console.error('Error switching camera:', error);
    addChatMessage('System', 'Could not switch camera');
  }
}

// ===== Chat =====
function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (message) {
    addChatMessage('You', message);
    input.value = '';
    if (conn && conn.open) {
      try { conn.send({ type: 'chat', text: message }); } catch {}
    }
  }
}

function handleChatKeyPress(event) {
  if (event.key === 'Enter') sendMessage();
}

function addChatMessage(sender, message) {
  const chatMessages = document.getElementById('chatMessages');
  const messageElement = document.createElement('div');
  messageElement.style.marginBottom = '10px';
  messageElement.style.padding = '8px';
  messageElement.style.borderRadius = '10px';
  messageElement.style.animation = 'fadeIn 0.3s ease-out';

  if (sender === 'System') {
    messageElement.style.backgroundColor = '#3a3a3a';
    messageElement.style.color = '#c8a8e9';
    messageElement.style.textAlign = 'center';
    messageElement.style.fontStyle = 'italic';
    messageElement.style.fontSize = '0.9rem';
  } else if (sender === 'You') {
    messageElement.style.backgroundColor = '#c8a8e9';
    messageElement.style.color = '#1a1a1a';
    messageElement.style.marginLeft = '20%';
    messageElement.style.textAlign = 'right';
  } else {
    messageElement.style.backgroundColor = '#2a2a2a';
    messageElement.style.color = 'white';
    messageElement.style.marginRight = '20%';
    messageElement.style.border = '1px solid #c8a8e9';
  }

  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  messageElement.innerHTML = `<strong>${sender}:</strong> ${message} <span style="font-size:0.7rem;opacity:0.7;margin-left:5px;">${timestamp}</span>`;

  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const placeholder = chatMessages.querySelector('p');
  if (placeholder && placeholder.textContent.includes('Start chatting')) placeholder.remove();
}

// Tip
setTimeout(() => {
  if (document.getElementById('moviePlatform').style.display === 'block') {
    addChatMessage('System', 'Pro tip: Use HTTPS (or localhost) so camera/mic works.');
  }
}, 8000);
