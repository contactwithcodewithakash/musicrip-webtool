const fs = require('fs');
const path = require('path');
const { DOWNLOADS_DIR, TEMP_DIR } = require('./binaryCheck');

const cleanDirectory = (dirPath, maxAgeMs) => {
  if (!fs.existsSync(dirPath)) return;

  fs.readdir(dirPath, (err, files) => {
    if (err) {
      console.error(`[Cleanup] Error reading directory ${dirPath}:`, err);
      return;
    }

    const now = Date.now();

    files.forEach((file) => {
      const filePath = path.join(dirPath, file);
      
      // Skip hidden files or system files
      if (file.startsWith('.')) return;

      fs.stat(filePath, (statErr, stats) => {
        if (statErr) {
          console.error(`[Cleanup] Error stating file ${filePath}:`, statErr);
          return;
        }

        // If file is older than the maxAge, delete it
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
              console.error(`[Cleanup] Error deleting file ${filePath}:`, unlinkErr);
            } else {
              console.log(`[Cleanup] Successfully auto-deleted old file: ${file}`);
            }
          });
        }
      });
    });
  });
};

const startCleanupJob = (intervalMinutes = 15, maxAgeMinutes = 30) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  console.log(`[Cleanup] Starting file cleanup cron job. Running every ${intervalMinutes} minutes, purging files older than ${maxAgeMinutes} minutes.`);

  // Run cleanup immediately on start
  cleanDirectory(DOWNLOADS_DIR, maxAgeMs);
  cleanDirectory(TEMP_DIR, maxAgeMs);

  // Set interval
  setInterval(() => {
    console.log('[Cleanup] Running scheduled files cleanup sweep...');
    cleanDirectory(DOWNLOADS_DIR, maxAgeMs);
    cleanDirectory(TEMP_DIR, maxAgeMs);
  }, intervalMs);
};

module.exports = {
  startCleanupJob
};
