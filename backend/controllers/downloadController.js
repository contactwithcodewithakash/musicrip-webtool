const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { DOWNLOADS_DIR, TEMP_DIR } = require('../utils/binaryCheck');

// Active download sessions store
const downloadSessions = new Map();

// Helper to sanitize filename for Content-Disposition
const sanitizeFilename = (filename) => {
  return filename
    .replace(/[\\/:*?"<>|]/g, '') // remove forbidden characters in Windows
    .replace(/\s+/g, '_');        // replace spaces with underscores
};

// Parse yt-dlp progress output
const parseProgress = (line) => {
  // Typical yt-dlp progress line:
  // [download]  12.5% of   11.45MiB at    1.56MiB/s ETA 00:06
  // Or:
  // [download]  100% of   11.45MiB in 00:07
  const progressRegex = /\[download\]\s+([\d.]+)%\s+of\s+(\S+)\s+at\s+(\S+)\s+ETA\s+(\S+)/;
  const match = line.match(progressRegex);
  
  if (match) {
    return {
      progress: parseFloat(match[1]),
      size: match[2],
      speed: match[3],
      eta: match[4]
    };
  }

  // Check for simple percentage (e.g. uploader percentage)
  const simpleRegex = /\[download\]\s+([\d.]+)%/;
  const simpleMatch = line.match(simpleRegex);
  if (simpleMatch) {
    return {
      progress: parseFloat(simpleMatch[1]),
      size: 'Unknown',
      speed: 'Calculating...',
      eta: 'Unknown'
    };
  }

  return null;
};

// Fetch info handler
const getInfo = (ytDlpPath, url) => {
  return new Promise((resolve, reject) => {
    let outputData = '';
    let errorData = '';

    console.log(`[Info Fetch] Spawning yt-dlp to dump json for URL: ${url}`);
    
    // Use spawn with argument array to prevent command injection
    const child = spawn(ytDlpPath, [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      url
    ]);

    child.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Info Fetch] Failed with exit code ${code}. Error: ${errorData}`);
        const errMsg = errorData.trim();
        if (errMsg.includes('Sign in to confirm you are not a bot')) {
          return reject(new Error('YouTube is blocking this request. Please try an Instagram link, or try again later.'));
        }
        return reject(new Error(`Failed to retrieve video metadata: ${errMsg || 'Exit code ' + code}`));
      }

      try {
        const json = JSON.parse(outputData);
        
        // Extract required fields safely
        const metadata = {
          title: json.title || 'Unknown Title',
          duration: json.duration || 0, // in seconds
          thumbnail: json.thumbnail || (json.thumbnails && json.thumbnails.length ? json.thumbnails[json.thumbnails.length - 1].url : ''),
          uploader: json.uploader || json.channel || 'Unknown Creator',
          platform: json.extractor_key ? json.extractor_key.toLowerCase() : 'unknown',
          url: json.webpage_url || url
        };

        resolve(metadata);
      } catch (err) {
        console.error('[Info Fetch] JSON parse error:', err);
        reject(new Error('Failed to parse video metadata.'));
      }
    });
  });
};

// SSE stream writer helper
const writeSSE = (res, event, data) => {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

// Process download with SSE updates
const processDownloadStream = (ytDlpPath, ffmpegPath, downloadId, session, res) => {
  const { url, format, quality, title } = session;
  let child = null;
  let filename = '';
  let fileExtension = format === 'mp3' ? 'mp3' : 'mp4';
  
  // Clean title for file path representation
  const safeTitle = sanitizeFilename(title);
  filename = `${downloadId}.${fileExtension}`;
  const outputPath = path.join(DOWNLOADS_DIR, filename);

  writeSSE(res, 'status', { status: 'starting', message: 'Initializing download process...' });

  const args = [];

  // Common options
  args.push('--no-playlist');
  args.push('--no-warnings');
  args.push('--ffmpeg-location', ffmpegPath);
  args.push('--newline'); // Print progress on new lines for easy reading

  // Enforce server-side file size download safety limit
  const maxFileSizeMb = process.env.MAX_FILE_SIZE_MB || '150';
  args.push('--max-filesize', `${maxFileSizeMb}M`);

  // Output destination format
  args.push('-o', path.join(DOWNLOADS_DIR, `${downloadId}.%(ext)s`));

  if (format === 'mp3') {
    // Extract Audio
    args.push('-x');
    args.push('--audio-format', 'mp3');
    args.push('--audio-quality', `${quality}k`); // e.g. 128k, 192k, 320k
  } else {
    // Video: Select best resolution <= selected quality
    // e.g. bestvideo[height<=1080]+bestaudio/best[height<=1080]/best
    args.push('-f', `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`);
    args.push('--merge-output-format', 'mp4');
  }

  // URL must be the last argument
  args.push(url);

  console.log(`[Download Process] Spawning: ${ytDlpPath} ${args.map(a => `"${a}"`).join(' ')}`);

  child = spawn(ytDlpPath, args);
  session.childProcess = child;

  let currentPhase = 'downloading'; // downloading, processing

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;

      // Detect phases
      if (cleanLine.includes('[ExtractAudio]') || cleanLine.includes('[Merger]') || cleanLine.includes('[VideoConvertor]')) {
        currentPhase = 'processing';
        writeSSE(res, 'status', { 
          status: 'processing', 
          progress: 95, 
          message: 'Converting and merging files (this may take a moment)...' 
        });
        continue;
      }

      // Parse progress if in downloading phase
      if (currentPhase === 'downloading') {
        const prog = parseProgress(cleanLine);
        if (prog) {
          writeSSE(res, 'progress', {
            status: 'downloading',
            progress: prog.progress,
            size: prog.size,
            speed: prog.speed,
            eta: prog.eta,
            message: `Downloading: ${prog.progress}% completed`
          });
        }
      }
    }
  });

  child.stderr.on('data', (data) => {
    const errorLine = data.toString().trim();
    // yt-dlp prints some warnings or non-fatal details to stderr, so we just log it
    console.warn(`[Download Process stderr] ${errorLine}`);
  });

  child.on('close', (code) => {
    session.childProcess = null;
    
    if (code !== 0) {
      console.error(`[Download Process] Finished with non-zero exit code: ${code}`);
      writeSSE(res, 'status', { status: 'error', error: 'Failed to download or transcode media file.' });
      res.end();
      downloadSessions.delete(downloadId);
      return;
    }

    // Verify file exists
    // Note: yt-dlp might output some other extensions before merger, but with --merge-output-format mp4 or audio-format mp3,
    // the final output should be downloadId.mp4 or downloadId.mp3.
    // If it was already in the target format and didn't need merging, it would have downloaded as downloadId.ext.
    // Let's check what file actually exists in the directory starting with downloadId.
    fs.readdir(DOWNLOADS_DIR, (err, files) => {
      if (err) {
        writeSSE(res, 'status', { status: 'error', error: 'Server error retrieving downloaded file.' });
        res.end();
        downloadSessions.delete(downloadId);
        return;
      }

      const matchFile = files.find(f => f.startsWith(downloadId));
      if (!matchFile) {
        writeSSE(res, 'status', { status: 'error', error: 'Downloaded file was not found on server.' });
        res.end();
        downloadSessions.delete(downloadId);
        return;
      }

      const finalPath = path.join(DOWNLOADS_DIR, matchFile);
      const stats = fs.statSync(finalPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      // Save file path in session for retrieval
      session.filePath = finalPath;
      session.fileSize = fileSizeMB;
      session.actualFilename = matchFile;

      console.log(`[Download Process] Finished successfully. File size: ${fileSizeMB} MB. Path: ${finalPath}`);

      writeSSE(res, 'status', { 
        status: 'complete', 
        progress: 100,
        fileSize: `${fileSizeMB} MB`,
        downloadUrl: `/api/files/download/${downloadId}`,
        message: 'Download ready!'
      });
      res.end();
    });
  });

  child.on('error', (err) => {
    console.error('[Download Process] Spawn error:', err);
    writeSSE(res, 'status', { status: 'error', error: 'Server failed to start downloader process.' });
    res.end();
    downloadSessions.delete(downloadId);
  });
};

module.exports = {
  downloadSessions,
  getInfo,
  processDownloadStream,
  sanitizeFilename
};
