/**
 * Edura TTS Pipeline
 * 
 * Handles the text-to-speech flow using the Rhubarb API:
 * 
 * API Flow:
 * 1. POST /talk        → { ID: sessionID, text } → starts audio generation
 * 2. POST /get_chunk   → { ID: sessionID }       → returns list of available chunks
 * 3. POST /read-file   → { ID: sessionID, chunk_ID: N } → returns audio + viseme data for chunk
 * 4. Play each chunk sequentially via Web Audio API
 * 5. Parse Rhubarb viseme data and sync with audio playback
 * 6. Fire events for the renderer (viseme changes) and UI (audioFinished)
 */

export class TTSPipeline {

    constructor(basePath = '.') {
        this.basePath = basePath;
        this.config = null;

        // Audio
        this.audioContext = null;
        this.currentAudioSource = null;
        this.isPlaying = false;
        this.isMuted = false;
        this.gainNode = null;

        // Session ID — used as "ID" in all API calls
        this.sessionID = null;

        // Viseme timeline
        this.visemeTimeline = [];      // Array of { start, end, value }
        this.visemeStartTime = 0;
        this.visemeAnimationId = null;

        // Chunked playback
        this.audioQueue = [];          // Queue of { audioData, visemes } to play
        this.isPlayingQueue = false;

        // Callbacks
        this.onVisemeChange = null;    // (viseme: string) => void
        this.onSpeechStart = null;     // () => void
        this.onSpeechEnd = null;       // () => void
        this.onError = null;           // (error: Error) => void

        // Polling
        this.maxPollAttempts = 120;     // Max ~60 seconds of polling at 500ms intervals
        this.pollIntervalMs = 500;
        this.stopRequested = false;
    }

    /**
     * Initialize: load config and create AudioContext
     */
    async init() {
        // Load config
        try {
            const res = await fetch(this.basePath + '/config/config.json');
            this.config = await res.json();
            console.log('[TTS] Config loaded:', this.config);
        } catch (err) {
            console.error('[TTS] Failed to load config:', err);
            this.config = {};
        }

        // Create AudioContext (requires user interaction in most browsers)
        this._ensureAudioContext();

        // Generate or restore session ID
        this.sessionID = this._getOrCreateSessionID();
        console.log('[TTS] Pipeline initialized, session:', this.sessionID);
    }

    /**
     * Get or create a session ID for API calls
     */
    _getOrCreateSessionID() {
        let sid = localStorage.getItem('gmr_session_id');
        if (!sid) {
            sid = Date.now().toString();
            localStorage.setItem('gmr_session_id', sid);
        }
        return sid;
    }

    /**
     * Set session ID (called when a new session is created externally)
     */
    setSessionID(id) {
        this.sessionID = id;
    }

    /**
     * Create or resume AudioContext
     */
    _ensureAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    /**
     * Main entry: speak the given text.
     * Calls /talk first, then polls /get_chunk → /read-file.
     * NOTE: If /get_text already started TTS, use speakFromChunks() instead.
     */
    async speak(text) {
        if (!this.config || !this.config.tts) {
            console.error('[TTS] No TTS API URL configured');
            this._fireError(new Error('TTS not configured'));
            return;
        }

        this.stop();
        this._ensureAudioContext();
        this.stopRequested = false;

        const sessionID = this.sessionID || Date.now().toString();
        console.log(`[TTS] Speaking: "${text.substring(0, 80)}..." (ID: ${sessionID})`);

        try {
            const talkResponse = await this._callTalkAPI(sessionID, text);
            if (!talkResponse || this.stopRequested) return;
            console.log('[TTS] /talk response:', talkResponse);

            // Now poll and play chunks
            await this._pollAndPlayChunks(sessionID);
        } catch (err) {
            console.error('[TTS] Speech error:', err);
            this._fireError(err);
        }
    }

    /**
     * Start audio playback from chunks — skips /talk.
     * Used when /get_text already started TTS generation.
     * 
     * @param {string} sessionID - The session ID from /get_text response
     */
    async speakFromChunks(sessionID) {
        this.stop();
        this._ensureAudioContext();
        this.stopRequested = false;

        sessionID = sessionID || this.sessionID || Date.now().toString();
        console.log(`[TTS] Playing from chunks (skip /talk), ID: ${sessionID}`);

        try {
            await this._pollAndPlayChunks(sessionID);
        } catch (err) {
            console.error('[TTS] Chunk playback error:', err);
            this._fireError(err);
        }
    }

    /**
     * Internal: Poll /get_chunk and play all audio chunks
     */
    async _pollAndPlayChunks(sessionID) {
        // Fire speech start
        if (this.onSpeechStart) this.onSpeechStart();

        // Wait 3 seconds before first poll — audio generation needs time
        console.log('[TTS] Waiting 3s for audio generation...');
        await new Promise(r => setTimeout(r, 3000));
        if (this.stopRequested) return;

        let chunksDone = false;
        let nextChunkID = 0;

        while (!chunksDone && !this.stopRequested) {
            const chunkInfo = await this._pollGetChunk(sessionID);
            if (this.stopRequested) return;

            if (!chunkInfo) {
                console.warn('[TTS] Polling timed out');
                break;
            }

            console.log('[TTS] /get_chunk response:', chunkInfo);

            // Determine available chunks from the response
            let availableChunks = 0;
            let isComplete = false;

            if (Array.isArray(chunkInfo)) {
                availableChunks = chunkInfo.length;
                isComplete = true;
            } else if (typeof chunkInfo === 'object') {
                // API returns { total_chunk: N } (singular 'chunk')
                availableChunks = chunkInfo.total_chunk || chunkInfo.total_chunks || chunkInfo.chunks || chunkInfo.count || 0;
                isComplete = chunkInfo.done || chunkInfo.status === 'done' || chunkInfo.complete || (availableChunks > 0);

                if (chunkInfo.chunk_list && Array.isArray(chunkInfo.chunk_list)) {
                    availableChunks = chunkInfo.chunk_list.length;
                }
            } else if (typeof chunkInfo === 'number') {
                availableChunks = chunkInfo;
                isComplete = true;
            }

            console.log(`[TTS] Chunks available: ${availableChunks}, complete: ${isComplete}, next: ${nextChunkID}`);

            // Fetch and play each new chunk (with retry for not-ready audio)
            while (nextChunkID < availableChunks && !this.stopRequested) {
                const chunkData = await this._fetchAudioChunkWithRetry(sessionID, nextChunkID);
                if (this.stopRequested) return;

                if (chunkData) {
                    await this._playAudioChunk(chunkData);
                } else {
                    console.warn(`[TTS] Chunk ${nextChunkID} not ready after retries, skipping`);
                }
                nextChunkID++;
            }

            if (isComplete || availableChunks === 0) {
                chunksDone = true;
            } else {
                await new Promise(r => setTimeout(r, this.pollIntervalMs));
            }
        }

        // All chunks done
        this._onAllChunksFinished();
    }

    /**
     * POST /talk — Start TTS generation
     * Payload: { ID: sessionID, text: "..." }
     */
    async _callTalkAPI(sessionID, text) {
        try {
            const payload = {
                ID: sessionID,
                text: text
            };

            console.log('[TTS] POST /talk:', JSON.stringify(payload).substring(0, 200));

            const response = await fetch(this.config.tts, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('[TTS] /talk error body:', errorBody);
                throw new Error(`/talk returned ${response.status}: ${response.statusText} - ${errorBody}`);
            }

            return await response.json();

        } catch (err) {
            console.error('[TTS] /talk failed:', err);
            this._fireError(err);
            return null;
        }
    }

    /**
     * POST /get_chunk — Poll for available audio chunks
     * Payload: { ID: sessionID }
     * Polls until chunks are available or max attempts exhausted
     */
    async _pollGetChunk(sessionID) {
        for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
            if (this.stopRequested) return null;

            try {
                const payload = { ID: sessionID };

                const response = await fetch(this.config.lengthcheck, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const data = await response.json();

                    // Check if chunks are available
                    const hasChunks = (
                        (Array.isArray(data) && data.length > 0) ||
                        (typeof data === 'number' && data > 0) ||
                        (typeof data === 'object' && !Array.isArray(data) && (
                            (data.total_chunk && data.total_chunk > 0) ||
                            (data.total_chunks && data.total_chunks > 0) ||
                            (data.chunks && data.chunks > 0) ||
                            (data.count && data.count > 0) ||
                            (data.chunk_list && data.chunk_list.length > 0) ||
                            data.done || data.complete
                        ))
                    );

                    if (hasChunks) {
                        return data;
                    }
                }
            } catch (e) {
                console.warn(`[TTS] /get_chunk poll attempt ${attempt + 1} error:`, e.message);
            }

            // Wait before next poll
            await new Promise(r => setTimeout(r, this.pollIntervalMs));
        }

        console.warn('[TTS] /get_chunk polling timed out after', this.maxPollAttempts, 'attempts');
        return null;
    }

    /**
     * POST /read-file — Fetch audio data for a specific chunk
     * Payload: { ID: sessionID, chunk_ID: N }
     * Returns the response which may contain audio + viseme data
     */
    async _fetchAudioChunk(sessionID, chunkID) {
        try {
            const payload = {
                ID: sessionID,
                chunk_ID: chunkID
            };

            const response = await fetch(this.config.readaudio, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`/read-file returned ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || '';

            // If response is audio binary (wav, mp3, ogg, etc.)
            if (contentType.includes('audio') || contentType.includes('octet-stream')) {
                const audioBlob = await response.blob();
                return { audio: audioBlob, visemes: [] };
            }

            // If response is JSON — API returns { audio: "base64...", data: [...rhubarb...], taskId: "..." }
            if (contentType.includes('json')) {
                const data = await response.json();

                // Check if audio is empty (not ready yet)
                const audioContent = data.audio || data.audio_data || data.audioData || '';
                if (!audioContent || audioContent === '') {
                    console.log(`[TTS] Chunk ${chunkID} audio not ready yet (empty)`);
                    return null; // Signal: not ready
                }

                // Extract viseme/rhubarb data
                const visemes = data.data || data.mouthCues || data.mouth_cues || data.visemes ||
                    (data.rhubarb && data.rhubarb.mouthCues) || [];

                console.log(`[TTS] Chunk ${chunkID}: audio=${audioContent.length} chars (base64), visemes=${visemes.length} cues`);
                return { audio: audioContent, visemes: visemes };
            }

            // Fallback: treat as binary audio
            const audioBlob = await response.blob();
            return { audio: audioBlob, visemes: [] };

        } catch (err) {
            console.error(`[TTS] /read-file chunk ${chunkID} failed:`, err);
            return null;
        }
    }

    /**
     * Fetch audio chunk with retry — polls /read-file until audio is ready
     * Retries every 1s for up to 10 seconds if audio comes back empty.
     */
    async _fetchAudioChunkWithRetry(sessionID, chunkID) {
        const maxRetryMs = 10000; // 10 seconds max
        const retryIntervalMs = 1000; // 1 second between retries
        const startTime = Date.now();

        console.log(`[TTS] Fetching chunk ${chunkID} (with retry, max 10s)...`);

        while (Date.now() - startTime < maxRetryMs && !this.stopRequested) {
            const chunkData = await this._fetchAudioChunk(sessionID, chunkID);

            if (chunkData && chunkData.audio) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`[TTS] ✅ Chunk ${chunkID} ready after ${elapsed}s`);
                return chunkData;
            }

            // Audio not ready — wait and retry
            console.log(`[TTS] Chunk ${chunkID} empty, retrying in 1s... (${((Date.now() - startTime) / 1000).toFixed(0)}s elapsed)`);
            await new Promise(r => setTimeout(r, retryIntervalMs));
        }

        console.warn(`[TTS] ⚠️ Chunk ${chunkID} not ready after 10s, giving up`);
        return null;
    }

    /**
     * Play a single audio chunk with viseme sync
     */
    async _playAudioChunk(chunkData) {
        if (!chunkData || !chunkData.audio || this.stopRequested) return;

        return new Promise(async (resolve) => {
            this._ensureAudioContext();

            let arrayBuffer;

            if (chunkData.audio instanceof Blob) {
                arrayBuffer = await chunkData.audio.arrayBuffer();
            } else if (chunkData.audio instanceof ArrayBuffer) {
                arrayBuffer = chunkData.audio;
            } else if (typeof chunkData.audio === 'string') {
                // Base64 encoded audio
                const binary = atob(chunkData.audio);
                arrayBuffer = new ArrayBuffer(binary.length);
                const view = new Uint8Array(arrayBuffer);
                for (let i = 0; i < binary.length; i++) {
                    view[i] = binary.charCodeAt(i);
                }
            } else {
                console.warn('[TTS] Unknown audio data format in chunk');
                resolve();
                return;
            }

            try {
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                // Create source
                this.currentAudioSource = this.audioContext.createBufferSource();
                this.currentAudioSource.buffer = audioBuffer;
                this.currentAudioSource.connect(this.gainNode);

                // Set mute state
                this.gainNode.gain.value = this.isMuted ? 0 : 1;

                // Start viseme animation for this chunk
                this.visemeTimeline = chunkData.visemes || [];
                this.visemeStartTime = this.audioContext.currentTime;

                if (this.visemeTimeline.length > 0) {
                    this._startVisemeAnimation();
                } else {
                    this._startFallbackAnimation();
                }

                // Play
                this.currentAudioSource.start(0);
                this.isPlaying = true;
                console.log(`[TTS] Chunk playing, duration: ${audioBuffer.duration.toFixed(2)}s`);

                // Resolve when chunk ends
                this.currentAudioSource.onended = () => {
                    this.isPlaying = false;
                    this._stopVisemeAnimation();
                    if (this.onVisemeChange) this.onVisemeChange('X');
                    resolve();
                };

            } catch (err) {
                console.error('[TTS] Failed to decode/play chunk:', err);
                resolve(); // Continue to next chunk even if this fails
            }
        });
    }

    /**
     * Called when all chunks have been played
     */
    _onAllChunksFinished() {
        this.isPlaying = false;
        this._stopVisemeAnimation();

        // Reset to neutral
        if (this.onVisemeChange) this.onVisemeChange('X');

        // Fire speech end event
        if (this.onSpeechEnd) this.onSpeechEnd();

        // Dispatch global event for backward compat
        document.dispatchEvent(new CustomEvent('audioFinished'));
        console.log('[TTS] All chunks finished playing');
    }

    /**
     * Start the viseme animation loop — syncs mouth shapes with audio playback
     */
    _startVisemeAnimation() {
        this._stopVisemeAnimation();

        const animate = () => {
            if (!this.isPlaying || this.stopRequested) return;

            const elapsed = this.audioContext.currentTime - this.visemeStartTime;

            // Find the current viseme based on elapsed time
            let currentViseme = 'X';
            for (const cue of this.visemeTimeline) {
                if (elapsed >= cue.start && elapsed < cue.end) {
                    currentViseme = cue.value;
                    break;
                }
            }

            if (this.onVisemeChange) {
                this.onVisemeChange(currentViseme);
            }

            this.visemeAnimationId = requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * Fallback animation when no Rhubarb data is available.
     * Creates a procedural talking animation.
     */
    _startFallbackAnimation() {
        this._stopVisemeAnimation();

        const visemes = ['X', 'B', 'C', 'D', 'C', 'B', 'E', 'F', 'D', 'B'];
        let index = 0;
        let lastChange = 0;
        const changeInterval = 0.12; // Change viseme every ~120ms

        const animate = () => {
            if (!this.isPlaying || this.stopRequested) return;

            const elapsed = this.audioContext.currentTime - this.visemeStartTime;

            if (elapsed - lastChange > changeInterval) {
                index = (index + 1) % visemes.length;
                if (this.onVisemeChange) {
                    this.onVisemeChange(visemes[index]);
                }
                lastChange = elapsed;
            }

            this.visemeAnimationId = requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * Stop viseme animation
     */
    _stopVisemeAnimation() {
        if (this.visemeAnimationId) {
            cancelAnimationFrame(this.visemeAnimationId);
            this.visemeAnimationId = null;
        }
    }

    /**
     * Stop current playback
     */
    stop() {
        this.stopRequested = true;
        if (this.currentAudioSource) {
            try {
                this.currentAudioSource.stop();
            } catch (e) { /* Already stopped */ }
            this.currentAudioSource = null;
        }
        this.isPlaying = false;
        this._stopVisemeAnimation();
        if (this.onVisemeChange) this.onVisemeChange('X');
    }

    /**
     * Toggle audio mute
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.gainNode) {
            this.gainNode.gain.value = this.isMuted ? 0 : 1;
        }
        return this.isMuted;
    }

    /**
     * Set mute state
     */
    setMuted(muted) {
        this.isMuted = muted;
        if (this.gainNode) {
            this.gainNode.gain.value = muted ? 0 : 1;
        }
    }

    /**
     * Fire error callback/event
     */
    _fireError(err) {
        if (this.onError) this.onError(err);
        document.dispatchEvent(new CustomEvent('kiksyError', { detail: { error: err } }));
    }
}

export default TTSPipeline;
