const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { initBinaries } = require('./utils/binaryCheck');
const { startCleanupJob } = require('./utils/fileCleanup');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Setup
app.use(morgan('dev'));
app.use(express.json());
app.use(cors());

// Configure Helmet for SaaS style app loading external thumbnails
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(compression());

// Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP. Please try again after 15 minutes.'
  }
});
app.use('/api/', apiLimiter);

// Mount API routes
app.use('/api', apiRoutes);

// Serve Static Frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve main landing index.html for unknown routes to support SPA feel
app.get('*', (req, res) => {
  // If request is for an API route, return 404 json instead of index.html
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('[Express Error Handler]:', err.stack);
  res.status(500).json({
    success: false,
    error: 'An unexpected server error occurred.'
  });
});

// Bootstrapper
const startServer = async () => {
  try {
    console.log('[System Boot] Initializing dependencies...');
    
    // Resolve/Download binaries
    const binaries = await initBinaries();
    
    // Save to environment
    process.env.YT_DLP_PATH = binaries.ytDlpPath;
    process.env.FFMPEG_PATH = binaries.ffmpegPath;
    
    console.log('[System Boot] Binaries loaded. Starting cleanup cron...');
    
    // Start file cleanup job
    const cleanupInterval = 15; // check every 15 minutes
    const maxAge = parseInt(process.env.DOWNLOAD_CLEANUP_MINUTES) || 30; // purge 30-min-old files
    startCleanupJob(cleanupInterval, maxAge);
    
    console.log('[System Boot] Starting HTTP listener...');
    app.listen(PORT, () => {
      console.log(`=============================================================`);
      console.log(`🚀 MusicRip server running on: http://localhost:${PORT}`);
      console.log(`🔒 Mode: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=============================================================`);
    });
  } catch (error) {
    console.error('[System Boot Failed] Critical initialization error:', error.message);
    process.exit(1);
  }
};

startServer();
