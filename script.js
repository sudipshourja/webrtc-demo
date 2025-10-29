const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

let pc = null;
let localStream = null;
let remoteStream = null;
let statsTimer = null;
let currentPCToken = 0;

// DOM references
const el = (id) => document.getElementById(id);
const logBox = el("logs");
const localVideo = el("localVideo");
const remoteVideo = el("remoteVideo");

// ---- Logging Helper ----
function log(...args) {
  const msg = `[${new Date().toLocaleTimeString()}] ${args.join(" ")}`;
  console.log("[DEBUG]", ...args);
  logBox.textContent += msg + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

// ---- UI Helper ----
function updateStatUI(stats) {
  el("outVidBytes").textContent = stats.outVid.toString();
  el("inVidBytes").textContent = stats.inVid.toString();
  el("outAudBytes").textContent = stats.outAud.toString();
  el("inAudBytes").textContent = stats.inAud.toString();
}

function updateStateUI(pc) {
  el("iceState").textContent = pc.iceConnectionState;
  el("pcState").textContent = pc.connectionState;
  el("gatherState").textContent = pc.iceGatheringState;
}

function parseDirections(sdp) {
  const out = {};
  let current = null;
  sdp.split("\n").forEach((l) => {
    if (l.startsWith("m=")) {
      if (l.includes("video")) current = "video";
      else if (l.includes("audio")) current = "audio";
      else current = null;
    }
    if (l.startsWith("a=sendrecv") || l.startsWith("a=sendonly") || l.startsWith("a=recvonly") || l.startsWith("a=inactive")) {
      if (current) out[current] = l.replace("a=", "");
    }
  });
  return out;
}

function updateDirectionUI(desc) {
  if (!desc?.sdp) return;
  const d = parseDirections(desc.sdp);
  el("dirVideo").textContent = d.video || "-";
  el("dirAudio").textContent = d.audio || "-";
}

// ---- Core WebRTC ----
function createPeerConnection(role) {
  currentPCToken++;
  const token = currentPCToken;
  if (pc) try { pc.close(); } catch {}
  pc = new RTCPeerConnection(ICE_CONFIG);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  log(`RTCPeerConnection created (${role}).`);

  // Force both directions
  pc.addTransceiver("audio", { direction: "sendrecv" });
  pc.addTransceiver("video", { direction: "sendrecv" });

  // ICE events
  pc.onicecandidate = (e) => {
    if (e.candidate) log("ICE candidate:", e.candidate.candidate);
    else log("All ICE candidates sent.");
  };
  pc.oniceconnectionstatechange = () => {
    if (token !== currentPCToken) return;
    log("ICE connection state:", pc.iceConnectionState);
    updateStateUI(pc);
  };
  pc.onconnectionstatechange = () => {
    if (token !== currentPCToken) return;
    log("Peer connection state:", pc.connectionState);
    updateStateUI(pc);
  };
  pc.onicegatheringstatechange = () => {
    if (token !== currentPCToken) return;
    log("ICE gathering state:", pc.iceGatheringState);
    updateStateUI(pc);
  };
  pc.onnegotiationneeded = () => log("Negotiation needed.");

  // Remote track
  pc.ontrack = (e) => {
    log("ontrack:", e.track.kind, "state:", e.track.readyState);
    remoteStream.addTrack(e.track);
    if (remoteVideo.readyState >= 2)
      remoteVideo.play().catch((err) => log("play() failed:", err));
    else
      remoteVideo.onloadedmetadata = () =>
        remoteVideo.play().catch((err) => log("play() failed:", err));
  };

  // Start stats loop
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = setInterval(async () => {
    if (!pc) return;
    try {
      const s = await pc.getStats();
      let inVid = 0,
        outVid = 0,
        inAud = 0,
        outAud = 0;
      s.forEach((r) => {
        if (r.type === "inbound-rtp") {
          if (r.kind === "video") inVid += r.bytesReceived || 0;
          if (r.kind === "audio") inAud += r.bytesReceived || 0;
        } else if (r.type === "outbound-rtp") {
          if (r.kind === "video") outVid += r.bytesSent || 0;
          if (r.kind === "audio") outAud += r.bytesSent || 0;
        }
      });
      updateStatUI({ inVid, outVid, inAud, outAud });
    } catch {}
  }, 2000);

  return pc;
}

// ---- Buttons ----
el("startBtn").onclick = async () => {
  try {
    log("Requesting local media…");
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
    log(
      "Local media acquired:",
      JSON.stringify(localStream.getTracks().map((t) => `${t.kind} (${t.readyState})`))
    );
    el("createOfferBtn").disabled = false;
    el("createAnswerBtn").disabled = false;
  } catch (err) {
    log("getUserMedia error:", err.name, err.message);
    alert("Camera/mic error: " + err.name);
  }
};

el("createOfferBtn").onclick = async () => {
  if (!localStream) return alert("Start camera first");
  const pc = createPeerConnection("Offerer");
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  updateDirectionUI(pc.localDescription);
  el("localDesc").value = JSON.stringify(pc.localDescription);
  log("Local description (offer) ready.");
};

el("createAnswerBtn").onclick = async () => {
  const remote = JSON.parse(el("remoteDesc").value || "{}");
  if (!remote?.sdp) return alert("Paste a valid offer first");
  if (!localStream) return alert("Start camera first");

  const pc = createPeerConnection("Answerer");
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  await pc.setRemoteDescription(remote);
  log("Remote offer applied.");
  updateDirectionUI(remote);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  updateDirectionUI(pc.localDescription);
  el("localDesc").value = JSON.stringify(pc.localDescription);
  log("Local description (answer) ready.");
};

el("setAnswerBtn").onclick = async () => {
  const ans = JSON.parse(el("remoteDesc").value || "{}");
  if (!ans?.sdp) return alert("Paste a valid answer first");
  await pc.setRemoteDescription(ans);
  log("Remote answer applied.");
  updateDirectionUI(ans);
};

el("hangupBtn").onclick = () => {
  if (pc) {
    try { pc.close(); } catch {}
    pc = null;
  }
  if (statsTimer) clearInterval(statsTimer);
  log("Connection closed.");
};

// ---- Remote video playback logs ----
remoteVideo.addEventListener("loadedmetadata", () => {
  log("Remote loadedmetadata fired.");
  remoteVideo
    .play()
    .then(() => log("Remote playback started."))
    .catch((e) => log("Remote playback error:", e));
});
