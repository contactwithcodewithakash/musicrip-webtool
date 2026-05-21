const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getInfo, processDownloadStream, downloadSessions, sanitizeFilename } = require('../controllers/downloadController');

// URL Validation helper
const isValidUrl = (urlStr) => {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    
    // Support youtube and instagram domains
    const supportedHosts = [
      'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
      'instagram.com', 'www.instagram.com'
    ];
    
    return supportedHosts.some(sh => host === sh || host.endsWith('.' + sh));
  } catch (err) {
    return false;
  }
};

// Route: Get Video/Reel Info
router.get('/info', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL parameter is required.' });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ success: false, error: 'Unsupported URL. Please paste a valid YouTube or Instagram link.' });
  }

  const ytDlpPath = process.env.YT_DLP_PATH;
  if (!ytDlpPath) {
    return res.status(500).json({ success: false, error: 'Server binaries are not initialized yet.' });
  }

  try {
    const metadata = await getInfo(ytDlpPath, url);
    return res.json({ success: true, metadata });
  } catch (error) {
    console.error(`[API Info] Error fetching metadata:`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Route: Register Download Request
router.post('/download', (req, res) => {
  const { url, format, quality, title } = req.body;

  if (!url || !format || !quality || !title) {
    return res.status(400).json({ success: false, error: 'All fields (url, format, quality, title) are required.' });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ success: false, error: 'Unsupported URL.' });
  }

  // Rate limit check: Maximum file size validation could occur, 
  // but yt-dlp will handle streaming directly.
  
  const downloadId = crypto.randomUUID();
  
  // Register session
  downloadSessions.set(downloadId, {
    url,
    format,
    quality,
    title,
    status: 'pending',
    childProcess: null,
    filePath: null,
    fileSize: null,
    actualFilename: null,
    createdAt: Date.now()
  });

  console.log(`[API Download] Registered session ${downloadId} for ${title} [${format} ${quality}]`);

  return res.json({
    success: true,
    downloadId
  });
});

// Route: SSE Progress Status Stream
router.get('/status/:id', (req, res) => {
  const downloadId = req.params.id;
  const session = downloadSessions.get(downloadId);

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found or expired.' });
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Content-Encoding': 'none'
  });

  // Keep-alive heartbeat interval to avoid browser connection drops
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 15000);

  const ytDlpPath = process.env.YT_DLP_PATH;
  const ffmpegPath = process.env.FFMPEG_PATH;

  if (!ytDlpPath || !ffmpegPath) {
    res.write(`event: status\ndata: ${JSON.stringify({ status: 'error', error: 'Server is not fully initialized.' })}\n\n`);
    res.end();
    clearInterval(heartbeat);
    return;
  }

  // Launch the download stream
  processDownloadStream(ytDlpPath, ffmpegPath, downloadId, session, res);

  // If connection is closed by client, clean up
  req.on('close', () => {
    clearInterval(heartbeat);
    
    // If the process is still running, kill it to save bandwidth
    if (session.childProcess) {
      console.log(`[SSE Client Closed] Killing active process for session ${downloadId}`);
      try {
        session.childProcess.kill('SIGKILL');
      } catch (err) {
        console.error(`[SSE Client Closed] Error killing process:`, err);
      }
      downloadSessions.delete(downloadId);
    }
  });
});

// Route: File Downloader
router.get('/files/download/:id', (req, res) => {
  const downloadId = req.params.id;
  const session = downloadSessions.get(downloadId);

  if (!session || !session.filePath) {
    return res.status(404).send('Download link expired or invalid. Please search and download again.');
  }

  const { filePath, title, format, actualFilename } = session;

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File was deleted from server. Downloads are only cached for 30 minutes.');
  }

  // Create clean download filename
  const cleanTitle = sanitizeFilename(title);
  const ext = format === 'mp3' ? 'mp3' : 'mp4';
  const downloadName = `${cleanTitle}.${ext}`;

  console.log(`[API File Serve] Serving ${downloadName} to user...`);

  // Serve the file
  res.download(filePath, downloadName, (err) => {
    if (err) {
      console.error(`[API File Serve] Error sending file:`, err);
      // Don't send headers here since res.download might have already written them
    } else {
      console.log(`[API File Serve] Served ${downloadName} successfully. Clean-up deletion...`);
      // Delete the file immediately after successful download to save space
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error(`[API File Serve] Failed to delete file:`, unlinkErr);
        } else {
          console.log(`[API File Serve] Disk space reclaimed for: ${actualFilename}`);
        }
      });
      // Delete session
      downloadSessions.delete(downloadId);
    }
  });
});

// Route: Diagnose YouTube issues
router.get('/diagnose-yt', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL parameter is required.' });

  const { exec } = require('child_process');
  const ytDlpPath = process.env.YT_DLP_PATH;
  const ffmpegPath = process.env.FFMPEG_PATH;

  const cookiesPath = path.join(__dirname, '../youtube_cookies.txt');
  const cookiesExist = fs.existsSync(cookiesPath);
  
  let cmd = `"${ytDlpPath}" -v -F`;
  
  // Add cookies if present
  if (cookiesExist) {
    cmd += ` --cookies "${cookiesPath}"`;
  } else {
    // Fall back to cookies.txt
    const genericCookies = path.join(__dirname, '../cookies.txt');
    if (fs.existsSync(genericCookies)) {
      cmd += ` --cookies "${genericCookies}"`;
    }
  }

  cmd += ` --no-config "${url}"`;
  
  console.log(`[Diagnostic] Executing command: ${cmd}`);

  exec(cmd, (error, stdout, stderr) => {
    res.json({
      success: !error,
      command: cmd,
      cookiesExist,
      ffmpegPath,
      exitCode: error ? error.code : 0,
      stdout: stdout.toString(),
      stderr: stderr.toString()
    });
  });
});

module.exports = router;
