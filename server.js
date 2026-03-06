const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const YTDLP_BIN = process.env.YTDLP_PATH || "yt-dlp";
const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return (name || "vaultdl_file")
    .replace(/[^\w\s\-_.()[\]]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 150);
}

// ─── Route: Metadata (Tombol Fetch) ───
// Upgrade: Menambahkan --ignore-no-formats-error agar Pinterest Foto tidak Error
app.post("/api/metadata", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL kosong" });

  // Flag --ignore-no-formats-error adalah kunci untuk link gambar/Pinterest
  const proc = spawn(YTDLP_BIN, [
    "--dump-json",
    "--no-playlist",
    "--ignore-no-formats-error", 
    "--skip-download",
    url
  ]);

  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (d) => (stdout += d.toString()));
  proc.stderr.on("data", (d) => (stderr += d.toString()));

  proc.on("close", (code) => {
    if (code === 0 || stdout.trim()) {
      try {
        const data = JSON.parse(stdout);
        res.json({
          title: data.title || "Untitled",
          thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails[0].url) || null,
          duration: data.duration || null,
          uploader: data.uploader || data.channel || "Unknown"
        });
      } catch (e) {
        res.status(422).json({ error: "Gagal memproses data JSON" });
      }
    } else {
      console.error("[Metadata Error]", stderr);
      res.status(422).json({ error: "Link tidak didukung atau bukan konten publik." });
    }
  });
});

// ─── Route: Download ───
app.get("/api/download", (req, res) => {
  const { url, format, title } = req.query;
  const safeTitle = sanitizeFilename(title);
  const children = [];
  const cleanup = () => children.forEach(p => { try { p.kill("SIGKILL"); } catch {} });
  req.on("close", cleanup);

  // 1. FORMAT: IMAGE (Untuk Pinterest/Instagram Foto)
  if (format === "image") {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.jpg"`);
    
    // Ambil URL gambar langsung
    const ytdlp = spawn(YTDLP_BIN, ["--get-thumbnail", "--no-playlist", "--ignore-no-formats-error", url]);
    let imageUrl = "";
    ytdlp.stdout.on("data", (d) => (imageUrl += d.toString().trim()));

    ytdlp.on("close", async (code) => {
      if (imageUrl) {
        try {
          const imgRes = await fetch(imageUrl);
          const buffer = await imgRes.arrayBuffer();
          res.send(Buffer.from(buffer));
        } catch (e) { if (!res.headersSent) res.status(500).send("Gagal mengambil gambar."); }
      } else { cleanup("Download gambar gagal"); }
    });
    children.push(ytdlp);
  }

  // 2. FORMAT: MP3
  else if (format === "mp3") {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.mp3"`);
    const ytdlp = spawn(YTDLP_BIN, ["-f", "bestaudio", "-o", "-", url]);
    const ffmpeg = spawn(FFMPEG_BIN, ["-i", "pipe:0", "-f", "mp3", "pipe:1"]);
    children.push(ytdlp, ffmpeg);
    ytdlp.stdout.pipe(ffmpeg.stdin); ffmpeg.stdout.pipe(res);
  }

  // 3. FORMAT: MP4 STANDARD (720p)
  else if (format === "mp4_standard") {
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.mp4"`);
    const ytdlp = spawn(YTDLP_BIN, ["-f", "best[height<=720][ext=mp4]/best[height<=720]", "-o", "-", url]);
    children.push(ytdlp); ytdlp.stdout.pipe(res);
  }

  // 4. FORMAT: MP4 HD (Default)
  else {
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}_HD.mp4"`);
    const yv = spawn(YTDLP_BIN, ["-f", "bestvideo[ext=mp4]/bestvideo", "-o", "-", url]);
    const ya = spawn(YTDLP_BIN, ["-f", "bestaudio[ext=m4a]/bestaudio", "-o", "-", url]);
    const ff = spawn(FFMPEG_BIN, ["-i", "pipe:3", "-i", "pipe:4", "-c", "copy", "-f", "mp4", "-movflags", "frag_keyframe", "pipe:1"], { stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"] });
    children.push(yv, ya, ff);
    yv.stdout.pipe(ff.stdio[3]); ya.stdout.pipe(ff.stdio[4]); ff.stdout.pipe(res);
  }
});

app.listen(PORT, () => console.log(`✅ Server aktif di port ${PORT}`));