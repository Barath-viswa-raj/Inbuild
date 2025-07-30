import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const SIGNALING_SERVER_URL = "/inbuilt/frontend/src/api/socket.js"; 

async function fetchIceServers() {
  try {
    const response = await fetch(
      "https://applicationtestwebrtc.metered.live/api/v1/turn/credentials?apiKey=026cee6cbdb1ca82089a5f6658aba9787578"
    );
    const iceServers = await response.json();
    console.log("Fetched ICE servers from Metered:", iceServers);
    return iceServers;
  } catch (error) {
    console.error("Failed to fetch Metered TURN credentials:", error);
    return [
      { urls: ["stun:stun.l.google.com:19302"] },
      { urls: ["turn:global.turn.twilio.com:3478"], username: "your_twilio_username", credential: "your_twilio_credential" }
    ];
  }
}

function App() {
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const dataChannelRef = useRef(null);

  const [message, setMessage] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const [connected, setConnected] = useState(false);
  const [robotReady, setRobotReady] = useState(false);

  useEffect(() => {
    const setupWebRTC = async () => {
      try {
        const socket = io(SIGNALING_SERVER_URL, { transports: ['websocket'] });
        socketRef.current = socket;

        socket.on("connect", () => {
          console.log("✅ Connected to Vercel signaling server");
          setConnected(true);
        });

        socket.on("disconnect", (reason) => {
          console.log("🔌 Disconnected from signaling server, reason:", reason);
          setConnected(false);
          setRobotReady(false);
        });

        socket.on("answer", async (data) => {
          console.log("📩 Received answer from robot");
          const remoteDesc = new RTCSessionDescription(data);
          await pcRef.current.setRemoteDescription(remoteDesc);
        });

        socket.on("candidate", async (data) => {
          console.log("📩 Received ICE candidate from robot:", data);
          const candidate = new RTCIceCandidate(data);
          await pcRef.current.addIceCandidate(candidate).catch((err) =>
            console.error("Error adding candidate:", err)
          );
        });

        socket.on("robot-registered", () => {
          console.log("🤖 Robot registered with signaling server");
          setRobotReady(true);
        });

        const iceServers = await fetchIceServers();
        console.log("Using ICE servers:", iceServers);
        const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: "relay" });
        pcRef.current = pc;

        pc.oniceconnectionstatechange = () => {
          console.log("🔄 ICE state:", pc.iceConnectionState);
          if (pc.iceConnectionState === "failed") {
            console.error("ICE connection failed, attempting restart...");
            pc.restartIce();
          }
        };

        pc.onicegatheringstatechange = () => {
          console.log("🔍 ICE gathering state:", pc.iceGatheringState);
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("📤 Sending ICE candidate to robot:", event.candidate);
            socketRef.current.emit("candidate", {
              component: event.candidate.component,
              foundation: event.candidate.foundation,
              priority: event.candidate.priority,
              protocol: event.candidate.protocol,
              ip: event.candidate.ip,
              port: event.candidate.port,
              type: event.candidate.type,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            });
          } else {
            console.log("✅ ICE candidate gathering complete");
          }
        };

        pc.ontrack = (event) => {
          console.log("🎥 Received track from robot:", event.streams[0]);
          if (videoRef.current) {
            videoRef.current.srcObject = event.streams[0];
            videoRef.current.play().catch((err) => console.error("Error playing video:", err));
          }
        };

        pc.ondatachannel = (event) => {
          console.log("🔗 DataChannel received from robot");
          setupDataChannel(event.channel);
        };

        const dc = pc.createDataChannel("chat");
        setupDataChannel(dc);

        return () => {
          pc.close();
          socket.disconnect();
        };
      } catch (error) {
        console.error("WebRTC setup failed:", error);
      }
    };

    setupWebRTC();
  }, []);

  const setupDataChannel = (channel) => {
    dataChannelRef.current = channel;

    channel.onopen = () => {
      console.log("🟢 DataChannel opened");
      addToLog("[System] Chat is ready");
      channel.send("Hello from frontend!");
    };

    channel.onmessage = (event) => {
      console.log("📥 Robot:", event.data);
      addToLog("Robot: " + event.data);
    };

    channel.onclose = () => {
      console.log("🔴 DataChannel closed, ICE likely failed");
      addToLog("[System] Chat closed due to ICE failure");
    };
  };

  const startStream = async () => {
    if (!pcRef.current || !robotReady) {
      alert("Robot is not ready or peer connection not initialized. Please wait.");
      return;
    }

    const pc = pcRef.current;
    try {
      pc.addTransceiver("video", { direction: "recvonly" });
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      socketRef.current.emit("offer", {
        sdp: offer.sdp,
        type: offer.type,
      });
      console.log("📤 Offer sent to robot with ICE restart");
    } catch (error) {
      console.error("Error starting stream:", error);
    }
  };

  const sendMessage = () => {
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(message);
      addToLog("You: " + message);
      setMessage("");
    } else {
      alert("⚠️ Chat not ready");
    }
  };

  const addToLog = (line) => {
    setChatLog((prev) => [...prev, line]);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Live Robot Feed + Command Chat</h2>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls
        muted
        style={{ width: "640px", height: "360px", background: "#000" }}
      />
      <br />
      <button onClick={startStream} disabled={!connected || !robotReady}>
        Start Camera + Chat
      </button>

      <div style={{ marginTop: "20px" }}>
        <h3>Command Chat</h3>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            border: "1px solid #ccc",
            height: "150px",
            padding: "10px",
            overflowY: "auto",
            background: "#000000ff",
            color: "#fff",
            marginBottom: "10px",
          }}
        >
          {chatLog.map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </div>

        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type command..."
          style={{ width: "300px", marginRight: "10px" }}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default App;