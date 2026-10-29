const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const googleTTS = require("google-tts-api");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000
});

/* =========================
   STATIC
========================= */
app.use(express.static(path.join(__dirname, "public")));

app.use(
  "/audio",
  express.static(path.join(__dirname, "audio"), {
    fallthrough: false,
    setHeaders: (res) => {
      // Audio files have unique names. Keep them available in browser cache
      // so the TV/browser does not have to download the same file repeatedly.
      res.setHeader("Cache-Control", "public, max-age=3600, immutable");
      res.setHeader("Accept-Ranges", "bytes");
    }
  })
);

/* =========================
   FOLDERS SAFE INIT
========================= */
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "queue.json");
const AUDIO_DIR = path.join(__dirname, "audio");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

/* =========================
   ROOM CONFIG
========================= */
const roomNames = {
  "1": "ห้องตรวจโรค",
  "2": "รับยา",
  "3": "ห้องหัตถการ"
};

const roomDirections = {
  "1": "เดินตรงไปห้องแรก อยู่ด้านซ้ายมือค่ะ",
  "2": "เคาน์เตอร์จ่ายยาค่ะ",
  "3": "เดินตรงไปห้องแรก อยู่ด้านขวามือค่ะ"
};

/* =========================
   LOAD / SAVE QUEUE
========================= */
function loadQueue() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      "1": Array.isArray(parsed["1"]) ? parsed["1"] : [],
      "2": Array.isArray(parsed["2"]) ? parsed["2"] : [],
      "3": Array.isArray(parsed["3"]) ? parsed["3"] : []
    };
  } catch {
    return { "1": [], "2": [], "3": [] };
  }
}

let queues = loadQueue();

function saveQueue() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(queues, null, 2));
}

/* =========================
   HELPERS
========================= */
function setTimestamp(patient, status) {
  const now = Date.now();

  if (status === "called") patient.calledAt = now;
  if (status === "treatment") patient.treatmentAt = now;
  if (status === "pharmacy") patient.pharmacyAt = now;
  if (status === "done") patient.doneAt = now;
}

/* =========================
   COUNTER
========================= */
let queueCounter = 0;

function initializeQueueCounter() {
  let max = 0;

  Object.values(queues).forEach((roomQueue) => {
    roomQueue.forEach((patient) => {
      const match = String(patient.queueNo || "").match(/^A(\d+)$/);

      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    });
  });

  queueCounter = max;
}

initializeQueueCounter();

/* =========================
   TTS / ANNOUNCEMENT
   IMPORTANT:
   - Download complete MP3 before notifying clients.
   - Do not stream a partially-written MP3 to the TV.
========================= */
async function createVoice(text) {
  const url = googleTTS.getAudioUrl(text, {
    lang: "th",
    slow: false
  });

  const filename = `call_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}.mp3`;

  const filePath = path.join(AUDIO_DIR, filename);
  const tempPath = `${filePath}.tmp`;

  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "arraybuffer",
      timeout: 20000,
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024
    });

    // Write the complete file first.
    fs.writeFileSync(tempPath, response.data);

    // Atomic rename: display clients only receive a file that is complete.
    fs.renameSync(tempPath, filePath);

    return filename;
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}

    console.error("❌ TTS ERROR:", error.message);
    throw error;
  }
}

/*
 * Queue announcements on the server so two calls cannot race
 * and produce announcements in an unpredictable order.
 */
let announcementChain = Promise.resolve();

function enqueueAnnouncement(patient) {
  const job = announcementChain
    .catch(() => {})
    .then(() => callPatient(patient));

  announcementChain = job.catch(() => {});

  return job;
}

async function callPatient(patient) {
  const room = String(patient.room);

  const roomName =
    roomNames[room] || `ห้อง ${room}`;

  const direction =
    roomDirections[room] || "";

  const text =
  `เรียนเชิญคุณ ${patient.name} ` +
  `${roomName} ` +
  `${direction}`;


  const filename = await createVoice(text);

  const audioUrl = `/audio/${filename}`;

  console.log(
    `🔊 ANNOUNCE ${patient.queueNo} -> ${text}`
  );

  io.emit("playVoice", {
    ...patient,
    roomName,
    direction,
    audio: audioUrl,
    audioId: filename,
    createdAt: Date.now()
  });

  setTimeout(() => {
    fs.unlink(path.join(AUDIO_DIR, filename), (err) => {
      if (err && err.code !== "ENOENT") {
        console.warn(
          "⚠️ Cannot delete audio:",
          filename,
          err.message
        );
      }
    });
  }, 5 * 60 * 1000);
}
/* =========================
   SOCKET.IO
========================= */
io.on("connection", (socket) => {
  console.log("🔌 connected:", socket.id);

  socket.on("joinRoom", (room) => {
    const roomId = String(room);
    socket.join("room_" + roomId);
  });

  socket.on("getQueue", (room) => {
    socket.emit("updateQueue", queues[room] || []);
  });

  socket.on("addPatient", (data) => {
    const room = String(data.room);

    if (!queues[room]) {
      queues[room] = [];
    }

    queueCounter++;

    const patient = {
      queueNo: "A" + String(queueCounter).padStart(3, "0"),
      name: String(data.name || "").trim(),
      room,
      roomName: roomNames[room] || `ห้อง ${room}`,
      status: "waiting",
      note: "",
      createdAt: Date.now(),
      history: []
    };

    queues[room].push(patient);
    saveQueue();

    io.to("room_" + room).emit("updateQueue", queues[room]);
  });

  socket.on("callByQueue", async (data) => {
    const room = String(data.room);

    const patient = (queues[room] || []).find(
      (p) => p.queueNo === data.queueNo
    );

    if (!patient) return;

    patient.status = "called";
    setTimestamp(patient, "called");

    saveQueue();

    io.to("room_" + room).emit("updateQueue", queues[room]);

    try {
      await enqueueAnnouncement(patient);
    } catch (error) {
      console.error(
        `❌ Announcement failed for ${patient.queueNo}:`,
        error.message
      );

      io.emit("voiceError", {
        queueNo: patient.queueNo,
        message: "ไม่สามารถสร้างเสียงประกาศได้"
      });
    }
  });

  socket.on("movePatient", (data) => {
    const from = String(data.from);
    const to = String(data.to);
    const { queueNo, note } = data;

    if (!queues[from] || !queues[to]) return;

    const index = queues[from].findIndex(
      (p) => p.queueNo === queueNo
    );

    if (index === -1) return;

    const patient = queues[from][index];

    queues[from].splice(index, 1);

    patient.room = to;
    patient.roomName = roomNames[to] || `ห้อง ${to}`;
    patient.status = "waiting";

    if (note) {
      patient.note += `\n${note}`;
    }

    patient.history.push({
      from,
      to,
      note: note || "",
      time: Date.now()
    });

    queues[to].push(patient);

    saveQueue();

    io.to("room_" + from).emit("updateQueue", queues[from]);
    io.to("room_" + to).emit("updateQueue", queues[to]);
  });

  socket.on("deletePatient", (data) => {
    const room = String(data.room);

    if (!queues[room]) return;

    queues[room] = queues[room].filter(
      (p) => p.queueNo !== data.queueNo
    );

    saveQueue();

    io.to("room_" + room).emit(
      "updateQueue",
      queues[room]
    );
  });

  socket.on("disconnect", (reason) => {
    console.log("🔌 disconnected:", socket.id, reason);
  });
});

/* =========================
   ROUTE ROOT
========================= */
app.get("/", (req, res) => {
  res.redirect("/analytics.html");
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
  console.log("🔊 Audio mode: complete-file + client AudioContext queue");
});
