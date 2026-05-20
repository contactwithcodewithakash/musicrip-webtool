const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');
const ffmpegStatic = require('ffmpeg-static');

// Setup paths
const BIN_DIR = path.join(__dirname, '../bin');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const TEMP_DIR = path.join(__dirname, '../temp');

// Get proper yt-dlp filename based on platform
const getYtDlpFilename = () => {
  const platform = os.platform();
  if (platform === 'win32') {
    return 'yt-dlp.exe';
  } else if (platform === 'darwin') {
    return 'yt-dlp_macos';
  }
  return 'yt-dlp';
};

const getYTdlpDownloadUrl = () => {
  const filename = getYtDlpFilename();
  return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${filename}`;
};

// Helper to check if a command is available in system PATH
const isCommandAvailable = (cmd) => {
  try {
    const checkCmd = os.platform() === 'win32' 
      ? `where ${cmd} >nul 2>nul` 
      : `which ${cmd} >/dev/null 2>&1`;
    execSync(checkCmd);
    return true;
  } catch (e) {
    // If check command fails, it might not be in PATH
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return true;
    } catch (e2) {
      return false;
    }
  }
};

// Download helper supporting redirects
const downloadFile = (url, destPath) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    const request = (targetUrl) => {
      https.get(targetUrl, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          // Re-create the stream if we were redirected
          fs.unlink(destPath, () => {
            const nextUrl = response.headers.location;
            downloadFile(nextUrl, destPath).then(resolve).catch(reject);
          });
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: Server returned status ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve());
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => reject(err));
      });
    };

    request(url);
  });
};

const initBinaries = async () => {
  // Ensure directories exist
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
  if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  const ffmpegPath = ffmpegStatic;
  console.log(`[Binary Check] FFmpeg path resolved to: ${ffmpegPath}`);

  let ytDlpPath = '';
  const localYtDlp = path.join(BIN_DIR, getYtDlpFilename());

  // 1. Check if yt-dlp is in system PATH
  if (isCommandAvailable('yt-dlp')) {
    ytDlpPath = 'yt-dlp';
    console.log('[Binary Check] yt-dlp is available in the system PATH');
  } 
  // 2. Check if yt-dlp is present locally
  else if (fs.existsSync(localYtDlp)) {
    ytDlpPath = localYtDlp;
    console.log(`[Binary Check] yt-dlp is available locally at: ${ytDlpPath}`);
  } 
  // 3. Download yt-dlp locally
  else {
    const downloadUrl = getYTdlpDownloadUrl();
    console.log(`[Binary Check] yt-dlp not found in PATH or locally. Downloading from: ${downloadUrl}`);
    console.log(`[Binary Check] Destination: ${localYtDlp}`);
    
    try {
      await downloadFile(downloadUrl, localYtDlp);
      console.log('[Binary Check] yt-dlp downloaded successfully!');

      // Set permissions on Unix/macOS
      if (os.platform() !== 'win32') {
        fs.chmodSync(localYtDlp, 0o755);
      }

      ytDlpPath = localYtDlp;
    } catch (error) {
      console.error('[Binary Check] Error downloading yt-dlp:', error.message);
      throw error;
    }
  }

  // Double check executing it
  try {
    const versionOutput = execSync(`"${ytDlpPath}" --version`).toString().trim();
    console.log(`[Binary Check] yt-dlp verification successful. Version: ${versionOutput}`);
  } catch (err) {
    console.error('[Binary Check] yt-dlp verification failed:', err.message);
    throw new Error('yt-dlp is not executable or failed to start.');
  }

  return { ffmpegPath, ytDlpPath };
};

module.exports = {
  initBinaries,
  BIN_DIR,
  DOWNLOADS_DIR,
  TEMP_DIR
};
