/**
 * Background Service Worker for YouTube Transcriber Extension
 * 
 * Handles:
 * - Extension icon click → open side panel
 * - Tab monitoring for YouTube video detection
 * - Message passing between content script and side panel
 * - Storage operations for API key and settings
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const DEBUG = true;
const YOUTUBE_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /^https?:\/\/(www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Debug logging utility
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
  if (DEBUG) {
    console.log('[YT-Transcriber BG]', ...args);
  }
}

/**
 * Extract video ID from a YouTube URL
 * @param {string} url - The URL to parse
 * @returns {string|null} - Video ID or null if not found
 */
function extractVideoId(url) {
  if (!url) return null;
  
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      // The video ID is in different capture groups depending on the pattern
      return match[2] || match[1];
    }
  }
  return null;
}

/**
 * Check if a URL is a YouTube video page
 * @param {string} url - The URL to check
 * @returns {boolean}
 */
function isYouTubeVideoUrl(url) {
  return extractVideoId(url) !== null;
}

// =============================================================================
// SIDE PANEL MANAGEMENT
// =============================================================================

/**
 * Open the side panel for the current tab
 * @param {number} tabId - The tab ID to open the panel for
 */
async function openSidePanel(tabId) {
  try {
    await chrome.sidePanel.open({ tabId });
    debugLog('Side panel opened for tab:', tabId);
  } catch (error) {
    debugLog('Error opening side panel:', error);
  }
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener(async (tab) => {
  debugLog('Extension icon clicked, tab:', tab.id);
  await openSidePanel(tab.id);
});

// Handle tab updates to detect YouTube video navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only process when the URL changes and is complete
  if (changeInfo.status === 'complete' && tab.url) {
    const videoId = extractVideoId(tab.url);
    
    if (videoId) {
      debugLog('YouTube video detected:', videoId, 'on tab:', tabId);
      
      // Store the current video info for the side panel to retrieve
      chrome.storage.session.set({
        currentVideo: {
          tabId,
          videoId,
          url: tab.url,
          timestamp: Date.now()
        }
      });
      
      // Notify any open side panel about the video change
      chrome.runtime.sendMessage({
        type: 'VIDEO_DETECTED',
        data: {
          tabId,
          videoId,
          url: tab.url
        }
      }).catch(() => {
        // Side panel might not be open, ignore error
      });
    }
  }
});

// Handle tab activation (switching between tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const videoId = extractVideoId(tab.url);
    
    if (videoId) {
      debugLog('Switched to tab with YouTube video:', videoId);
      
      chrome.storage.session.set({
        currentVideo: {
          tabId: activeInfo.tabId,
          videoId,
          url: tab.url,
          timestamp: Date.now()
        }
      });
      
      chrome.runtime.sendMessage({
        type: 'VIDEO_DETECTED',
        data: {
          tabId: activeInfo.tabId,
          videoId,
          url: tab.url
        }
      }).catch(() => {});
    } else {
      // Clear current video when switching to non-YouTube tab
      chrome.storage.session.set({ currentVideo: null });
      
      chrome.runtime.sendMessage({
        type: 'NO_VIDEO',
        data: { tabId: activeInfo.tabId }
      }).catch(() => {});
    }
  } catch (error) {
    debugLog('Error handling tab activation:', error);
  }
});

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog('Message received:', message.type);
  
  switch (message.type) {
    case 'GET_CURRENT_VIDEO':
      handleGetCurrentVideo(sendResponse);
      return true; // Will respond asynchronously
      
    case 'GET_API_KEY':
      handleGetApiKey(sendResponse);
      return true;
      
    case 'SET_API_KEY':
      handleSetApiKey(message.data, sendResponse);
      return true;
      
    case 'GET_SETTINGS':
      handleGetSettings(sendResponse);
      return true;
      
    case 'SET_SETTINGS':
      handleSetSettings(message.data, sendResponse);
      return true;
      
    case 'GET_CACHED_TRANSCRIPTION':
      handleGetCachedTranscription(message.data, sendResponse);
      return true;
      
    case 'SET_CACHED_TRANSCRIPTION':
      handleSetCachedTranscription(message.data, sendResponse);
      return true;
      
    case 'VIDEO_METADATA':
      // Forward video metadata from content script to side panel
      chrome.runtime.sendMessage({
        type: 'VIDEO_METADATA_UPDATE',
        data: { ...message.data, tabId: sender.tab?.id }
      }).catch(() => {});
      sendResponse({ success: true });
      return false;
      
    case 'CLEAR_CACHE':
      handleClearCache(sendResponse);
      return true;
      
    default:
      debugLog('Unknown message type:', message.type);
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

// =============================================================================
// MESSAGE HANDLERS
// =============================================================================

/**
 * Handle request for current video information
 */
async function handleGetCurrentVideo(sendResponse) {
  try {
    // First, try to get from session storage
    const { currentVideo } = await chrome.storage.session.get('currentVideo');
    
    if (currentVideo) {
      sendResponse({ success: true, data: currentVideo });
      return;
    }
    
    // If no session data, check the active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (activeTab && activeTab.url) {
      const videoId = extractVideoId(activeTab.url);
      
      if (videoId) {
        const videoData = {
          tabId: activeTab.id,
          videoId,
          url: activeTab.url,
          timestamp: Date.now()
        };
        
        // Store for future use
        await chrome.storage.session.set({ currentVideo: videoData });
        
        sendResponse({ success: true, data: videoData });
        return;
      }
    }
    
    sendResponse({ success: false, data: null });
  } catch (error) {
    debugLog('Error getting current video:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle request for API key
 */
async function handleGetApiKey(sendResponse) {
  try {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    sendResponse({ success: true, data: apiKey || null });
  } catch (error) {
    debugLog('Error getting API key:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle request to save API key
 */
async function handleSetApiKey(apiKey, sendResponse) {
  try {
    await chrome.storage.local.set({ apiKey });
    debugLog('API key saved successfully');
    sendResponse({ success: true });
  } catch (error) {
    debugLog('Error saving API key:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle request for user settings
 */
async function handleGetSettings(sendResponse) {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    const defaultSettings = {
      language: 'auto',
      responseFormat: 'verbose_json',
      showTimestamps: true,
      theme: 'system'
    };
    sendResponse({ success: true, data: { ...defaultSettings, ...settings } });
  } catch (error) {
    debugLog('Error getting settings:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle request to save user settings
 */
async function handleSetSettings(settings, sendResponse) {
  try {
    await chrome.storage.local.set({ settings });
    debugLog('Settings saved:', settings);
    sendResponse({ success: true });
  } catch (error) {
    debugLog('Error saving settings:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle request for cached transcription
 */
async function handleGetCachedTranscription(videoId, sendResponse) {
  try {
    const { transcriptionCache } = await chrome.storage.local.get('transcriptionCache');
    const cache = transcriptionCache || {};
    sendResponse({ success: true, data: cache[videoId] || null });
  } catch (error) {
    debugLog('Error getting cached transcription:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle request to cache a transcription
 */
async function handleSetCachedTranscription({ videoId, transcription }, sendResponse) {
  try {
    const { transcriptionCache } = await chrome.storage.local.get('transcriptionCache');
    let cache = transcriptionCache || {};
    
    // Implement cache size limit (50 items)
    const cacheKeys = Object.keys(cache);
    if (cacheKeys.length >= 50) {
      // Remove oldest entry
      const oldestKey = cacheKeys.reduce((oldest, key) => {
        if (!oldest || cache[key].timestamp < cache[oldest].timestamp) {
          return key;
        }
        return oldest;
      }, null);
      
      if (oldestKey) {
        delete cache[oldestKey];
        debugLog('Removed oldest cache entry:', oldestKey);
      }
    }
    
    // Add new entry
    cache[videoId] = {
      ...transcription,
      timestamp: Date.now()
    };
    
    await chrome.storage.local.set({ transcriptionCache: cache });
    debugLog('Transcription cached for video:', videoId);
    sendResponse({ success: true });
  } catch (error) {
    debugLog('Error caching transcription:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle request to clear the transcription cache
 */
async function handleClearCache(sendResponse) {
  try {
    await chrome.storage.local.remove('transcriptionCache');
    debugLog('Transcription cache cleared');
    sendResponse({ success: true });
  } catch (error) {
    debugLog('Error clearing cache:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

debugLog('Background service worker initialized');

// Set up side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
