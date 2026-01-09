/**
 * Side Panel JavaScript for YouTube Transcriber Extension
 * 
 * Handles:
 * - UI state management
 * - Video detection and display
 * - Transcription workflow
 * - Settings management
 * - User interactions
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const DEBUG = true;
const BACKEND_URL = 'http://localhost:3456'; // Backend server for YouTube audio extraction

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

const state = {
  currentVideo: null,
  transcription: null,
  isTranscribing: false,
  serverAvailable: false,
  settings: {
    transcriptionMode: 'local', // 'local' or 'api'
    provider: 'openai', // 'openai' or 'deepgram'
    // apiKey: '', // Deprecated, use apiKeys object
    apiKeys: {
      openai: '',
      deepgram: ''
    },
    language: 'auto',
    showTimestamps: true
  },
  uploadedFile: null
};

// =============================================================================
// DOM ELEMENTS
// =============================================================================

const elements = {
  // Settings
  settingsToggle: document.getElementById('settingsToggle'),
  settingsPanel: document.getElementById('settingsPanel'),
  modeLocal: document.getElementById('modeLocal'),
  modeApi: document.getElementById('modeApi'),
  modeStatus: document.getElementById('modeStatus'),
  apiKeySection: document.getElementById('apiKeySection'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  apiKeyStatus: document.getElementById('apiKeyStatus'),
  apiKeyStatus: document.getElementById('apiKeyStatus'),
  toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
  
  // Provider
  providerSection: document.getElementById('providerSection'),
  providerSelect: document.getElementById('providerSelect'),
  apiKeyLabel: document.getElementById('apiKeyLabel'),
  apiKeyHelpLink: document.getElementById('apiKeyHelpLink'),
  languageSelect: document.getElementById('languageSelect'),
  showTimestamps: document.getElementById('showTimestamps'),
  saveSettings: document.getElementById('saveSettings'),
  clearCache: document.getElementById('clearCache'),
  
  // Video Info
  noVideoMessage: document.getElementById('noVideoMessage'),
  videoInfo: document.getElementById('videoInfo'),
  videoThumbnail: document.getElementById('videoThumbnail'),
  videoDuration: document.getElementById('videoDuration'),
  videoTitle: document.getElementById('videoTitle'),
  videoChannel: document.getElementById('videoChannel'),
  videoUrl: document.getElementById('videoUrl'),
  
  // Status
  statusIndicator: document.getElementById('statusIndicator'),
  statusSpinner: document.getElementById('statusSpinner'),
  statusIconSuccess: document.getElementById('statusIconSuccess'),
  statusIconError: document.getElementById('statusIconError'),
  statusText: document.getElementById('statusText'),
  
  // Actions
  transcribeBtn: document.getElementById('transcribeBtn'),
  audioFileInput: document.getElementById('audioFileInput'),
  selectedFileName: document.getElementById('selectedFileName'),
  costEstimate: document.getElementById('costEstimate'),
  costValue: document.getElementById('costValue'),
  
  // Transcription
  transcriptionSection: document.getElementById('transcriptionSection'),
  transcriptionContent: document.getElementById('transcriptionContent'),
  transcriptionText: document.getElementById('transcriptionText'),
  transcriptionVideoTitle: document.getElementById('transcriptionVideoTitle'),
  transcriptionLanguage: document.getElementById('transcriptionLanguage'),
  transcriptionDuration: document.getElementById('transcriptionDuration'),
  wordCount: document.getElementById('wordCount'),
  charCount: document.getElementById('charCount'),
  transcriptionTime: document.getElementById('transcriptionTime'),
  searchInput: document.getElementById('searchInput'),
  searchResults: document.getElementById('searchResults'),
  clearSearch: document.getElementById('clearSearch'),
  copyBtn: document.getElementById('copyBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  downloadMenu: document.getElementById('downloadMenu'),
  
  // Toast
  toastContainer: document.getElementById('toastContainer')
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Debug logging utility
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
  if (DEBUG) {
    console.log('[YT-Transcriber Panel]', ...args);
  }
}

/**
 * Get active tab ID safely
 */
async function getActiveTabId() {
  try {
    // Try lastFocusedWindow first (better for Side Panel)
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs[0]?.id) return tabs[0].id;
    
    // Fallback to currentWindow
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id;
  } catch (error) {
    debugLog('Error getting active tab:', error);
    return null;
  }
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type: 'success', 'error', 'info', 'warning'
 * @param {number} duration - Duration in ms
 */
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>'
  };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Close">×</button>
  `;
  
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  });
  
  elements.toastContainer.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-enter');
  });
  
  // Auto remove
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

// =============================================================================
// SETTINGS MANAGEMENT
// =============================================================================

/**
 * Set transcription mode (local or api)
 */
function setTranscriptionMode(mode) {
  state.settings.transcriptionMode = mode;
  
  // Update UI
  elements.modeLocal.classList.toggle('active', mode === 'local');
  elements.modeApi.classList.toggle('active', mode === 'api');
  
  if (mode === 'local') {
    elements.modeStatus.textContent = '✓ Local mode - No API key needed';
    elements.modeStatus.className = 'setting-status status-success';
    elements.apiKeySection.classList.add('hidden');
    if (elements.providerSection) elements.providerSection.classList.add('hidden');
  } else {
    elements.modeStatus.textContent = '☁️ API mode - Requires API key';
    elements.modeStatus.className = 'setting-status status-warning';
    elements.apiKeySection.classList.remove('hidden');
    if (elements.providerSection) elements.providerSection.classList.remove('hidden');
    
    handleProviderChange(state.settings.provider || 'openai');
  }
  
  updateTranscribeButton();
  debugLog('Transcription mode set to:', mode);
}

/**
 * Handle AI Provider Change
 */
function handleProviderChange(provider) {
  if (!['openai', 'deepgram'].includes(provider)) provider = 'openai';
  
  state.settings.provider = provider;
  if (elements.providerSelect) elements.providerSelect.value = provider;
  
  // Update labels
  if (provider === 'deepgram') {
    if (elements.apiKeyLabel) elements.apiKeyLabel.textContent = 'Deepgram API Key';
    if (elements.apiKeyHelpLink) elements.apiKeyHelpLink.href = 'https://console.deepgram.com/';
  } else {
    if (elements.apiKeyLabel) elements.apiKeyLabel.textContent = 'OpenAI API Key';
    if (elements.apiKeyHelpLink) elements.apiKeyHelpLink.href = 'https://platform.openai.com/api-keys';
  }
  
  // Switch input value to the stored key for this provider
  if (!state.settings.apiKeys) state.settings.apiKeys = { openai: '', deepgram: '' };
  
  const key = state.settings.apiKeys[provider] || '';
  if (elements.apiKeyInput) elements.apiKeyInput.value = key;
  
  updateApiKeyStatus(!!key);
  updateTranscribeButton();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    
    if (response.success && response.data) {
      state.settings = { ...state.settings, ...response.data };
    }
    
    // Initialize apiKeys if missing (migration)
    if (!state.settings.apiKeys) {
      const apiResponse = await chrome.runtime.sendMessage({ type: 'GET_API_KEY' });
      const oldKey = (apiResponse.success && apiResponse.data) ? apiResponse.data : '';
      state.settings.apiKeys = {
        openai: oldKey,
        deepgram: ''
      };
    }
      
    // Update UI
    if (elements.languageSelect) elements.languageSelect.value = state.settings.language || 'auto';
    if (elements.showTimestamps) elements.showTimestamps.checked = state.settings.showTimestamps !== false;
    
    // Provider UI
    if (state.settings.provider) {
       handleProviderChange(state.settings.provider);
    } else {
       handleProviderChange('openai');
    }
    
    // Set transcription mode UI
    setTranscriptionMode(state.settings.transcriptionMode || 'local');
    
    debugLog('Settings loaded:', state.settings);
  } catch (error) {
    debugLog('Error loading settings:', error);
    setTranscriptionMode('local'); // Default to local on error
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    const currentKey = elements.apiKeyInput.value.trim();
    const language = elements.languageSelect.value;
    const showTimestamps = elements.showTimestamps.checked;
    const transcriptionMode = state.settings.transcriptionMode;
    const provider = state.settings.provider || 'openai';
    
    // Update state apiKeys
    if (!state.settings.apiKeys) state.settings.apiKeys = {};
    state.settings.apiKeys[provider] = currentKey;
    
    // Save settings (including keys)
    await chrome.runtime.sendMessage({
      type: 'SET_SETTINGS',
      data: { 
        language, 
        showTimestamps, 
        transcriptionMode,
        provider,
        apiKeys: state.settings.apiKeys
      }
    });
    
    // Also save legacy key if OpenAI
    if (provider === 'openai') {
       await chrome.runtime.sendMessage({ type: 'SET_API_KEY', data: currentKey });
    }
    
    state.settings = { 
        ...state.settings, 
        language, 
        showTimestamps, 
        transcriptionMode,
        provider // apiKeys already updated in object reference above
    };
    
    updateApiKeyStatus(!!currentKey);
    
    showToast('Settings saved successfully', 'success');
    debugLog('Settings saved');
    updateTranscribeButton();
  } catch (error) {
    debugLog('Error saving settings:', error);
    showToast('Failed to save settings', 'error');
  }
}

/**
 * Update API key status indicator
 */
function updateApiKeyStatus(hasKey) {
  if (hasKey) {
    elements.apiKeyStatus.textContent = '✓ API key configured';
    elements.apiKeyStatus.className = 'setting-status status-success';
  } else {
    elements.apiKeyStatus.innerHTML = '⚠ API key required. <a href="https://platform.openai.com/api-keys" target="_blank">Get one here</a>';
    elements.apiKeyStatus.className = 'setting-status status-warning';
  }
}

/**
 * Toggle settings panel visibility
 */
function toggleSettings() {
  elements.settingsPanel.classList.toggle('hidden');
  elements.settingsToggle.classList.toggle('active');
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
  const isPassword = elements.apiKeyInput.type === 'password';
  elements.apiKeyInput.type = isPassword ? 'text' : 'password';
  
  const eyeIcon = document.getElementById('eyeIcon');
  if (isPassword) {
    eyeIcon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';
  } else {
    eyeIcon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
  }
}

/**
 * Clear transcription cache
 */
async function clearCache() {
  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    showToast('Cache cleared successfully', 'success');
  } catch (error) {
    debugLog('Error clearing cache:', error);
    showToast('Failed to clear cache', 'error');
  }
}

// =============================================================================
// VIDEO DETECTION
// =============================================================================

/**
 * Update UI with video information
 */
function updateVideoInfo(videoData) {
  if (!videoData) {
    elements.noVideoMessage.classList.remove('hidden');
    elements.videoInfo.classList.add('hidden');
    elements.transcribeBtn.disabled = true;
    state.currentVideo = null;
    return;
  }
  
  state.currentVideo = videoData;
  
  elements.noVideoMessage.classList.add('hidden');
  elements.videoInfo.classList.remove('hidden');
  
  // Update thumbnail
  elements.videoThumbnail.src = window.Utils.getThumbnailUrl(videoData.videoId, 'hqdefault');
  elements.videoThumbnail.onerror = () => {
    elements.videoThumbnail.src = window.Utils.getThumbnailUrl(videoData.videoId, 'default');
  };
  
  // Update video details
  elements.videoTitle.textContent = videoData.title || 'Loading...';
  elements.videoChannel.textContent = videoData.channelName || '';
  elements.videoUrl.textContent = window.Utils.truncateText(videoData.url, 50);
  elements.videoUrl.title = videoData.url;
  
  // Update duration
  if (videoData.duration) {
    elements.videoDuration.textContent = videoData.duration;
    elements.videoDuration.classList.remove('hidden');
  } else {
    elements.videoDuration.classList.add('hidden');
  }
  
  // Show warnings for special video types
  if (videoData.isLive) {
    showToast('Live streams may have dynamic content', 'warning');
  }
  if (videoData.isPremiere) {
    showToast('Premiere video - content may not be available yet', 'warning');
  }
  
  // Enable transcribe button if we have an API key
  updateTranscribeButton();
  
  // Check for cached transcription
  checkCachedTranscription(videoData.videoId);
  
  debugLog('Video info updated:', videoData);
}

/**
 * Check if we have a cached transcription for this video
 */
async function checkCachedTranscription(videoId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CACHED_TRANSCRIPTION',
      data: videoId
    });
    
    if (response.success && response.data) {
      debugLog('Found cached transcription for:', videoId);
      state.transcription = response.data;
      displayTranscription(response.data);
      showStatus('Cached transcription loaded', 'success');
    }
  } catch (error) {
    debugLog('Error checking cache:', error);
  }
}

/**
 * Request current video info from background
 */
async function requestCurrentVideo() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_VIDEO' });
    
    if (response.success && response.data) {
      // Also request metadata from content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.id) {
        try {
          const metadataResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_METADATA' });
          
          if (metadataResponse.success && metadataResponse.data) {
            updateVideoInfo(metadataResponse.data);
            return;
          }
        } catch (e) {
          // Content script might not be loaded
          debugLog('Could not get metadata from content script');
        }
      }
      
      updateVideoInfo(response.data);
    } else {
      updateVideoInfo(null);
    }
  } catch (error) {
    debugLog('Error getting current video:', error);
    updateVideoInfo(null);
  }
}

/**
 * Update transcribe button state
 */
/**
 * Get current API key based on provider
 */
function getCurrentApiKey() {
  const provider = state.settings.provider || 'openai';
  if (state.settings.apiKeys && state.settings.apiKeys[provider]) {
    return state.settings.apiKeys[provider];
  }
  // Fallback
  return state.settings.apiKey || '';
}

/**
 * Update transcribe button state
 */
function updateTranscribeButton() {
  const isLocalMode = state.settings.transcriptionMode === 'local';
  const hasApiKey = !!getCurrentApiKey();
  const hasVideo = !!state.currentVideo || !!state.uploadedFile;
  const isTranscribing = state.isTranscribing;
  
  // In local mode, don't need API key. In API mode, need API key.
  const canTranscribe = isLocalMode ? hasVideo : (hasApiKey && hasVideo);
  
  elements.transcribeBtn.disabled = !canTranscribe || isTranscribing;
  
  if (!isLocalMode && !hasApiKey) {
    elements.transcribeBtn.title = 'Add your API key in settings or switch to Local mode';
  } else if (!hasVideo) {
    elements.transcribeBtn.title = 'Navigate to a YouTube video or upload an audio file';
  } else if (isTranscribing) {
    elements.transcribeBtn.title = 'Transcription in progress...';
  } else {
    elements.transcribeBtn.title = 'Start transcription (T)';
  }
}

// =============================================================================
// STATUS MANAGEMENT
// =============================================================================

/**
 * Show status indicator
 * @param {string} message - Status message
 * @param {string} type - Type: 'loading', 'success', 'error'
 */
function showStatus(message, type = 'loading') {
  elements.statusIndicator.classList.remove('hidden');
  elements.statusText.textContent = message;
  
  // Reset icons
  elements.statusSpinner.classList.add('hidden');
  elements.statusIconSuccess.classList.add('hidden');
  elements.statusIconError.classList.add('hidden');
  
  switch (type) {
    case 'loading':
      elements.statusSpinner.classList.remove('hidden');
      elements.statusIndicator.className = 'status-indicator status-loading';
      break;
    case 'success':
      elements.statusIconSuccess.classList.remove('hidden');
      elements.statusIndicator.className = 'status-indicator status-complete';
      break;
    case 'error':
      elements.statusIconError.classList.remove('hidden');
      elements.statusIndicator.className = 'status-indicator status-error';
      break;
  }
}

/**
 * Hide status indicator
 */
function hideStatus() {
  elements.statusIndicator.classList.add('hidden');
}

// =============================================================================
// TRANSCRIPTION
// =============================================================================

/**
 * Check if backend server is available
 * @returns {Promise<boolean>}
 */
async function checkServerAvailable() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    const data = await response.json();
    state.serverAvailable = data.status === 'ok';
    return state.serverAvailable;
  } catch (error) {
    debugLog('Backend server not available:', error.message);
    state.serverAvailable = false;
    return false;
  }
}

/**
 * Transcribe YouTube video using backend server
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Transcription result
 */
async function transcribeViaBackend(url) {
  showStatus('Connecting to transcription server...', 'loading');
  
  try {
    const response = await fetch(`${BACKEND_URL}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': state.settings.apiKeys ? (state.settings.apiKeys[state.settings.provider || 'openai'] || '') : (state.settings.apiKey || ''),
        'X-Provider': state.settings.provider || 'openai',
        'X-Mode': state.settings.transcriptionMode || 'local'
      },
      body: JSON.stringify({
        url,
        language: state.settings.language === 'auto' ? null : state.settings.language
      })
    });
    
    if (!response.ok) {
      // Handle non-200 responses
      const error = await response.json().catch(() => ({ error: `Server HTTP error: ${response.status}` }));
      throw new Error(error.error || `Server error: ${response.status}`);
    }
    
    // Process SSE Stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // Keep incomplete chunk
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.status === 'info') {
              showStatus(data.message, 'loading');
            } else if (data.status === 'complete') {
              finalResult = data.data;
            } else if (data.status === 'error') {
              throw new Error(data.error);
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
               // Buffer issue or invalid JSON
               debugLog('SSE Parse Error:', e);
            } else {
               // Business logic error (e.g. status=error)
               throw e;
            }
          }
        }
      }
    }
    
    if (!finalResult) {
       throw new Error('Stream ended without completion data');
    }
    
    return {
      success: true,
      ...finalResult
    };

  } catch (error) {
    debugLog('Transcription error:', error);
    throw error;
  }
}

/**
 * Start transcription process
 */
async function startTranscription() {
  if (state.isTranscribing) return;
  
  const isLocalMode = state.settings.transcriptionMode === 'local';
  const apiKey = getCurrentApiKey();
  
  // Validate we have what we need
  if (!isLocalMode && !apiKey) {
    showToast('Please add your API key in settings or switch to Local mode', 'error');
    toggleSettings();
    return;
  }
  
  if (!state.uploadedFile && !state.currentVideo) {
    showToast('No video or audio file selected', 'error');
    return;
  }
  
  state.isTranscribing = true;
  updateTranscribeButton();
  
  try {
    let result;
    
    if (state.uploadedFile) {
      // Transcribe uploaded audio file directly via Whisper API
      showStatus('Preparing audio file...', 'loading');
      
      result = await window.WhisperAPI.transcribeAudio({
        audioFile: state.uploadedFile,
        apiKey: apiKey,
        language: state.settings.language,
        responseFormat: 'verbose_json',
        onProgress: (progress) => {
          showStatus(progress.message, 'loading');
        }
      });
    } else if (state.currentVideo) {
      // Use backend server for YouTube video transcription
      showStatus('Checking transcription server...', 'loading');
      
      const serverAvailable = await checkServerAvailable();
      
      if (!serverAvailable) {
        showStatus('Backend server not running', 'error');
        showToast(
          'Start the backend server with: cd server && npm start',
          'warning',
          8000
        );
        state.isTranscribing = false;
        updateTranscribeButton();
        return;
      }
      
      showStatus('Downloading audio from YouTube...', 'loading');
      result = await transcribeViaBackend(state.currentVideo.url);
    }
    
    if (result && result.success) {
      state.transcription = result;
      
      // Update video info from backend response (fixes "Loading..." title issue)
      if (result.title && state.currentVideo) {
        state.currentVideo.title = result.title;
        elements.videoTitle.textContent = result.title;
      }
      if (result.channel && state.currentVideo) {
        state.currentVideo.channelName = result.channel;
        elements.videoChannel.textContent = result.channel;
      }
      
      displayTranscription(result);
      showStatus('Transcription complete!', 'success');
      showToast('Transcription completed successfully', 'success');
      
      // Cache the transcription if it's for a video
      if (state.currentVideo) {
        await chrome.runtime.sendMessage({
          type: 'SET_CACHED_TRANSCRIPTION',
          data: {
            videoId: state.currentVideo.videoId,
            transcription: result
          }
        });
      }
    }
  } catch (error) {
    debugLog('Transcription error:', error);
    showStatus(error.message, 'error');
    showToast(error.message, 'error', 5000);
  } finally {
    state.isTranscribing = false;
    updateTranscribeButton();
  }
}

/**
 * Display transcription results with enhanced formatting
 */
function displayTranscription(transcription) {
  elements.transcriptionSection.classList.remove('hidden');
  
  // Update header info
  const videoTitle = state.currentVideo?.title || transcription.title || 'Audio Transcription';
  elements.transcriptionVideoTitle.textContent = videoTitle;
  
  // Show language badge
  if (transcription.language) {
    const langName = getLanguageName(transcription.language);
    elements.transcriptionLanguage.textContent = langName;
    elements.transcriptionLanguage.style.display = 'inline-block';
  } else {
    elements.transcriptionLanguage.style.display = 'none';
  }
  
  // Show duration
  if (transcription.duration) {
    elements.transcriptionDuration.textContent = formatDuration(transcription.duration);
  } else if (state.currentVideo?.duration) {
    elements.transcriptionDuration.textContent = state.currentVideo.duration;
  } else {
    elements.transcriptionDuration.parentElement.style.display = 'none';
  }
  
  let displayHtml;
  
  if (state.settings.showTimestamps && transcription.segments?.length) {
    // Render segments with styled timestamps
    displayHtml = '<div class="transcription-segments">';
    
    transcription.segments.forEach((segment, index) => {
      const startTime = formatTimestampForDisplay(segment.start);
      const text = window.Utils.escapeHtml(segment.text.trim());
      
      displayHtml += `
        <div class="transcript-segment" data-index="${index}" data-start="${segment.start}">
          <span class="transcript-timestamp">${startTime}</span>
          <span class="transcript-text">${text}</span>
        </div>
      `;
    });
    
    displayHtml += '</div>';
  } else {
    // Render as paragraphs for better readability
    const text = transcription.text;
    const paragraphs = splitIntoParagraphs(text);
    
    displayHtml = '<div class="transcription-plain">';
    paragraphs.forEach(p => {
      displayHtml += `<p>${window.Utils.escapeHtml(p)}</p>`;
    });
    displayHtml += '</div>';
  }
  
  elements.transcriptionText.innerHTML = displayHtml;
  
  // Add click handlers for entire segments
  elements.transcriptionText.querySelectorAll('.transcript-segment').forEach(el => {
    // Add hover title to the segment itself
    el.title = "Click to jump to this timestamp";
    
    el.addEventListener('click', async () => {
      // Get timestamp in seconds from data attribute
      const startSeconds = parseFloat(el.dataset.start);
      
      if (isNaN(startSeconds)) return;
      
      debugLog('Clicked segment at:', startSeconds);
      
      const performSeek = (tid) => {
        return new Promise((resolve, reject) => {
          if (!tid) return reject(new Error('No tab ID'));
          chrome.tabs.sendMessage(tid, { type: 'SEEK_TO_TIMESTAMP', data: startSeconds }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
      };
      
      const doFallback = () => {
        const timestampText = el.querySelector('.transcript-timestamp')?.textContent || 'timestamp';
        window.Utils.copyToClipboard(timestampText);
        showToast(`Couldn't seek. Copied: ${timestampText}`, 'warning');
      };
      
      try {
        let success = false;
        const storedTabId = state.currentVideo?.tabId;
        
        // Attempt 1: Try stored tab ID
        if (storedTabId) {
          try {
            await performSeek(storedTabId);
            success = true;
            debugLog('Seek successful on stored tab:', storedTabId);
          } catch (e) {
            debugLog('Stored tab seek failed:', e.message);
          }
        }
        
        // Attempt 2: Try active tab if attempt 1 failed
        if (!success) {
          const activeTabId = await getActiveTabId();
          if (activeTabId && activeTabId !== storedTabId) {
            try {
              await performSeek(activeTabId);
              success = true;
              debugLog('Seek successful on active tab:', activeTabId);
              
              // Update state to use this working tab
              if (state.currentVideo) state.currentVideo.tabId = activeTabId;
            } catch (e) {
              debugLog('Active tab seek failed:', e.message);
            }
          }
        }
        
        if (!success) {
          throw new Error('All seek attempts failed');
        }
        
      } catch (error) {
        debugLog('Seek error:', error);
        doFallback();
      }
    });
  });
  
  // Update stats
  const words = window.Utils.countWords(transcription.text);
  const chars = window.Utils.countCharacters(transcription.text);
  
  elements.wordCount.textContent = `${words.toLocaleString()} words`;
  elements.charCount.textContent = `${chars.toLocaleString()} chars`;
  
  // Remove Date display as requested
  if (elements.transcriptionTime) {
    elements.transcriptionTime.parentElement.style.display = 'none';
  }
  
  // Scroll to transcription
  elements.transcriptionSection.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Get readable language name from code
 */
function getLanguageName(code) {
  const languages = {
    'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
    'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'zh': 'Chinese',
    'ja': 'Japanese', 'ko': 'Korean', 'ar': 'Arabic', 'hi': 'Hindi',
    'nl': 'Dutch', 'pl': 'Polish', 'tr': 'Turkish', 'vi': 'Vietnamese',
    'th': 'Thai', 'id': 'Indonesian', 'sv': 'Swedish', 'da': 'Danish'
  };
  return languages[code] || code.toUpperCase();
}

/**
 * Format duration in seconds to readable string
 */
function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  } else if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format date for transcription display
 */
function formatTranscriptionDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format seconds to MM:SS or HH:MM:SS timestamp
 */
function formatTimestampForDisplay(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Split text into readable paragraphs
 */
function splitIntoParagraphs(text) {
  // Split at sentence boundaries where we have 2+ sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const paragraphs = [];
  let currentParagraph = '';
  
  sentences.forEach((sentence, i) => {
    currentParagraph += sentence.trim() + ' ';
    
    // Create paragraph every 3-5 sentences or at natural breaks
    if ((i + 1) % 4 === 0 || i === sentences.length - 1) {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
      }
      currentParagraph = '';
    }
  });
  
  if (currentParagraph.trim()) {
    paragraphs.push(currentParagraph.trim());
  }
  
  return paragraphs.length > 0 ? paragraphs : [text];
}

/**
 * Handle search within transcription
 */
function handleSearch() {
  const searchTerm = elements.searchInput.value.trim();
  
  // Toggle clear button visibility
  if (elements.clearSearch) {
    elements.clearSearch.classList.toggle('hidden', !searchTerm);
  }
  
  if (!searchTerm || !state.transcription) {
    // Re-render without highlighting
    if (state.transcription) {
      displayTranscription(state.transcription);
    }
    elements.searchResults.textContent = '';
    return;
  }
  
  // Count matches in the full text
  const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches = state.transcription.text.match(regex);
  const count = matches ? matches.length : 0;
  
  elements.searchResults.textContent = count > 0 ? `${count} match${count !== 1 ? 'es' : ''} found` : 'No matches';
  
  // Re-render with search highlighting
  if (state.settings.showTimestamps && state.transcription.segments?.length) {
    let displayHtml = '<div class="transcription-segments">';
    
    state.transcription.segments.forEach((segment, index) => {
      const startTime = formatTimestampForDisplay(segment.start);
      const text = window.Utils.highlightSearchTerm(segment.text.trim(), searchTerm);
      
      displayHtml += `
        <div class="transcript-segment" data-index="${index}" data-start="${segment.start}">
          <span class="transcript-timestamp" title="Click to copy timestamp">${startTime}</span>
          <span class="transcript-text">${text}</span>
        </div>
      `;
    });
    
    displayHtml += '</div>';
    elements.transcriptionText.innerHTML = displayHtml;
  } else {
    const paragraphs = splitIntoParagraphs(state.transcription.text);
    
    let displayHtml = '<div class="transcription-plain">';
    paragraphs.forEach(p => {
      displayHtml += `<p>${window.Utils.highlightSearchTerm(p, searchTerm)}</p>`;
    });
    displayHtml += '</div>';
    
    elements.transcriptionText.innerHTML = displayHtml;
  }
}

/**
 * Copy transcription to clipboard
 */
async function copyTranscription() {
  if (!state.transcription) return;
  
  const text = state.settings.showTimestamps && state.transcription.segments?.length
    ? window.WhisperAPI.formatTranscriptionWithTimestamps(state.transcription)
    : state.transcription.text;
  
  const success = await window.Utils.copyToClipboard(text);
  
  if (success) {
    showToast('Copied to clipboard', 'success');
  } else {
    showToast('Failed to copy', 'error');
  }
}

/**
 * Download transcription in specified format
 */
function downloadTranscription(format) {
  if (!state.transcription) return;
  
  const title = state.currentVideo?.title || 'transcription';
  
  switch (format) {
    case 'txt':
      const txtContent = state.settings.showTimestamps && state.transcription.segments?.length
        ? window.WhisperAPI.formatTranscriptionWithTimestamps(state.transcription)
        : state.transcription.text;
      window.Utils.downloadAsTxt(txtContent, title);
      break;
      
    case 'srt':
      const srtContent = window.WhisperAPI.toSRT(state.transcription);
      if (srtContent) {
        window.Utils.downloadAsSrt(srtContent, title);
      } else {
        showToast('No timestamp data available for SRT export', 'warning');
      }
      break;
      
    case 'vtt':
      const vttContent = window.WhisperAPI.toVTT(state.transcription);
      window.Utils.downloadAsVtt(vttContent, title);
      break;
  }
  
  showToast(`Downloaded as ${format.toUpperCase()}`, 'success');
  closeDropdown();
}

// =============================================================================
// FILE UPLOAD
// =============================================================================

/**
 * Handle audio file selection
 */
function handleFileSelect(event) {
  const file = event.target.files[0];
  
  if (!file) {
    state.uploadedFile = null;
    elements.selectedFileName.textContent = '';
    updateTranscribeButton();
    return;
  }
  
  try {
    window.WhisperAPI.validateAudioFile(file);
    state.uploadedFile = file;
    elements.selectedFileName.textContent = `${file.name} (${window.Utils.formatFileSize(file.size)})`;
    
    // Show cost estimate
    // For uploaded files, we estimate based on file size (rough approximation)
    // Actual duration would require decoding the audio
    const estimatedMinutes = Math.ceil(file.size / (128 * 1024 / 8 * 60)); // Rough estimate for 128kbps
    const cost = window.WhisperAPI.estimateCost(estimatedMinutes * 60);
    elements.costEstimate.classList.remove('hidden');
    elements.costValue.textContent = cost.formattedCost;
    
    updateTranscribeButton();
    showToast('Audio file selected', 'info');
  } catch (error) {
    showToast(error.message, 'error');
    elements.selectedFileName.textContent = '';
    event.target.value = '';
  }
}

// =============================================================================
// DROPDOWN MANAGEMENT
// =============================================================================

/**
 * Toggle download dropdown
 */
function toggleDropdown() {
  elements.downloadMenu.classList.toggle('show');
}

/**
 * Close dropdown
 */
function closeDropdown() {
  elements.downloadMenu.classList.remove('show');
}

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================

/**
 * Handle keyboard shortcuts
 */
function handleKeyboardShortcuts(event) {
  // Ignore if typing in an input
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    if (event.key === 'Escape') {
      event.target.blur();
    }
    return;
  }
  
  switch (event.key.toLowerCase()) {
    case 't':
      if (!elements.transcribeBtn.disabled) {
        startTranscription();
      }
      break;
      
    case 'c':
      if (state.transcription) {
        copyTranscription();
      }
      break;
      
    case 'f':
      event.preventDefault();
      elements.searchInput.focus();
      break;
      
    case 'escape':
      if (!elements.settingsPanel.classList.contains('hidden')) {
        toggleSettings();
      }
      closeDropdown();
      break;
  }
}

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

/**
 * Handle messages from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog('Message received:', message.type);
  
  switch (message.type) {
    case 'VIDEO_DETECTED':
      updateVideoInfo(message.data);
      break;
      
    case 'NO_VIDEO':
      updateVideoInfo(null);
      break;
      
    case 'VIDEO_METADATA_UPDATE':
      updateVideoInfo(message.data);
      break;
  }
  
  sendResponse({ received: true });
  return false;
});

// =============================================================================
// EVENT LISTENERS
// =============================================================================

function initEventListeners() {
  // Settings
  elements.settingsToggle.addEventListener('click', toggleSettings);
  elements.toggleApiKeyVisibility.addEventListener('click', toggleApiKeyVisibility);
  elements.saveSettings.addEventListener('click', saveSettings);
  elements.clearCache.addEventListener('click', clearCache);
  
  // Mode toggle
  elements.modeLocal.addEventListener('click', () => setTranscriptionMode('local'));
  elements.modeApi.addEventListener('click', () => setTranscriptionMode('api'));
  
  // Provider toggle
  if (elements.providerSelect) {
    elements.providerSelect.addEventListener('change', (e) => handleProviderChange(e.target.value));
  }
  
  // Search
  elements.clearSearch.addEventListener('click', clearSearch);
  
  // Transcription
  elements.transcribeBtn.addEventListener('click', startTranscription);
  elements.audioFileInput.addEventListener('change', handleFileSelect);
  
  // Search
  elements.searchInput.addEventListener('input', window.Utils.debounce(handleSearch, 300));
  
  // Copy/Download
  elements.copyBtn.addEventListener('click', copyTranscription);
  elements.downloadBtn.addEventListener('click', toggleDropdown);
  
  // Download format buttons
  elements.downloadMenu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      downloadTranscription(item.dataset.format);
    });
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.dropdown')) {
      closeDropdown();
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);
  
  // Close settings with Escape
  elements.settingsPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleSettings();
    }
  });
}

// =============================================================================
// INITIALIZATION
// =============================================================================

async function init() {
  debugLog('Initializing side panel...');
  
  // Initialize event listeners
  initEventListeners();
  
  // Load settings
  await loadSettings();
  
  // Request current video info
  await requestCurrentVideo();
  
  // Update button state
  updateTranscribeButton();
  
  debugLog('Side panel initialized');
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
