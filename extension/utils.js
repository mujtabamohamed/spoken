/**
 * Utility Functions for YouTube Transcriber Extension
 * 
 * Provides:
 * - URL parsing and validation
 * - Time formatting utilities
 * - File operations
 * - Text formatting
 * - Clipboard operations
 * - Download functionality
 */

// =============================================================================
// URL UTILITIES
// =============================================================================

/**
 * Extract video ID from various YouTube URL formats
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null
 */
function extractVideoIdFromUrl(url) {
  if (!url) return null;
  
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Build YouTube video URL from video ID
 * @param {string} videoId - Video ID
 * @returns {string} - Full YouTube URL
 */
function buildYouTubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Get YouTube thumbnail URL for a video
 * @param {string} videoId - Video ID
 * @param {string} [quality='maxresdefault'] - Quality: default, mqdefault, hqdefault, sddefault, maxresdefault
 * @returns {string} - Thumbnail URL
 */
function getThumbnailUrl(videoId, quality = 'maxresdefault') {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Check if URL is a valid YouTube video URL
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isValidYouTubeUrl(url) {
  return extractVideoIdFromUrl(url) !== null;
}

// =============================================================================
// TIME UTILITIES
// =============================================================================

/**
 * Format seconds to HH:MM:SS or MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted time string
 */
function formatTime(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds)) {
    return '0:00';
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse time string to seconds
 * @param {string} timeStr - Time string (e.g., "1:23:45" or "12:34")
 * @returns {number} - Seconds
 */
function parseTime(timeStr) {
  if (!timeStr) return 0;
  
  const parts = timeStr.split(':').map(Number);
  
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  
  return 0;
}

/**
 * Format timestamp for display
 * @param {Date|number} timestamp - Date object or Unix timestamp
 * @returns {string} - Formatted date string
 */
function formatTimestamp(timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get relative time string (e.g., "2 hours ago")
 * @param {Date|number} timestamp - Date object or Unix timestamp
 * @returns {string} - Relative time string
 */
function getRelativeTime(timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return formatTimestamp(date);
}

// =============================================================================
// TEXT UTILITIES
// =============================================================================

/**
 * Count words in text
 * @param {string} text - Text to count
 * @returns {number} - Word count
 */
function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Count characters in text
 * @param {string} text - Text to count
 * @param {boolean} [includeSpaces=true] - Include spaces in count
 * @returns {number} - Character count
 */
function countCharacters(text, includeSpaces = true) {
  if (!text) return 0;
  return includeSpaces ? text.length : text.replace(/\s/g, '').length;
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Escape HTML characters
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Highlight search term in text
 * @param {string} text - Text to search in
 * @param {string} searchTerm - Term to highlight
 * @param {string} [highlightClass='highlight'] - CSS class for highlight
 * @returns {string} - HTML with highlighted terms
 */
function highlightSearchTerm(text, searchTerm, highlightClass = 'highlight') {
  if (!text || !searchTerm) return escapeHtml(text);
  
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedTerm})`, 'gi');
  
  return escapeHtml(text).replace(regex, `<mark class="${highlightClass}">$1</mark>`);
}

// =============================================================================
// FILE UTILITIES
// =============================================================================

/**
 * Format file size to human readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size string
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get file extension from filename
 * @param {string} filename - Filename
 * @returns {string} - Extension (lowercase)
 */
function getFileExtension(filename) {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * Create a download for text content
 * @param {string} content - Content to download
 * @param {string} filename - Filename for download
 * @param {string} [mimeType='text/plain'] - MIME type
 */
function downloadText(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Download transcription as TXT file
 * @param {string} text - Transcription text
 * @param {string} videoTitle - Video title for filename
 */
function downloadAsTxt(text, videoTitle) {
  const safeTitle = sanitizeFilename(videoTitle || 'transcription');
  downloadText(text, `${safeTitle}.txt`, 'text/plain');
}

/**
 * Download transcription as SRT file
 * @param {string} srtContent - SRT formatted content
 * @param {string} videoTitle - Video title for filename
 */
function downloadAsSrt(srtContent, videoTitle) {
  const safeTitle = sanitizeFilename(videoTitle || 'transcription');
  downloadText(srtContent, `${safeTitle}.srt`, 'text/plain');
}

/**
 * Download transcription as VTT file
 * @param {string} vttContent - VTT formatted content
 * @param {string} videoTitle - Video title for filename
 */
function downloadAsVtt(vttContent, videoTitle) {
  const safeTitle = sanitizeFilename(videoTitle || 'transcription');
  downloadText(vttContent, `${safeTitle}.vtt`, 'text/vtt');
}

/**
 * Sanitize filename for safe file saving
 * @param {string} filename - Filename to sanitize
 * @returns {string} - Safe filename
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

// =============================================================================
// CLIPBOARD UTILITIES
// =============================================================================

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - Success status
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback for older browsers
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (fallbackError) {
      console.error('Failed to copy to clipboard:', fallbackError);
      return false;
    }
  }
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize user input
 * @param {string} input - Input to sanitize
 * @returns {string} - Sanitized input
 */
function sanitizeInput(input) {
  if (!input) return '';
  return input.trim().replace(/<[^>]*>/g, '');
}

// =============================================================================
// DEBOUNCE & THROTTLE
// =============================================================================

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} - Throttled function
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// =============================================================================
// STORAGE HELPERS
// =============================================================================

/**
 * Get item from chrome.storage.local with default
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found
 * @returns {Promise<*>} - Storage value
 */
async function getStorageItem(key, defaultValue = null) {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] !== undefined ? result[key] : defaultValue;
  } catch (error) {
    console.error('Error getting storage item:', error);
    return defaultValue;
  }
}

/**
 * Set item in chrome.storage.local
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {Promise<boolean>} - Success status
 */
async function setStorageItem(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    return true;
  } catch (error) {
    console.error('Error setting storage item:', error);
    return false;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// Make utilities available globally
window.Utils = {
  // URL
  extractVideoIdFromUrl,
  buildYouTubeUrl,
  getThumbnailUrl,
  isValidYouTubeUrl,
  
  // Time
  formatTime,
  parseTime,
  formatTimestamp,
  getRelativeTime,
  
  // Text
  countWords,
  countCharacters,
  truncateText,
  escapeHtml,
  highlightSearchTerm,
  
  // File
  formatFileSize,
  getFileExtension,
  downloadText,
  downloadAsTxt,
  downloadAsSrt,
  downloadAsVtt,
  sanitizeFilename,
  
  // Clipboard
  copyToClipboard,
  
  // Validation
  isValidEmail,
  sanitizeInput,
  
  // Debounce/Throttle
  debounce,
  throttle,
  
  // Storage
  getStorageItem,
  setStorageItem
};
