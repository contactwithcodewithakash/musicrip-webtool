/**
 * MusicRip LocalStorage Download History Manager
 */

const HISTORY_KEY = 'musicrip_history';
const MAX_HISTORY_ITEMS = 10;

// Load history items from localStorage
export const getHistory = () => {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Error loading history:', err);
    return [];
  }
};

// Add download item to history
export const addToHistory = (metadata, format, quality) => {
  try {
    const history = getHistory();
    
    // Create new log entry
    const entry = {
      id: Date.now().toString(),
      title: metadata.title,
      uploader: metadata.uploader,
      duration: metadata.duration,
      platform: metadata.platform,
      url: metadata.url,
      format,
      quality,
      timestamp: Date.now()
    };
    
    // Remove duplicates of same URL + format
    const filtered = history.filter(item => !(item.url === entry.url && item.format === entry.format));
    
    // Insert at front
    filtered.unshift(entry);
    
    // Cap size
    if (filtered.length > MAX_HISTORY_ITEMS) {
      filtered.pop();
    }
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
    renderHistory();
  } catch (err) {
    console.error('Error saving to history:', err);
  }
};

// Remove single item from history
export const deleteFromHistory = (id) => {
  try {
    const history = getHistory();
    const filtered = history.filter(item => item.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
    renderHistory();
  } catch (err) {
    console.error('Error deleting history item:', err);
  }
};

// Clear entire history
export const clearHistory = () => {
  try {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  } catch (err) {
    console.error('Error clearing history:', err);
  }
};

// Render history items into UI
export const renderHistory = () => {
  const container = document.getElementById('history-list');
  const section = document.getElementById('history-section');
  if (!container) return;
  
  const history = getHistory();
  
  if (history.length === 0) {
    section.classList.add('hidden');
    container.innerHTML = `
      <div class="empty-history">
        <i data-lucide="folder-open"></i>
        <p>No downloads recorded yet. Start downloading to log your history!</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }
  
  // Show section
  section.classList.remove('hidden');
  
  let html = '';
  
  history.forEach(item => {
    const dateStr = new Date(item.timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const icon = item.format === 'mp3' ? 'music' : 'video';
    const badgeClass = item.format === 'mp3' ? 'mp3' : 'mp4';
    const qualLabel = item.format === 'mp3' ? `${item.quality}kbps` : `${item.quality}p`;
    
    let platformIcon = 'link';
    if (item.platform.includes('youtube')) platformIcon = 'youtube';
    else if (item.platform.includes('instagram')) platformIcon = 'instagram';

    html += `
      <div class="history-item" data-id="${item.id}">
        <div class="history-item-details">
          <div class="history-item-icon ${badgeClass}">
            <i data-lucide="${icon}"></i>
          </div>
          <div class="history-item-info">
            <h4 class="history-item-title" title="${item.title}">${item.title}</h4>
            <div class="history-item-meta">
              <span class="platform-indicator"><i data-lucide="${platformIcon}" class="inline-icon"></i> ${item.uploader}</span>
              <span>&bull;</span>
              <span>${item.format.toUpperCase()} (${qualLabel})</span>
              <span>&bull;</span>
              <span>${dateStr}</span>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;" class="history-item-actions">
          <button class="btn-secondary btn-rip-again" data-url="${item.url}" title="Re-analyze this link">
            <i data-lucide="refresh-cw"></i> Rip Again
          </button>
          <button class="btn-link btn-delete-history" data-id="${item.id}" title="Remove from logs">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Bind actions
  container.querySelectorAll('.btn-rip-again').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = e.currentTarget.getAttribute('data-url');
      const input = document.getElementById('url-input');
      if (input) {
        input.value = url;
        input.scrollIntoView({ behavior: 'smooth' });
        // Trigger analyzer submit
        const submitBtn = document.getElementById('btn-submit');
        if (submitBtn) submitBtn.click();
      }
    });
  });
  
  container.querySelectorAll('.btn-delete-history').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      deleteFromHistory(id);
    });
  });
  
  // Refresh Lucide Icons for injected tags
  if (window.lucide) window.lucide.createIcons();
};
