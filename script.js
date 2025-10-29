let pc;
let localStream;
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localDesc = document.getElementById('localDesc');
const remoteDesc = document.getElementById('remoteDesc');

function log(...args) {
  console.log('[DEBUG]', ...args);
}

document.getElementById('startBtn').onclick = async () => {
  try {
    log('Requesting local media...');
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    localVideo.srcObject = localStream;
    log('Local media acquired:', localStream.getTracks().map(t => `${t.kind} (${t.readyState})`));
  } catch (err) {
    log('Error accessing camera/mic:', err);
  }
};

document.getElementById('createOfferBtn').onclick = async () => {
  if (!localStream) {
    alert('Please start your camera first.');
    return;
  }

  pc = createPeerConnection('Offerer');
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
    log(`Added local ${track.kind} track to connection.`);
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  log('Local description set (offer):', offer.sdp.slice(0, 120) + '...');
  localDesc.value = JSON.stringify(pc.localDescription);
};

document.getElementById('createAnswerBtn').onclick = async () => {
  if (!localStream) {
    alert('Please start your camera first.');
    return;
  }

  pc = createPeerConnection('Answerer');
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
    log(`Added local ${track.kind} track to connection.`);
  });

  const offer = JSON.parse(remoteDesc.value);
  await pc.setRemoteDescription(offer);
  log('Remote description set (offer).');

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  log('Local description set (answer):', answer.sdp.slice(0, 120) + '...');
  localDesc.value = JSON.stringify(pc.localDescription);
};

document.getElementById('setAnswerBtn').onclick = async () => {
  const answer = JSON.parse(remoteDesc.value);
  await pc.setRemoteDescription(answer);
  log('Remote answer applied.');
};

function createPeerConnection(role) {
  const pc = new RTCPeerConnection(config);
  log(`RTCPeerConnection created as ${role}`);

  pc.onicecandidate = e => {
    if (e.candidate) {
      log('ICE candidate:', e.candidate.candidate);
    } else {
      log('All ICE candidates sent.');
    }
  };

  pc.oniceconnectionstatechange = () => {
    log('ICE connection state:', pc.iceConnectionState);
  };

  pc.onconnectionstatechange = () => {
    log('Peer connection state:', pc.connectionState);
  };

  pc.ontrack = e => {
    log('Remote stream received:', e.streams[0]);
    remoteVideo.srcObject = e.streams[0];
    remoteVideo.play().catch(err => log('Autoplay error:', err));
  };

  pc.onnegotiationneeded = () => {
    log('Negotiation needed event triggered.');
  };

  pc.onicegatheringstatechange = () => {
    log('ICE gathering state:', pc.iceGatheringState);
  };

  return pc;
}
