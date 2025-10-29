const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let pc, localStream;
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const logBox = document.getElementById('log');
const localSDP = document.getElementById('localSDP');
const remoteSDP = document.getElementById('remoteSDP');

function log(msg) {
  console.log(msg);
  logBox.textContent += msg + '\n';
}

function createPC(role) {
  pc = new RTCPeerConnection(config);
  log(`PeerConnection created as ${role}`);

  // Force full bidirectional (sendrecv)
  pc.addTransceiver('video', { direction: 'sendrecv' });

  // Local video track
  if (localStream) {
    localStream.getTracks().forEach(t => {
      pc.addTrack(t, localStream);
      log(`Added local ${t.kind} track`);
    });
  }

  // Remote track
  pc.ontrack = e => {
    log('Remote track received');
    remoteVideo.srcObject = e.streams[0];
  };

  pc.onicecandidate = e => {
    if (e.candidate) log('ICE candidate: ' + e.candidate.candidate);
  };

  pc.onconnectionstatechange = () => log('Connection state: ' + pc.connectionState);
  return pc;
}

document.getElementById('startBtn').onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true });
  localVideo.srcObject = localStream;
  log('Camera started');
};

document.getElementById('offerBtn').onclick = async () => {
  createPC('Offerer');
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  localSDP.value = JSON.stringify(pc.localDescription);
  log('Offer created');
};

document.getElementById('answerBtn').onclick = async () => {
  createPC('Answerer');
  const offer = JSON.parse(remoteSDP.value);
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  localSDP.value = JSON.stringify(pc.localDescription);
  log('Answer created');
};

document.getElementById('setAnswerBtn').onclick = async () => {
  const answer = JSON.parse(remoteSDP.value);
  await pc.setRemoteDescription(answer);
  log('Remote answer applied');
};
