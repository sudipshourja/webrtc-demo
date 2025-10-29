// ---- Config ----
const ICE_CONFIG = {
  iceServers: [
    // STUN only (no TURN)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

// ---- DOM ----
const els = {
  localVideo: document.getElementById('localVideo'),
  remoteVideo: document.getElementById('remoteVideo'),
  startBtn: document.getElementById('startBtn'),
  createOfferBtn: document.getElementById('createOfferBtn'),
  createAnswerBtn: document.getElementById('createAnswerBtn'),
  setAnswerBtn: document.getElementById('setAnswerBtn'),
  hangupBtn: document.getElementById('hangupBtn'),
  localDesc: document.getElementById('localDesc'),
  remoteDesc: document.getElementById('remoteDesc'),
  logs: document.getElementById('logs'),
  iceState: document.getElementById('iceState'),
  pcState: document.getElementById('pcState'),
  gatherState: document.getElementById('gatherState'),
  dirVideo: document.getElementById('dirVideo'),
  dirAudio: document.getElementById('dirAudio'),
  outVidBytes: document.getElementById('outVidBytes'),
  inVidBytes: document.getElementById('inVidBytes'),
  outAudBytes: document.getElementById('outAudBytes'),
  inAudBytes: document.getElementById('inAudBytes'),
};

let pc = null;
let localStream = null;
let statsTimer = null;
let role = null; // 'Offerer' | 'Answerer'

// ---- Logging ----
function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.map(String).join(' ')}`;
  console.log('[DEBUG]', ...args);
  els.logs.textContent += line + '\n';
  els.logs.scrollTop = els.logs.scrollHeight;
}

// ---- Helpers ----
function safeJSONParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function setButtonsState({ started, havePC, isOfferer, remoteSet }) {
  els.createOfferBtn.disabled = !started || !havePC && false;
  els.createAnswerBtn.disabled = !started;
  els.setAnswerBtn.disabled = !remoteSet;
  els.hangupBtn.disabled = !havePC;
}

function resetStatesUI() {
  els.iceState.textContent = '-';
  els.pcState.textContent = '-';
  els.gatherState.textContent = '-';
  els.dirVideo.textContent = '-';
  els.dirAudio.textContent = '-';
  els.outVidBytes.textContent = '0';
  els.inVidBytes.textContent = '0';
  els.outAudBytes.textContent = '0';
  els.inAudBytes.textContent = '0';
}

function parseDirectionsFromSDP(sdp) {
  // Return most specific direction found per media section
  const lines = sdp.split('\n').map(l => l.trim());
  let current = null;
  const out = {};
  for (const l of lines) {
    if (l.startsWith('m=')) {
      if (/m=video/.test(l)) current = 'video';
      else if (/m=audio/.test(l)) current = 'audio';
      else current = null;
    }
    if (l.startsWith('a=sendrecv') || l.startsWith('a=sendonly') || l.startsWith('a=recvonly') || l.startsWith('a=inactive')) {
      if (current) out[current] = l.replace('a=', '');
    }
  }
  return out; // e.g., { video: 'sendrecv', audio: 'sendrecv' }
}

function updateDirectionsUI(desc) {
  if (!desc?.sdp) return;
  const d = parseDirectionsFromSDP(desc.sdp);
  els.dirVideo.textContent = d.video || '(none)';
  els.dirAudio.textContent = d.audio || '(none)';
}

// ---- PC Creation ----
function createPC(createdBy) {
  if (pc) {
    try { pc.close(); } catch {}
    pc = null;
  }
  pc = new RTCPeerConnection(ICE_CONFIG);
  role = createdBy;

  log(`RTCPeerConnection created (${createdBy}).`);

  pc.onicecandidate = e => {
    if (e.candidate) log('ICE candidate:', e.candidate.candidate);
    else log('All ICE candidates sent.');
  };
  pc.oniceconnectionstatechange = () => {
    els.iceState.textContent = pc.iceConnectionState;
    log('ICE connection state:', pc.iceConnectionState);
  };
  pc.onconnectionstatechange = () => {
    els.pcState.textContent = pc.connectionState;
    log('Peer connection state:', pc.connectionState);
  };
  pc.onicegatheringstatechange = () => {
    els.gatherState.textContent = pc.iceGatheringState;
    log('ICE gathering state:', pc.iceGatheringState);
  };
  pc.onnegotiationneeded = () => log('Negotiation needed.');

  pc.ontrack = e => {
    log('ontrack fired. streams:', e.streams.length, 'track kind:', e.track?.kind);
    if (!els.remoteVideo.srcObject) {
      els.remoteVideo.srcObject = e.streams[0];
      els.remoteVideo.addEventListener('loadedmetadata', () => {
        log('Remote loadedmetadata. VideoWidth:', els.remoteVideo.videoWidth, 'VideoHeight:', els.remoteVideo.videoHeight);
        els.remoteVideo.play().then(() => log('Remote video playing')).catch(err => log('remoteVideo.play() failed:', err));
      }, { once: true });
    }
  };

  // Optional: log receivers when available
  setTimeout(() => {
    try {
      pc.getReceivers().forEach(r => {
        if (r.track) log('Receiver:', r.track.kind, 'state:', r.track.readyState);
      });
    } catch {}
  }, 500);

  // Stats loop
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = setInterval(async () => {
    if (!pc) return;
    try {
      const stats = await pc.getStats();
      let inVid = 0, outVid = 0, inAud = 0, outAud = 0;
      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          if (report.kind === 'video') inVid += report.bytesReceived || 0;
          if (report.kind === 'audio') inAud += report.bytesReceived || 0;
        } else if (report.type === 'outbound-rtp') {
          if (report.kind === 'video') outVid += report.bytesSent || 0;
          if (report.kind === 'audio') outAud += report.bytesSent || 0;
        }
      });
      els.outVidBytes.textContent = outVid.toString();
      els.inVidBytes.textContent = inVid.toString();
      els.outAudBytes.textContent = outAud.toString();
      els.inAudBytes.textContent = inAud.toString();
    } catch (e) {
      // Ignored
    }
  }, 2000);

  return pc;
}

// ---- Events ----
els.startBtn.onclick = async () => {
  try {
    log('Requesting local media…');
    // Keep it broad & simple
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    els.localVideo.srcObject = localStream;
    const tracks = localStream.getTracks().map(t => `${t.kind} (${t.readyState})`);
    log('Local media acquired:', JSON.stringify(tracks));

    // Prepare PC for both roles, but only add tracks when creating offer/answer
    resetStatesUI();
    els.createOfferBtn.disabled = false;
    els.createAnswerBtn.disabled = false;
    els.hangupBtn.disabled = true;
  } catch (err) {
    log('getUserMedia error:', err.name, err.message);
    alert(`Could not access camera/mic: ${err.name}`);
  }
};

els.createOfferBtn.onclick = async () => {
  if (!localStream) return alert('Start camera first');
  const pc = createPC('Offerer');

  // Add local tracks BEFORE creating offer
  localStream.getTracks().forEach(t => {
    pc.addTrack(t, localStream);
    log(`Added local ${t.kind} track`);
  });

  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await pc.setLocalDescription(offer);
  updateDirectionsUI(pc.localDescription);
  log('Local description set (offer). First 160 chars:\n' + pc.localDescription.sdp.slice(0, 160) + '…');

  els.localDesc.value = JSON.stringify(pc.localDescription);
  els.hangupBtn.disabled = false;
};

els.createAnswerBtn.onclick = async () => {
  const remote = safeJSONParse(els.remoteDesc.value);
  if (!remote) return alert('Paste a valid remote offer JSON first');
  if (!localStream) return alert('Start camera first');

  const pc = createPC('Answerer');

  // Add local tracks BEFORE creating answer
  localStream.getTracks().forEach(t => {
    pc.addTrack(t, localStream);
    log(`Added local ${t.kind} track`);
  });

  await pc.setRemoteDescription(remote);
  log('Remote description set (offer).');
  updateDirectionsUI(remote);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  updateDirectionsUI(pc.localDescription);
  log('Local description set (answer). First 160 chars:\n' + pc.localDescription.sdp.slice(0, 160) + '…');

  els.localDesc.value = JSON.stringify(pc.localDescription);
  els.hangupBtn.disabled = false;
};

els.setAnswerBtn.onclick = async () => {
  const ans = safeJSONParse(els.remoteDesc.value);
  if (!ans) return alert('Paste a valid remote answer JSON first');
  if (!pc) return alert('Create an offer first');
  await pc.setRemoteDescription(ans);
  log('Remote answer applied.');
  updateDirectionsUI(ans);
};

els.remoteDesc.addEventListener('input', () => {
  els.setAnswerBtn.disabled = !els.remoteDesc.value.trim();
});

els.hangupBtn.onclick = () => {
  if (pc) {
    try { pc.close(); } catch {}
    pc = null;
  }
  if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
  els.localDesc.value = '';
  // keep remoteDesc so you can retry setting answer if needed
  resetStatesUI();
  log('Call ended / PC closed.');
  els.hangupBtn.disabled = true;
};

// Make sure remote video tries to play when it has data
els.remoteVideo.addEventListener('loadedmetadata', () => {
  log('Remote <video> loadedmetadata fired.');
  els.remoteVideo.play().then(() => log('Remote playback OK')).catch(err => log('Remote playback blocked:', err));
});
