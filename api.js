/**
 * MusicRip Client API Helper
 */

// If you are hosting the frontend on Hostinger Shared Hosting, 
// enter your backend URL here (e.g., 'https://musicrip-backend.onrender.com').
// Keep it empty '' if hosting frontend and backend on the same server.
export const API_BASE_URL = 'https://musicrip-webtool.onrender.com';
window.API_BASE_URL = API_BASE_URL;

// Fetch video metadata
export const fetchMetadata = async (url) => {
  try {
    const encodedUrl = encodeURIComponent(url);
    const response = await fetch(`${API_BASE_URL}/api/info?url=${encodedUrl}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch video information.');
    }
    
    return data.metadata;
  } catch (error) {
    console.error('[API fetchMetadata Error]:', error);
    throw error;
  }
};

// Register download request
export const registerDownload = async (url, format, quality, title) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url, format, quality, title })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to initiate download.');
    }
    
    return data.downloadId;
  } catch (error) {
    console.error('[API registerDownload Error]:', error);
    throw error;
  }
};

// Track progress via SSE
export const trackDownloadProgress = (downloadId, callbacks) => {
  const { onProgress, onStatus, onComplete, onError } = callbacks;
  
  // Connect to SSE stream
  const eventSource = new EventSource(`${API_BASE_URL}/api/status/${downloadId}`);
  
  eventSource.addEventListener('status', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.status === 'complete') {
        eventSource.close();
        if (onComplete) onComplete(data);
      } else if (data.status === 'error') {
        eventSource.close();
        if (onError) onError(new Error(data.error || 'An error occurred during transcoding.'));
      } else {
        if (onStatus) onStatus(data);
      }
    } catch (err) {
      console.error('Error parsing SSE status message:', err);
    }
  });

  eventSource.addEventListener('progress', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (onProgress) onProgress(data);
    } catch (err) {
      console.error('Error parsing SSE progress message:', err);
    }
  });

  eventSource.onerror = (err) => {
    console.error('[SSE connection error]:', err);
    eventSource.close();
    if (onError) onError(new Error('Connection to the server progress tracker was interrupted.'));
  };

  // Return cancel helper
  return () => {
    console.log(`[API trackProgress] Cancelling active connection for ${downloadId}`);
    eventSource.close();
  };
};
