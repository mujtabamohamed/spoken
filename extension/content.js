/**
 * Content Script for YouTube Transcriber Extension
 * 
 * Handles:
 * - YouTube URL detection and video ID extraction
 * - Video metadata extraction (title, duration, thumbnail)
 * - SPA navigation detection using MutationObserver
 * - Communication with background service worker
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const DEBUG = true;

// URL patterns for video ID extraction
const VIDEO_ID_PATTERNS = [
  /[?&]v=([a-zA-Z0-9_-]{11})/,
  /\/shorts\/([a-zA-Z0-9_-]{11})/,
  /\/embed\/([a-zA-Z0-9_-]{11})/
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
    console.log('[YT-Transcriber CS]', ...args);
  }
}

/**
 * Extract video ID from the current page URL
 * @returns {string|null} - Video ID or null if not found
 */
function extractVideoId() {
  const url = window.location.href;
  
  for (const pattern of VIDEO_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Get video metadata from the YouTube page
 * @returns {Object} - Video metadata object
 */
function getVideoMetadata() {
  const videoId = extractVideoId();
  
  if (!videoId) {
    return null;
  }
  
  // Try to get video title from various sources
  let title = '';
  
  // Method 1: Meta title tag (most reliable)
  const metaTitle = document.querySelector('meta[name="title"]');
  if (metaTitle) {
    title = metaTitle.getAttribute('content') || '';
  }
  
  // Method 2: og:title meta tag
  if (!title) {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      title = ogTitle.getAttribute('content') || '';
    }
  }
  
  // Method 3: Watch page title elements (multiple selectors for different layouts)
  if (!title) {
    const titleSelectors = [
      'h1.ytd-watch-metadata yt-formatted-string',
      'h1.ytd-video-primary-info-renderer yt-formatted-string',
      '#title h1 yt-formatted-string',
      'h1.ytd-watch-metadata',
      'h1.ytd-video-primary-info-renderer',
      '#container h1.title',
      'ytd-watch-metadata h1'
    ];
    
    for (const selector of titleSelectors) {
      const titleElement = document.querySelector(selector);
      if (titleElement && titleElement.textContent?.trim()) {
        title = titleElement.textContent.trim();
        break;
      }
    }
  }
  
  // Method 4: Document title (fallback)
  if (!title) {
    title = document.title.replace(' - YouTube', '').replace(/^\(\d+\)\s*/, '').trim();
  }
  
  // Get video duration
  let duration = null;
  const durationElement = document.querySelector('.ytp-time-duration');
  if (durationElement) {
    duration = durationElement.textContent;
  }
  
  // Get thumbnail URL
  const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  
  // Detect video type
  const isShort = window.location.pathname.includes('/shorts/');
  const isLive = !!document.querySelector('.ytp-live-badge');
  const isPremiere = !!document.querySelector('.ytp-premiere-badge');
  
  // Get channel name (multiple selectors)
  let channelName = '';
  const channelSelectors = [
    '#owner #channel-name a',
    'ytd-channel-name a',
    '#channel-name a',
    'ytd-video-owner-renderer #channel-name',
    '#owner-name a',
    'span.ytd-channel-name'
  ];
  
  for (const selector of channelSelectors) {
    const channelElement = document.querySelector(selector);
    if (channelElement && channelElement.textContent?.trim()) {
      channelName = channelElement.textContent.trim();
      break;
    }
  }
  
  return {
    videoId,
    title,
    duration,
    thumbnail,
    url: window.location.href,
    channelName,
    isShort,
    isLive,
    isPremiere,
    timestamp: Date.now()
  };
}

/**
 * Send video metadata to the background script
 */
// Flag to track if extension context is valid
let isExtensionValid = true;

function sendVideoMetadata() {
  // Check if extension context is still valid
  if (!isExtensionValid || !chrome.runtime?.id) {
    isExtensionValid = false;
    // Clean up if possible
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    return;
  }

  const metadata = getVideoMetadata();
  
  if (metadata) {
    debugLog('Sending video metadata:', metadata);
    
    try {
      chrome.runtime.sendMessage({
        type: 'VIDEO_METADATA',
        data: metadata
      }).catch(error => {
        // Handle orphaned context gracefully
        if (error.message.includes('Extension context invalidated')) {
          debugLog('Extension context invalidated, stopping updates');
          isExtensionValid = false;
          if (observer) {
            observer.disconnect();
            observer = null;
          }
        } else {
          debugLog('Error sending metadata:', error);
        }
      });
    } catch (e) {
      // Catch synchronous context errors
      debugLog('Sync error sending metadata:', e);
      if (e.message.includes('Extension context invalidated')) {
        isExtensionValid = false;
      }
    }
  }
}

// =============================================================================
// URL CHANGE DETECTION
// =============================================================================

let lastVideoId = null;
let observer = null;

/**
 * Check for URL/video changes and notify if changed
 */
function checkForVideoChange() {
  const currentVideoId = extractVideoId();
  
  if (currentVideoId !== lastVideoId) {
    lastVideoId = currentVideoId;
    
    if (currentVideoId) {
      debugLog('Video changed:', currentVideoId);
      
      // Wait a bit for page content to load
      setTimeout(() => {
        sendVideoMetadata();
      }, 1000);
    }
  }
}

/**
 * Initialize URL change observer for SPA navigation
 */
function initUrlObserver() {
  // Use popstate for browser back/forward navigation
  window.addEventListener('popstate', () => {
    debugLog('Popstate event detected');
    checkForVideoChange();
  });
  
  // Use MutationObserver to detect YouTube's SPA navigation
  // YouTube uses History API, so we observe the title or URL changes
  let lastUrl = window.location.href;
  
  observer = new MutationObserver(() => {
    const currentUrl = window.location.href;
    
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      debugLog('URL changed via SPA navigation');
      checkForVideoChange();
    }
  });
  
  // Observe changes to the document title (changes when video changes)
  observer.observe(document.querySelector('title') || document.head, {
    subtree: true,
    characterData: true,
    childList: true
  });
  
  // Also observe body for major DOM changes
  observer.observe(document.body, {
    childList: true,
    subtree: false
  });
  
  debugLog('URL observer initialized');
}

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog('Message received from extension:', message.type);
  
  switch (message.type) {
    case 'GET_VIDEO_METADATA':
      const metadata = getVideoMetadata();
      sendResponse({ success: !!metadata, data: metadata });
      break;
      
    case 'PING':
      sendResponse({ success: true, ready: true });
      break;
      
    case 'SEEK_TO_TIMESTAMP':
      const seconds = message.data;
      const success = seekVideo(seconds);
      sendResponse({ success });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  return false;
});

/**
 * Seek video to specified time
 * @param {number} seconds - Time to seek to in seconds
 * @returns {boolean} - Whether seek was successful
 */
function seekVideo(seconds) {
  const video = document.querySelector('video');
  
  if (video) {
    video.currentTime = seconds;
    video.play().catch(() => {}); // Ensure video plays
    debugLog(`Seeked to ${seconds}s`);
    return true;
  }
  
  debugLog('Video element not found for seeking');
  return false;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the content script
 */
function init() {
  debugLog('Content script initializing...');
  
  // Initial video check
  checkForVideoChange();
  
  // Set up URL change observer
  initUrlObserver();
  
  // Send initial metadata after page is fully loaded
  if (document.readyState === 'complete') {
    sendVideoMetadata();
  } else {
    window.addEventListener('load', () => {
      setTimeout(sendVideoMetadata, 1500);
    });
  }
  
  debugLog('Content script initialized');
}

// Run initialization
init();
