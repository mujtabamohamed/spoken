/**
 * YouTube Transcription Backend Server
 * 
 * This server handles:
 * 1. Receiving YouTube video URLs from the Chrome extension
 * 2. Extracting audio using yt-dlp
 * 3. Transcribing with LOCAL Whisper or OpenAI Whisper API
 * 4. Returning transcription to the extension
 * 
 * Requirements:
 * - Node.js 18+
 * - yt-dlp installed and accessible in PATH
 * - ffmpeg installed (for audio conversion)
 * - For LOCAL mode: Python 3.8+ and openai-whisper installed
 */

import express from 'express';
import cors from 'cors';
import { spawn, execSync } from 'child_process';
import { createReadStream, unlink, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import FormData from 'form-data';
import fetch from 'node-fetch';

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.PORT || 3456;
const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';
const TEMP_DIR = join(tmpdir(), 'yt-transcriber');
const MAX_DURATION_SECONDS = 3 * 60 * 60; // 3 hours max



// Transcription mode: 'local' or 'api'
// Set to 'local' to use local Whisper model (free, no API key needed)
// Set to 'api' to use OpenAI's Whisper API (requires API key)
const TRANSCRIPTION_MODE = process.env.WHISPER_MODE || 'local';

// Local Whisper model size: tiny, base, small, medium, large
// Smaller = faster but less accurate, Larger = slower but more accurate
const LOCAL_WHISPER_MODEL = process.env.WHISPER_MODEL || 'base';

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

// =============================================================================
// EXPRESS APP SETUP
// =============================================================================

const app = express();

// CORS configuration - allow requests from Chrome extension
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Extract video ID from YouTube URL
 */
function extractVideoId(url) {
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
 * Get video info using yt-dlp
 */
function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const args = ['--dump-json', '--no-download', url];
    const process = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => stdout += data.toString());
    process.stderr.on('data', (data) => stderr += data.toString());
    
    process.on('close', (code) => {
      if (code === 0) {
        try {
          const info = JSON.parse(stdout);
          resolve({
            id: info.id,
            title: info.title,
            duration: info.duration,
            channel: info.channel,
            thumbnail: info.thumbnail,
            isLive: info.is_live || false
          });
        } catch (e) {
          reject(new Error('Failed to parse video info'));
        }
      } else {
        reject(new Error(stderr || 'Failed to get video info'));
      }
    });
    
    process.on('error', (err) => {
      reject(new Error(`yt-dlp not found: ${err.message}`));
    });
  });
}

/**
 * Download audio from YouTube video using yt-dlp
 */
function downloadAudio(url, outputPath, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '128K',
      '--no-playlist',
      '--no-warnings',
      '--progress',
      '-o', outputPath,
      url
    ];
    
    const process = spawn('yt-dlp', args);
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      const output = data.toString();
      const progressMatch = output.match(/(\d+\.?\d*)%/);
      if (progressMatch) {
        onProgress({ percent: parseFloat(progressMatch[1]) });
      }
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        const possiblePaths = [
          outputPath,
          outputPath + '.mp3',
          outputPath.replace(/\.[^/.]+$/, '.mp3')
        ];
        
        for (const path of possiblePaths) {
          if (existsSync(path)) {
            resolve(path);
            return;
          }
        }
        reject(new Error('Audio file not found after download'));
      } else {
        reject(new Error(stderr || 'Failed to download audio'));
      }
    });
    
    process.on('error', (err) => {
      reject(new Error(`yt-dlp not found: ${err.message}`));
    });
  });
}

/**
 * Check if local Whisper is installed
 */
function checkLocalWhisper() {
  try {
    execSync('whisper --help', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Transcribe audio using LOCAL Whisper model
 */
function transcribeLocal(audioPath, options = {}) {
  return new Promise((resolve, reject) => {
    const { language = null, model = LOCAL_WHISPER_MODEL } = options;
    const outputDir = TEMP_DIR;
    
    // Get the audio filename without extension (whisper uses this for output)
    const audioBaseName = basename(audioPath).replace(/\.[^/.]+$/, '');
    
    const args = [
      audioPath,
      '--model', model,
      '--output_format', 'json',
      '--output_dir', outputDir
    ];
    
    if (language && language !== 'auto') {
      args.push('--language', language);
    }
    
    console.log(`[Whisper Local] Running: whisper ${args.join(' ')}`);
    console.log(`[Whisper Local] Output will be in: ${outputDir}`);
    console.log(`[Whisper Local] Looking for: ${audioBaseName}.json`);
    
    const process = spawn('whisper', args);
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      console.log('[Whisper]', data.toString().trim());
    });
    
    process.stderr.on('data', (data) => {
      const msg = data.toString();
      stderr += msg;
      // Whisper outputs progress to stderr
      if (msg.includes('%|')) {
        console.log('[Whisper Progress]', msg.trim());
      }
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        // Whisper outputs: <output_dir>/<input_audio_basename>.json
        const jsonPath = join(outputDir, audioBaseName + '.json');
        
        console.log(`[Whisper] Looking for output at: ${jsonPath}`);
        console.log(`[Whisper] File exists: ${existsSync(jsonPath)}`);
        
        if (existsSync(jsonPath)) {
          try {
            const result = JSON.parse(readFileSync(jsonPath, 'utf-8'));
            
            // Clean up JSON file
            unlink(jsonPath, () => {});
            
            // Also clean up other output files whisper might create
            const srtPath = join(outputDir, audioBaseName + '.srt');
            const txtPath = join(outputDir, audioBaseName + '.txt');
            const vttPath = join(outputDir, audioBaseName + '.vtt');
            unlink(srtPath, () => {});
            unlink(txtPath, () => {});
            unlink(vttPath, () => {});
            
            resolve({
              text: result.text || '',
              language: result.language || 'unknown',
              segments: result.segments || []
            });
          } catch (e) {
            reject(new Error('Failed to parse Whisper output: ' + e.message));
          }
        } else {
          // List files in output dir for debugging
          try {
            const { readdirSync } = require('fs');
            const files = readdirSync(outputDir);
            console.log(`[Whisper] Files in ${outputDir}:`, files.filter(f => f.includes('.json')));
          } catch (e) {
            console.log('[Whisper] Could not list directory');
          }
          reject(new Error(`Whisper output file not found at: ${jsonPath}`));
        }
      } else {
        reject(new Error(stderr || 'Whisper transcription failed'));
      }
    });
    
    process.on('error', (err) => {
      reject(new Error(`Whisper not found. Install with: pip install openai-whisper\n${err.message}`));
    });
  });
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
async function transcribeAPI(audioPath, apiKey, options = {}) {
  const { language = null } = options;
  
  const formData = new FormData();
  formData.append('file', createReadStream(audioPath), {
    filename: basename(audioPath),
    contentType: 'audio/mpeg'
  });
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');
  
  if (language && language !== 'auto') {
    formData.append('language', language);
  }
  
  const response = await fetch(WHISPER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...formData.getHeaders()
    },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Whisper API error: ${response.status}`);
  }
  
  return await response.json();
}

// Languages supported by Deepgram Nova-2 model
// For languages not in this list, we fall back to Deepgram's Whisper model
const DEEPGRAM_NOVA2_LANGUAGES = new Set([
  'en', 'en-US', 'en-GB', 'en-AU', 'en-NZ', 'en-IN', // English variants
  'es', 'es-419', 'es-ES', // Spanish
  'fr', 'fr-CA', // French
  'de', // German
  'it', // Italian
  'pt', 'pt-BR', 'pt-PT', // Portuguese
  'nl', // Dutch
  'hi', // Hindi
  'ja', // Japanese
  'zh', 'zh-CN', 'zh-TW', // Chinese
  'ko', // Korean
  'pl', // Polish
  'ru', // Russian
  'tr', // Turkish
  'uk', // Ukrainian
  'sv', // Swedish
  'da', // Danish
  'no', // Norwegian
  'fi', // Finnish
  'id', // Indonesian
  'ms', // Malay
  'th', // Thai
  'vi', // Vietnamese
  'ta', // Tamil
  'te', // Telugu
  'cs', // Czech
  'el', // Greek
  'ro', // Romanian
  'bg', // Bulgarian
  'hu', // Hungarian
  'sk', // Slovak
  'hr', // Croatian
  'ca', // Catalan
  'taq' // Tamasheq
]);

/**
 * Transcribe audio using Deepgram API
 */
async function transcribeDeepgram(audioPath, apiKey, options = {}) {
  const { language } = options;
  
  const fileStream = createReadStream(audioPath);
  const fileBuffer = readFileSync(audioPath);
  
  // Determine which model to use based on language support
  // Nova-2 is faster and cheaper but doesn't support all languages
  // Whisper supports 90+ languages including Urdu, Arabic, etc.
  const useWhisper = language && language !== 'auto' && !DEEPGRAM_NOVA2_LANGUAGES.has(language);
  const model = useWhisper ? 'whisper-large' : 'nova-2';
  
  let url = `${DEEPGRAM_API_URL}?model=${model}&smart_format=true&diarize=false`;
  if (language && language !== 'auto') {
    url += `&language=${language}`;
  }
  
  if (useWhisper) {
    console.log(`[Deepgram] Language '${language}' not supported by Nova-2, using Whisper model`);
  }
  
  console.log(`[Deepgram] Requesting: ${url}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'audio/mpeg' // assuming mp3 from yt-dlp
    },
    body: fileBuffer
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.err_msg || error.reason || `Deepgram API error: ${response.status}`);
  }
  
  const result = await response.json();
  
  // Transform Deepgram result to match Whisper format expected by frontend
  const alternative = result.results?.channels[0]?.alternatives[0];
  if (!alternative) return { text: '', language: 'unknown', segments: [] };
  
  // Create fixed 5-second segments
  let segments = [];
  const words = alternative.words || [];
  const SEGMENT_DURATION = 5.0;
  
  if (words.length > 0) {
    let currentSegment = {
      start: 0,
      end: SEGMENT_DURATION,
      text: ''
    };
    
    words.forEach(word => {
      const wordStart = word.start;
      const content = word.punctuated_word || word.word;
      
      // Check if word belongs to a new segment
      if (wordStart >= currentSegment.end) {
        // Push previous segment if valid
        if (currentSegment.text) segments.push(currentSegment);
        
        // Calculate new segment slot directly
        const slotIndex = Math.floor(wordStart / SEGMENT_DURATION);
        const newStart = slotIndex * SEGMENT_DURATION;
        currentSegment = {
          start: newStart,
          end: newStart + SEGMENT_DURATION,
          text: ''
        };
      }
      
      currentSegment.text = currentSegment.text ? `${currentSegment.text} ${content}` : content;
    });
    
    // Add final segment
    if (currentSegment.text) segments.push(currentSegment);
  } else {
    // Fallback
    segments = [{
      start: 0,
      end: 0,
      text: alternative.transcript
    }];
  }
  
  return {
    text: alternative.transcript,
    language: 'detected', // Deepgram doesn't always return language code in same format
    segments: segments
  };
}

/**
 * Clean up temporary file
 */
function cleanup(filePath) {
  if (filePath && existsSync(filePath)) {
    unlink(filePath, (err) => {
      if (err) console.error('Failed to cleanup:', err);
    });
  }
}

// =============================================================================
// API ROUTES
// =============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'yt-transcription-server',
    version: '1.1.0',
    mode: TRANSCRIPTION_MODE,
    model: TRANSCRIPTION_MODE === 'local' ? LOCAL_WHISPER_MODEL : 'whisper-1'
  });
});

/**
 * Check dependencies
 */
app.get('/check-deps', async (req, res) => {
  const ytdlpInstalled = (() => {
    try {
      execSync('yt-dlp --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  })();
  
  const ffmpegInstalled = (() => {
    try {
      execSync('ffmpeg -version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  })();
  
  const whisperInstalled = checkLocalWhisper();
  const isLocalMode = TRANSCRIPTION_MODE === 'local';
  
  res.json({
    ytdlp: ytdlpInstalled,
    ffmpeg: ffmpegInstalled,
    whisper: whisperInstalled,
    whisperRequired: isLocalMode, // Only required for local mode
    mode: TRANSCRIPTION_MODE,
    model: LOCAL_WHISPER_MODEL,
    ready: ytdlpInstalled && ffmpegInstalled && (!isLocalMode || whisperInstalled)
  });
});

/**
 * Get video info
 */
app.post('/video-info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    
    const videoId = extractVideoId(url);
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });
    
    const info = await getVideoInfo(url);
    res.json({ success: true, data: info });
  } catch (error) {
    console.error('Video info error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Main transcription endpoint
 */
app.post('/transcribe', async (req, res) => {
  const { url, language = 'auto' } = req.body;
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const provider = req.headers['x-provider'] || 'openai'; // 'openai' or 'deepgram'
  const mode = req.headers['x-mode'] || TRANSCRIPTION_MODE; // allow override
  
  let audioPath = null;
  
  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  try {
    if (!url) {
      sendEvent({ status: 'error', error: 'URL is required' });
      return res.end();
    }
    
    // For API mode, require API key
    if (mode === 'api' && !apiKey && provider !== 'local') {
      sendEvent({ status: 'error', error: `API key required for ${provider} mode.` });
      return res.end();
    }
    
    const videoId = extractVideoId(url);
    if (!videoId) {
      sendEvent({ status: 'error', error: 'Invalid YouTube URL' });
      return res.end();
    }
    
    sendEvent({ status: 'info', message: 'Fetching video info...' });
    console.log(`[Transcribe] Starting for video: ${videoId} (mode: ${mode}, provider: ${provider})`);
    
    // Get video info
    const videoInfo = await getVideoInfo(url);
    console.log(`[Transcribe] Video: "${videoInfo.title}" (${videoInfo.duration}s)`);
    
    if (videoInfo.duration > MAX_DURATION_SECONDS) {
      sendEvent({ status: 'error', error: `Video too long. Maximum duration is ${MAX_DURATION_SECONDS / 3600} hours.` });
      return res.end();
    }
    
    if (videoInfo.isLive) {
      sendEvent({ status: 'error', error: 'Cannot transcribe live streams.' });
      return res.end();
    }
    
    // Download audio
    sendEvent({ status: 'info', message: 'Downloading audio from YouTube...' });
    console.log('[Transcribe] Downloading audio...');
    const tempId = randomUUID();
    audioPath = join(TEMP_DIR, tempId);
    const actualPath = await downloadAudio(url, audioPath);
    console.log('[Transcribe] Audio downloaded:', actualPath);
    
    // Transcribe
    let transcription;
    
    if (mode === 'local') {
      sendEvent({ status: 'info', message: 'Transcribing with local Whisper...' });
      console.log('[Transcribe] Using LOCAL Whisper model...');
      transcription = await transcribeLocal(actualPath, { language });
    } else {
      if (provider === 'deepgram') {
        sendEvent({ status: 'info', message: 'Transcribing with Deepgram API...' });
        console.log('[Transcribe] Using Deepgram API...');
        transcription = await transcribeDeepgram(actualPath, apiKey, { language });
      } else {
        sendEvent({ status: 'info', message: 'Transcribing with OpenAI Whisper...' });
        console.log('[Transcribe] Using OpenAI Whisper API...');
        transcription = await transcribeAPI(actualPath, apiKey, { language });
      }
    }
    
    console.log('[Transcribe] Transcription complete!');
    sendEvent({ status: 'info', message: 'Finalizing...' });
    
    const resultData = {
      videoId,
      title: videoInfo.title,
      channel: videoInfo.channel,
      duration: videoInfo.duration,
      text: transcription.text,
      language: transcription.language,
      segments: transcription.segments || [],
      mode: mode,
      provider: provider
    };
    
    sendEvent({ status: 'complete', data: resultData });
    res.end();
    
  } catch (error) {
    console.error('[Transcribe] Error:', error);
    
    let message = error.message;
    if (message.includes('API key') || message.includes('quota')) {
      message = 'API Authentication Failed: ' + message;
    }
    
    sendEvent({ status: 'error', error: message });
    res.end();
    
  } finally {
    if (audioPath) {
      cleanup(audioPath);
      cleanup(audioPath + '.mp3');
    }
  }
});

/**
 * Estimate cost (only relevant for API mode)
 */
app.post('/estimate-cost', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    
    const info = await getVideoInfo(url);
    const minutes = Math.ceil(info.duration / 60);
    
    // Local mode is free!
    if (TRANSCRIPTION_MODE === 'local') {
      res.json({
        success: true,
        data: {
          duration: info.duration,
          minutes,
          cost: '0.00',
          formattedCost: 'FREE (local mode)',
          mode: 'local'
        }
      });
    } else {
      const cost = minutes * 0.006;
      res.json({
        success: true,
        data: {
          duration: info.duration,
          minutes,
          cost: cost.toFixed(4),
          formattedCost: `$${cost.toFixed(4)}`,
          mode: 'api'
        }
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// =============================================================================
// SERVER START
// =============================================================================

app.listen(PORT, () => {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  Spoken Backend Server');
  console.log('═'.repeat(60));
  console.log(`  Status:     Running`);
  console.log(`  Port:       ${PORT}`);
  console.log(`  Mode:       ${TRANSCRIPTION_MODE.toUpperCase()}`);
  
  if (TRANSCRIPTION_MODE === 'local') {
    console.log(`  Model:      ${LOCAL_WHISPER_MODEL}`);
    console.log(`  Cost:       FREE! 🎉`);
    console.log('');
    console.log('  Requirements for LOCAL mode:');
    console.log('    ✓ yt-dlp (audio download)');
    console.log('    ✓ ffmpeg (audio conversion)');
    console.log('    ✓ openai-whisper (transcription)');
  } else {
    console.log(`  Cost:       ~$0.006/min (OpenAI) or ~$0.0043/min (Deepgram)`);
    console.log('');
    console.log('  Requirements for API mode:');
    console.log('    ✓ yt-dlp (audio download)');
    console.log('    ✓ ffmpeg (audio conversion)');
    console.log('    ✗ Local Whisper NOT required!');
  }
  
  console.log(`  Temp Dir:   ${TEMP_DIR}`);
  console.log('');
  console.log('  Endpoints:');
  console.log('    GET  /health        - Health check');
  console.log('    GET  /check-deps    - Check dependencies');
  console.log('    POST /video-info    - Get video metadata');
  console.log('    POST /transcribe    - Transcribe YouTube video');
  console.log('    POST /estimate-cost - Estimate cost');
  console.log('═'.repeat(60));
  
  // Only warn about missing whisper if in local mode
  if (TRANSCRIPTION_MODE === 'local' && !checkLocalWhisper()) {
    console.log('');
    console.log('⚠️  WARNING: Local Whisper not found!');
    console.log('   Install with: pip install openai-whisper');
    console.log('   Or switch to API mode: WHISPER_MODE=api npm start');
    console.log('');
  }
  
  console.log('');
  console.log('Ready to receive requests!');
  console.log('');
});