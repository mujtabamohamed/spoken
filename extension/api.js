/**
 * API Integration Module for YouTube Transcriber Extension
 * 
 * Handles:
 * - OpenAI Whisper API communication
 * - Audio file processing and validation
 * - Retry logic with exponential backoff
 * - Error handling and response formatting
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB limit for Whisper API
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

// Supported audio formats
const SUPPORTED_FORMATS = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg'];

// Supported languages for Whisper
const SUPPORTED_LANGUAGES = {
  'auto': 'Auto-detect',
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'nl': 'Dutch',
  'pl': 'Polish',
  'ru': 'Russian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'tr': 'Turkish',
  'vi': 'Vietnamese',
  'th': 'Thai',
  'id': 'Indonesian',
  'uk': 'Ukrainian',
  'cs': 'Czech',
  'ro': 'Romanian',
  'sv': 'Swedish',
  'da': 'Danish',
  'fi': 'Finnish',
  'no': 'Norwegian',
  'hu': 'Hungarian',
  'el': 'Greek',
  'he': 'Hebrew'
};

// =============================================================================
// ERROR CLASSES
// =============================================================================

/**
 * Custom error class for API-related errors
 */
class WhisperAPIError extends Error {
  constructor(message, code, retryable = false, details = null) {
    super(message);
    this.name = 'WhisperAPIError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get file extension from filename or MIME type
 * @param {File|Blob} file - The file to check
 * @returns {string} - File extension
 */
function getFileExtension(file) {
  if (file.name) {
    const parts = file.name.split('.');
    if (parts.length > 1) {
      return parts.pop().toLowerCase();
    }
  }
  
  // Fallback to MIME type
  const mimeToExt = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/webm': 'webm'
  };
  
  return mimeToExt[file.type] || 'mp3';
}

/**
 * Validate audio file before sending to API
 * @param {File|Blob} file - The audio file to validate
 * @throws {WhisperAPIError} - If validation fails
 */
function validateAudioFile(file) {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new WhisperAPIError(
      `File size exceeds 25MB limit (${(file.size / (1024 * 1024)).toFixed(2)}MB). Please use a shorter audio file.`,
      'FILE_TOO_LARGE',
      false
    );
  }
  
  if (file.size === 0) {
    throw new WhisperAPIError(
      'Audio file is empty. Please provide a valid audio file.',
      'EMPTY_FILE',
      false
    );
  }
  
  // Check file format
  const extension = getFileExtension(file);
  if (!SUPPORTED_FORMATS.includes(extension)) {
    throw new WhisperAPIError(
      `Unsupported file format: ${extension}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
      'UNSUPPORTED_FORMAT',
      false
    );
  }
}

/**
 * Format duration from seconds to HH:MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Transcribe audio file using OpenAI Whisper API
 * 
 * @param {Object} options - Transcription options
 * @param {File|Blob} options.audioFile - The audio file to transcribe
 * @param {string} options.apiKey - OpenAI API key
 * @param {string} [options.language='auto'] - Language code or 'auto' for detection
 * @param {string} [options.responseFormat='verbose_json'] - Response format
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<Object>} - Transcription result
 */
async function transcribeAudio({
  audioFile,
  apiKey,
  language = 'auto',
  responseFormat = 'verbose_json',
  onProgress = () => {}
}) {
  // Validate inputs
  if (!audioFile) {
    throw new WhisperAPIError('No audio file provided', 'NO_FILE', false);
  }
  
  if (!apiKey) {
    throw new WhisperAPIError(
      'API key is required. Please add your OpenAI API key in the settings.',
      'NO_API_KEY',
      false
    );
  }
  
  // Validate the audio file
  validateAudioFile(audioFile);
  
  onProgress({ status: 'preparing', message: 'Preparing audio file...' });
  
  // Build FormData
  const formData = new FormData();
  
  // Ensure file has a proper name
  const fileName = audioFile.name || `audio.${getFileExtension(audioFile)}`;
  formData.append('file', audioFile, fileName);
  formData.append('model', 'whisper-1');
  formData.append('response_format', responseFormat);
  
  // Add language if specified (not 'auto')
  if (language && language !== 'auto') {
    formData.append('language', language);
  }
  
  // Add temperature for more reliable transcription
  formData.append('temperature', '0');
  
  onProgress({ status: 'uploading', message: 'Sending to Whisper API...' });
  
  // Make API request with retry logic
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(WHISPER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });
      
      // Handle different response statuses
      if (response.ok) {
        onProgress({ status: 'processing', message: 'Processing transcription...' });
        
        const result = await parseResponse(response, responseFormat);
        
        onProgress({ status: 'complete', message: 'Transcription complete!' });
        
        return {
          success: true,
          ...result
        };
      }
      
      // Handle error responses
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        throw new WhisperAPIError(
          'Invalid API key. Please check your OpenAI API key in the settings.',
          'INVALID_API_KEY',
          false,
          errorData
        );
      }
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : INITIAL_RETRY_DELAY * attempt;
        
        if (attempt < MAX_RETRIES) {
          onProgress({ 
            status: 'retrying', 
            message: `Rate limited. Retrying in ${Math.ceil(waitTime / 1000)} seconds...` 
          });
          await sleep(waitTime);
          continue;
        }
        
        throw new WhisperAPIError(
          'API rate limit exceeded. Please try again later or upgrade your OpenAI plan.',
          'RATE_LIMITED',
          true,
          { retryAfter: waitTime }
        );
      }
      
      if (response.status === 413) {
        throw new WhisperAPIError(
          'Audio file is too large. Please use a file under 25MB.',
          'FILE_TOO_LARGE',
          false
        );
      }
      
      if (response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
          onProgress({ 
            status: 'retrying', 
            message: `Server error. Retrying in ${Math.ceil(delay / 1000)} seconds...` 
          });
          await sleep(delay);
          continue;
        }
        
        throw new WhisperAPIError(
          'OpenAI server error. Please try again later.',
          'SERVER_ERROR',
          true,
          errorData
        );
      }
      
      // Other errors
      throw new WhisperAPIError(
        errorData.error?.message || `API request failed with status ${response.status}`,
        'API_ERROR',
        false,
        errorData
      );
      
    } catch (error) {
      if (error instanceof WhisperAPIError) {
        lastError = error;
        if (!error.retryable) {
          throw error;
        }
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        // Network error
        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
          onProgress({ 
            status: 'retrying', 
            message: `Network error. Retrying in ${Math.ceil(delay / 1000)} seconds...` 
          });
          await sleep(delay);
          lastError = new WhisperAPIError(
            'Network error. Please check your internet connection.',
            'NETWORK_ERROR',
            true
          );
          continue;
        }
        
        throw new WhisperAPIError(
          'Network error. Please check your internet connection and try again.',
          'NETWORK_ERROR',
          true
        );
      } else {
        throw error;
      }
    }
  }
  
  // All retries exhausted
  throw lastError || new WhisperAPIError(
    'Failed to transcribe after multiple attempts. Please try again.',
    'MAX_RETRIES_EXCEEDED',
    true
  );
}

/**
 * Parse the API response based on format
 * @param {Response} response - Fetch response object
 * @param {string} format - Response format
 * @returns {Promise<Object>} - Parsed response
 */
async function parseResponse(response, format) {
  switch (format) {
    case 'verbose_json':
      const verboseData = await response.json();
      return {
        text: verboseData.text || '',
        language: verboseData.language || 'unknown',
        duration: verboseData.duration || 0,
        segments: verboseData.segments || [],
        words: verboseData.words || []
      };
      
    case 'json':
      const jsonData = await response.json();
      return {
        text: jsonData.text || '',
        language: 'unknown',
        duration: 0,
        segments: [],
        words: []
      };
      
    case 'srt':
    case 'vtt':
      const subtitleText = await response.text();
      return {
        text: subtitleText,
        language: 'unknown',
        duration: 0,
        segments: [],
        words: [],
        format
      };
      
    case 'text':
    default:
      const plainText = await response.text();
      return {
        text: plainText,
        language: 'unknown',
        duration: 0,
        segments: [],
        words: []
      };
  }
}

/**
 * Estimate transcription cost based on audio duration
 * @param {number} durationSeconds - Audio duration in seconds
 * @returns {Object} - Cost estimate
 */
function estimateCost(durationSeconds) {
  // Whisper API pricing: $0.006 per minute
  const pricePerMinute = 0.006;
  const minutes = durationSeconds / 60;
  const cost = minutes * pricePerMinute;
  
  return {
    minutes: Math.ceil(minutes),
    cost: cost.toFixed(4),
    formattedCost: `$${cost.toFixed(4)}`
  };
}

/**
 * Validate OpenAI API key format
 * @param {string} apiKey - The API key to validate
 * @returns {boolean} - Whether the key format is valid
 */
function validateApiKeyFormat(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // OpenAI API keys start with 'sk-' and are typically 51+ characters
  return apiKey.startsWith('sk-') && apiKey.length >= 40;
}

/**
 * Format transcription with timestamps
 * @param {Object} transcription - Transcription result with segments
 * @returns {string} - Formatted transcription text
 */
function formatTranscriptionWithTimestamps(transcription) {
  if (!transcription.segments || transcription.segments.length === 0) {
    return transcription.text;
  }
  
  return transcription.segments.map(segment => {
    const start = formatDuration(segment.start);
    const end = formatDuration(segment.end);
    return `[${start} - ${end}] ${segment.text.trim()}`;
  }).join('\n\n');
}

/**
 * Convert transcription to SRT format
 * @param {Object} transcription - Transcription result with segments
 * @returns {string} - SRT formatted text
 */
function toSRT(transcription) {
  if (!transcription.segments || transcription.segments.length === 0) {
    return '';
  }
  
  return transcription.segments.map((segment, index) => {
    const formatSRTTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };
    
    return `${index + 1}\n${formatSRTTime(segment.start)} --> ${formatSRTTime(segment.end)}\n${segment.text.trim()}`;
  }).join('\n\n');
}

/**
 * Convert transcription to VTT format
 * @param {Object} transcription - Transcription result with segments
 * @returns {string} - VTT formatted text
 */
function toVTT(transcription) {
  if (!transcription.segments || transcription.segments.length === 0) {
    return 'WEBVTT\n\n';
  }
  
  const formatVTTTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };
  
  const cues = transcription.segments.map(segment => {
    return `${formatVTTTime(segment.start)} --> ${formatVTTTime(segment.end)}\n${segment.text.trim()}`;
  }).join('\n\n');
  
  return `WEBVTT\n\n${cues}`;
}

// =============================================================================
// EXPORTS
// =============================================================================

// Make functions available globally for use in sidepanel.js
window.WhisperAPI = {
  transcribeAudio,
  validateAudioFile,
  validateApiKeyFormat,
  estimateCost,
  formatTranscriptionWithTimestamps,
  toSRT,
  toVTT,
  SUPPORTED_LANGUAGES,
  SUPPORTED_FORMATS,
  MAX_FILE_SIZE,
  WhisperAPIError
};
