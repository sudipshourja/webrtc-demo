let pc;
let localStream;
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' } // STUN only
  ]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localDesc = document.getElementById('localDesc');
const remoteDesc = document.getElementById('remoteDesc');

document.getElementById('startBtn').onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  console.log('Camera started');
};

document.getElementById('createOfferBtn').onclick = async () => {
  pc = createPeerConnection();

  // Add local tracks
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  localDesc.value = JSON.stringify(pc.localDescription);
};

document.getElementById('createAnswerBtn').onclick = async () => {
  pc = createPeerConnection();

  // Add local tracks
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  const offer = JSON.parse(remoteDesc.value);
  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  localDesc.value = JSON.stringify(pc.localDescription);
};

document.getElementById('setAnswerBtn').onclick = async () => {
  const answer = JSON.parse(remoteDesc.value);
  await pc.setRemoteDescription(answer);
  console.log('Remote answer set!');
};

function createPeerConnection() {
  const pc = new RTCPeerConnection(config);

  pc.onicecandidate = e => {
    if (e.candidate) {
      console.log('New ICE candidate:', e.candidate);
    }
  };

  pc.ontrack = e => {
    console.log('Remote stream received');
    remoteVideo.srcObject = e.streams[1];
  };

  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
  };

  return pc;
}
