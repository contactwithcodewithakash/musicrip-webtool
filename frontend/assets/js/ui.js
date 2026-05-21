/**
 * MusicRip Frontend UI Interactions & GSAP Controller
 */

import { fetchMetadata, registerDownload, trackDownloadProgress } from './api.js';
import { addToHistory, renderHistory, clearHistory } from './history.js';

// Application State
let currentMetadata = null;
let currentFormat = 'mp3'; // mp3 or mp4
let activeCancelHelper = null;

// DOM Elements
const urlInput = document.getElementById('url-input');
const btnPaste = document.getElementById('btn-paste');
const btnSubmit = document.getElementById('btn-submit');
const metadataSkeleton = document.getElementById('metadata-skeleton');
const mediaPreviewCard = document.getElementById('media-preview-card');
const downloadProgressCard = document.getElementById('download-progress-card');

// Preview Elements
const previewThumbnail = document.getElementById('preview-thumbnail');
const previewDuration = document.getElementById('preview-duration');
const previewPlatformBadge = document.getElementById('preview-platform-badge');
const previewTitle = document.getElementById('preview-title');
const previewUploader = document.getElementById('preview-uploader');
const formatTabs = document.querySelectorAll('.format-tab');
const qualitySelect = document.getElementById('quality-select');
const btnDownloadStart = document.getElementById('btn-download-start');

// Progress Elements
const progressPercentCenter = document.getElementById('progress-percent-center');
const progressWorkTitle = document.getElementById('progress-work-title');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressPercent = document.getElementById('progress-percent');
const progressSpeed = document.getElementById('progress-speed');
const progressEta = document.getElementById('progress-eta');
const progressStatusMessage = document.getElementById('progress-status-message');
const btnCancelDownload = document.getElementById('btn-cancel-download');
const btnClearHistory = document.getElementById('btn-clear-history');

/* ==========================================================================
   Helper Functions
   ========================================================================== */

// Format seconds into HH:MM:SS or MM:SS
const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (num) => String(num).padStart(2, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
};

// Toast message emitter
const showToast = (message, type = 'success') => {
  let background = 'linear-gradient(to right, #00b8ff, #00ffb2)';
  if (type === 'error') {
    background = 'linear-gradient(to right, #ff3b30, #ff7b00)';
  } else if (type === 'info') {
    background = 'linear-gradient(to right, #252528, #35353a)';
  }

  Toastify({
    text: message,
    duration: 3500,
    close: true,
    gravity: 'top',
    position: 'right',
    stopOnFocus: true,
    style: {
      background: background,
      borderRadius: '12px',
      fontFamily: 'Outfit, sans-serif',
      fontSize: '0.9rem',
      fontWeight: '500',
      boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.05)'
    }
  }).showToast();
};

// Simple URL validation client-side
const isValidUrl = (urlStr) => {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    return host.includes('youtube.com') || host.includes('youtu.be') || host.includes('instagram.com');
  } catch (e) {
    return false;
  }
};

/* ==========================================================================
   UI Event Bindings & Transitions
   ========================================================================== */

// FAQ Accordion logic
const initFAQ = () => {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      // Close other open ones
      faqItems.forEach(otherItem => {
        if (otherItem !== item && otherItem.classList.contains('active')) {
          otherItem.classList.remove('active');
        }
      });
      // Toggle current
      item.classList.toggle('active');
    });
  });
};

// Clipboard Paste Handler
btnPaste.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text;
      showToast('Clipboard link pasted!', 'info');
      // Trigger submission immediately if valid link
      if (isValidUrl(text)) {
        analyzeLink(text);
      }
    } else {
      showToast('Clipboard is empty.', 'error');
    }
  } catch (err) {
    showToast('Clipboard access denied. Please paste manually.', 'error');
  }
});

// URL Input key triggers
urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const url = urlInput.value.trim();
    analyzeLink(url);
  }
});

// Analyze button trigger
btnSubmit.addEventListener('click', () => {
  const url = urlInput.value.trim();
  analyzeLink(url);
});

// Analyze Link Workflow
const analyzeLink = async (url) => {
  if (!url) {
    showToast('Please enter a URL first.', 'error');
    return;
  }

  if (!isValidUrl(url)) {
    showToast('Please enter a valid YouTube or Instagram link.', 'error');
    return;
  }

  // Cancel any active downloading process before analyzing new url
  if (activeCancelHelper) {
    activeCancelHelper();
    activeCancelHelper = null;
  }

  // UI Setup: Hide active cards and show skeleton
  gsap.to([mediaPreviewCard, downloadProgressCard], {
    opacity: 0,
    y: 20,
    duration: 0.2,
    onComplete: () => {
      mediaPreviewCard.classList.add('hidden');
      downloadProgressCard.classList.add('hidden');
      
      metadataSkeleton.classList.remove('hidden');
      gsap.fromTo(metadataSkeleton, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.3 });
    }
  });

  // Scroll to workspace smoothly
  document.getElementById('download-workspace').scrollIntoView({ behavior: 'smooth' });

  try {
    // API Call
    const metadata = await fetchMetadata(url);
    currentMetadata = metadata;

    // Populating Preview UI
    previewTitle.textContent = metadata.title;
    previewUploader.textContent = metadata.uploader;
    previewDuration.textContent = formatDuration(metadata.duration);
    previewThumbnail.src = metadata.thumbnail || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23252528%22/></svg>';

    // Platform badges
    previewPlatformBadge.className = 'platform-floating-badge';
    if (metadata.platform.includes('youtube')) {
      previewPlatformBadge.classList.add('youtube');
      previewPlatformBadge.innerHTML = '<i data-lucide="youtube"></i>';
    } else if (metadata.platform.includes('instagram')) {
      previewPlatformBadge.classList.add('instagram');
      previewPlatformBadge.innerHTML = '<i data-lucide="instagram"></i>';
    } else {
      previewPlatformBadge.innerHTML = '<i data-lucide="link"></i>';
    }
    if (window.lucide) window.lucide.createIcons();

    // Default Format Option
    setFormatTab('mp3');

    // Fade out skeleton, fade in preview card
    gsap.to(metadataSkeleton, {
      opacity: 0,
      y: -15,
      duration: 0.25,
      onComplete: () => {
        metadataSkeleton.classList.add('hidden');
        mediaPreviewCard.classList.remove('hidden');
        gsap.fromTo(mediaPreviewCard, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 });
      }
    });

    showToast('URL analysis completed!', 'success');

  } catch (error) {
    // Reset layout on error
    gsap.to(metadataSkeleton, {
      opacity: 0,
      duration: 0.2,
      onComplete: () => {
        metadataSkeleton.classList.add('hidden');
      }
    });
    showToast(error.message || 'Server failed to analyze the link.', 'error');
  }
};

// Format tab trigger bindings
formatTabs.forEach(tab => {
  tab.addEventListener('click', (e) => {
    const selectedFormat = e.currentTarget.getAttribute('data-format');
    setFormatTab(selectedFormat);
  });
});

const setFormatTab = (format) => {
  currentFormat = format;
  formatTabs.forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-format') === format);
  });

  // Adjust Select Dropdown options
  if (format === 'mp3') {
    qualitySelect.innerHTML = `
      <option value="320">320 kbps (Premium Audio HQ)</option>
      <option value="192">192 kbps (Standard Quality)</option>
      <option value="128">128 kbps (Eco Quality)</option>
    `;
  } else {
    qualitySelect.innerHTML = `
      <option value="1080">1080p (Full HD / Best Quality)</option>
      <option value="720">720p (HD Quality)</option>
      <option value="360">360p (SD Quality)</option>
    `;
  }
};

// Start Download execution
btnDownloadStart.addEventListener('click', async () => {
  if (!currentMetadata) return;

  const url = currentMetadata.url;
  const quality = qualitySelect.value;
  const title = currentMetadata.title;

  // Transition UI: Hide preview card and show progress card
  gsap.to(mediaPreviewCard, {
    opacity: 0,
    y: -15,
    duration: 0.25,
    onComplete: () => {
      mediaPreviewCard.classList.add('hidden');
      
      // Reset progress elements
      progressPercentCenter.textContent = '0%';
      progressWorkTitle.textContent = currentFormat === 'mp3' ? 'Extracting audio stream...' : 'Downloading video streams...';
      progressBarFill.style.width = '0%';
      progressPercent.textContent = '0%';
      progressSpeed.textContent = '0 MB/s';
      progressEta.textContent = '--:--';
      progressStatusMessage.textContent = 'Contacting downloading pipelines...';
      
      downloadProgressCard.classList.remove('hidden');
      gsap.fromTo(downloadProgressCard, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 });
    }
  });

  try {
    // 1. POST request to register download
    const downloadId = await registerDownload(url, currentFormat, quality, title);
    
    // 2. Open EventSource and trace progress stream
    activeCancelHelper = trackDownloadProgress(downloadId, {
      onStatus: (data) => {
        if (data.message) progressStatusMessage.textContent = data.message;
        if (data.progress) {
          progressBarFill.style.width = `${data.progress}%`;
          progressPercent.textContent = `${Math.round(data.progress)}%`;
          progressPercentCenter.textContent = `${Math.round(data.progress)}%`;
        }
      },
      onProgress: (data) => {
        progressBarFill.style.width = `${data.progress}%`;
        progressPercent.textContent = `${Math.round(data.progress)}%`;
        progressPercentCenter.textContent = `${Math.round(data.progress)}%`;
        progressSpeed.textContent = data.speed || 'N/A';
        progressEta.textContent = data.eta || '--:--';
        if (data.message) progressStatusMessage.textContent = data.message;
      },
      onComplete: (data) => {
        activeCancelHelper = null;
        showToast('Processing complete! Starting download...', 'success');
        
        // Append download item to history
        addToHistory(currentMetadata, currentFormat, quality);
        
        // Auto-download file by triggering window redirection to the completed file path
        if (data.downloadUrl) {
          // Create an invisible hyperlink to download file securely
          const link = document.createElement('a');
          const isAbsolute = data.downloadUrl.startsWith('http://') || data.downloadUrl.startsWith('https://');
          link.href = isAbsolute ? data.downloadUrl : (window.API_BASE_URL || '') + data.downloadUrl;
          // Trigger download attributes
          link.setAttribute('download', '');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        // Return back to preview/input state after brief delay
        setTimeout(() => {
          gsap.to(downloadProgressCard, {
            opacity: 0,
            y: -15,
            duration: 0.25,
            onComplete: () => {
              downloadProgressCard.classList.add('hidden');
              // Bring back preview
              mediaPreviewCard.classList.remove('hidden');
              gsap.to(mediaPreviewCard, { opacity: 1, y: 0, duration: 0.3 });
            }
          });
        }, 3000);
      },
      onError: (error) => {
        activeCancelHelper = null;
        showToast(error.message || 'Conversion failed. Please try again.', 'error');
        
        // Re-open preview card
        gsap.to(downloadProgressCard, {
          opacity: 0,
          y: -15,
          duration: 0.25,
          onComplete: () => {
            downloadProgressCard.classList.add('hidden');
            mediaPreviewCard.classList.remove('hidden');
            gsap.to(mediaPreviewCard, { opacity: 1, y: 0, duration: 0.3 });
          }
        });
      }
    });

  } catch (error) {
    showToast(error.message || 'Failed to start conversion pipeline.', 'error');
    
    // Return back to preview state on failure
    gsap.to(downloadProgressCard, {
      opacity: 0,
      onComplete: () => {
        downloadProgressCard.classList.add('hidden');
        mediaPreviewCard.classList.remove('hidden');
        gsap.to(mediaPreviewCard, { opacity: 1, y: 0, duration: 0.3 });
      }
    });
  }
});

// Cancel active downloading stream
btnCancelDownload.addEventListener('click', () => {
  if (activeCancelHelper) {
    activeCancelHelper();
    activeCancelHelper = null;
    showToast('Download cancelled by user.', 'info');
    
    // Transition back to media preview
    gsap.to(downloadProgressCard, {
      opacity: 0,
      y: 15,
      duration: 0.25,
      onComplete: () => {
        downloadProgressCard.classList.add('hidden');
        mediaPreviewCard.classList.remove('hidden');
        gsap.fromTo(mediaPreviewCard, { opacity: 0, y: -15 }, { opacity: 1, y: 0, duration: 0.3 });
      }
    });
  }
});

// Clear history action
btnClearHistory.addEventListener('click', () => {
  if (confirm('Are you sure you want to clear your download history?')) {
    clearHistory();
    showToast('History cleared!', 'info');
  }
});
// Mobile navigation menu handler
const initMobileMenu = () => {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const mobileNavDrawer = document.getElementById('mobile-nav-drawer');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

  if (!hamburgerBtn || !mobileNavDrawer) return;

  hamburgerBtn.addEventListener('click', () => {
    const isOpen = mobileNavDrawer.classList.contains('open');
    const icon = hamburgerBtn.querySelector('i');

    if (!isOpen) {
      // Open drawer
      mobileNavDrawer.classList.add('open');
      hamburgerBtn.classList.add('active');
      if (icon) {
        icon.setAttribute('data-lucide', 'x');
        if (window.lucide) window.lucide.createIcons();
      }
    } else {
      // Close drawer
      mobileNavDrawer.classList.remove('open');
      hamburgerBtn.classList.remove('active');
      if (icon) {
        icon.setAttribute('data-lucide', 'menu');
        if (window.lucide) window.lucide.createIcons();
      }
    }
  });

  // Close menu when clicking on any link
  mobileNavLinks.forEach(link => {
    link.addEventListener('click', () => {
      mobileNavDrawer.classList.remove('open');
      hamburgerBtn.classList.remove('active');
      const icon = hamburgerBtn.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', 'menu');
        if (window.lucide) window.lucide.createIcons();
      }
    });
  });

  // Close menu when clicking outside of drawer
  document.addEventListener('click', (e) => {
    if (mobileNavDrawer.classList.contains('open') &&
        !mobileNavDrawer.contains(e.target) &&
        !hamburgerBtn.contains(e.target)) {
      mobileNavDrawer.classList.remove('open');
      hamburgerBtn.classList.remove('active');
      const icon = hamburgerBtn.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', 'menu');
        if (window.lucide) window.lucide.createIcons();
      }
    }
  });
};

/* ==========================================================================
   Initialization on Load
   ========================================================================== */

const initApp = () => {
  // Load and render history from LocalStorage
  renderHistory();

  // Setup FAQ accordions
  initFAQ();

  // Initialize mobile menu
  initMobileMenu();

  // Set up header / hero entry GSAP animations
  if (window.gsap) {
    try {
      gsap.from('header', { opacity: 0, y: -20, duration: 0.8, ease: 'power2.out' });
      
      gsap.from('.hero-title', { opacity: 0, y: 30, duration: 0.8, ease: 'power3.out' });
      gsap.from('.hero-subtitle', { opacity: 0, y: 20, duration: 0.6, ease: 'power2.out', delay: 0.15 });
      gsap.from('.url-input-wrapper', { opacity: 0, y: 20, duration: 0.6, ease: 'power2.out', delay: 0.3 });
      gsap.from('.platforms-badges', { opacity: 0, duration: 0.5, delay: 0.45 });
    } catch (e) {
      console.warn('GSAP animation failed, applying fallback opacity:', e);
      document.querySelectorAll('header, .hero-title, .hero-subtitle, .url-input-wrapper, .platforms-badges')
        .forEach(el => {
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
    }
  }

  // Activate Lucide SVG icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
