# MusicRip 🎵

MusicRip is a premium, modern, SaaS-style media downloading utility for content creators, editors, and social media enthusiasts. It enables high-speed MP3 audio extraction and MP4 video downloads from YouTube videos, YouTube Shorts, Instagram Reels, and posts.

## 🚀 Features

- **Platform Detection**: Automatically validates and parses URLs from YouTube and Instagram.
- **Transcoding Options**:
  - **Audio (MP3)**: 128kbps, 192kbps, and 320kbps (High Quality).
  - **Video (MP4)**: 360p, 720p, and 1080p (Full HD).
- **Glassmorphic UI**: Sleek dark layout with glow accents, skeleton loaders, and responsive layouts.
- **Server-Sent Events (SSE)**: Streams real-time progress, download speeds, processing status, and ETAs from the shell directly to the frontend.
- **Automated Cleanup**: Deletes temporary files immediately upon user download, or automatically via a cron/interval sweeper if left unclaimed for 30 minutes.
- **Zero Configuration Boilerplate**: The application auto-detects and installs `yt-dlp` binaries for the matching environment on server boot.

---

## ⚙️ Setup and Installation

### 1. Requirements
Ensure you have **Node.js (v18 or higher)** installed on your machine.

### 2. Install Dependencies
In the root directory, install all package dependencies:
```bash
npm install
```

### 3. Local Setup
Start the server in development mode:
```bash
npm run dev
```
Wait a brief moment while the application bootstraps and checks for system binaries.
- If it does not detect `yt-dlp` in your environment PATH, it will automatically download the correct executable (`yt-dlp.exe` for Windows, `yt-dlp` for Linux, etc.) into `backend/bin/` from its official GitHub releases.
- It resolves `ffmpeg` paths dynamically using the `ffmpeg-static` library.

Once started, open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🔒 Environment Variables (`.env`)
You can configure behavior by editing the `.env` file at the root:
```env
PORT=3000
NODE_ENV=development
MAX_FILE_SIZE_MB=150
DOWNLOAD_CLEANUP_MINUTES=30
```

---

## ☁️ Deployment Guide

### Deploying to Railway (Recommended)
MusicRip is production-ready for **Railway**:

1. **System Binaries Setup**: Railway uses **Nixpacks** to build node projects. To ensure Nixpacks installs `yt-dlp` and `ffmpeg` globally in the container's path, create a `nixpacks.toml` file in the root directory:
   ```toml
   [providers]
   node = {}

   [phases.setup]
   nixPkgs = ["...", "ffmpeg", "yt-dlp"]
   ```
   *Note: MusicRip's bootstrap checks system PATH first. If Railway Nixpacks provides system-level packages, our server utilizes them natively for improved speed.*

2. **Add Environment Variables**:
   Configure the `PORT` and `NODE_ENV=production` variables in the Railway console.

3. **Enjoy Live Streaming**: The server will spin up and accept connections, streaming downloads immediately.

---

## ⚖️ Legal Disclaimer
This software is intended for educational, personal, and fair-use study only. MusicRip does not host, index, or archive any files. Users are solely responsible for ensuring they possess the necessary rights and permissions from content owners and comply with the terms of service of third-party websites before downloading media.
