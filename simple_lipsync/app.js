// app.js

// State
let isRecording = false;
let mediaRecorder;
let audioChunks = [];
let audioQueue = [];
let isQueueProcessing = false;
let currentPhonemes = null;
let isPlaying = false;
let audioPlayer = new Audio();

// 3D Scene Vars
let scene, camera, renderer, mouthModel;
let faceMesh, teethMesh;
// Default Transforms (will be updated by controls AND face tracking)
let modelScale = 1;
let modelPosX = 0;
let modelPosY = -1.5;

// MediaPipe Face Mesh
let faceMeshDetector;
let isTracking = false;

// Viseme Mapping
const VISEME_MAP = {
    'X': 'Rest', 'A': 'AE', 'B': 'P_B_M', 'C': 'EE', 'D': 'AA',
    'E': 'EE', 'F': 'Ow', 'G': 'F', 'H': 'L'
};

// DOM Elements
const micBtn = document.getElementById('micBtn');
const sendBtn = document.getElementById('sendBtn');
const textInput = document.getElementById('textInput');
const statusDiv = document.getElementById('status');
const canvas = document.getElementById('mouthCanvas');
const scaleRange = document.getElementById('scaleRange');
const scaleVal = document.getElementById('scaleVal');
const posXRange = document.getElementById('posXRange');
const posXVal = document.getElementById('posXVal');
const posYRange = document.getElementById('posYRange');
const posYVal = document.getElementById('posYVal');
const toggleDebug = document.getElementById('toggleDebug');
const debugControls = document.getElementById('debugControls');
const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');
const bgVideo = document.getElementById('bgVideo');

// --- Initialization ---

function init() {
    initThree();
    initFaceMesh();
    setupEventListeners();
}

function initThree() {
    scene = new THREE.Scene();
    // Move camera back to accommodate larger scale/movement
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 10;

    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8); // Reduced intensity
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5); // Reduced intensity
    dirLight.position.set(0, 2, 5);
    scene.add(dirLight);

    const loader = new THREE.GLTFLoader();
    loader.load('uploads/Face.glb', (gltf) => {
        mouthModel = gltf.scene;
        scene.add(mouthModel);

        console.log("--- TRAVERSING MODEL MESHES ---");
        mouthModel.traverse((child) => {
            if (child.isMesh) {
                // Adjust Skin Tone
                if (child.material) {
                    // Tinting material to match video better (Warmer/Darker)
                    child.material.color.setRGB(0.75, 0.55, 0.45);
                    child.material.roughness = 0.6;
                    child.material.metalness = 0.1;
                }

                if (child.morphTargetDictionary) {
                    if (Object.keys(child.morphTargetDictionary).length > 2) {
                        faceMesh = child;
                    }
                }
            }
        });

        statusDiv.textContent = "Model Loaded. Waiting for tracking...";
        animate();
    }, undefined, (error) => {
        console.error(error);
        statusDiv.textContent = "Error loading 3D Model";
    });

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function initFaceMesh() {
    faceMeshDetector = new FaceMesh({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
    });

    faceMeshDetector.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMeshDetector.onResults(onFaceResults);
}

function onFaceResults(results) {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // --- 1. Position (Geometric Center) ---
        // Using average of lips for position
        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];
        const centerX = (upperLip.x + lowerLip.x) / 2;
        const centerY = (upperLip.y + lowerLip.y) / 2;

        // Project to 3D World Position
        const vec = new THREE.Vector3();
        const pos = new THREE.Vector3();
        vec.set((centerX * 2) - 1, -(centerY * 2) + 1, 0.5);
        vec.unproject(camera);
        vec.sub(camera.position).normalize();
        const distance = -camera.position.z / vec.z;
        pos.copy(camera.position).add(vec.multiplyScalar(distance));

        modelPosX = pos.x + parseFloat(posXRange.value);
        modelPosY = pos.y + parseFloat(posYRange.value);

        // --- 2. Rotation (Rigid Pose Estimation) ---
        // We use stable landmarks to calculate head orientation.
        // Pitch: Angle between Nose Tip (1) and Chin (152) in YZ plane? 
        // Simpler for JS: Calculate discrete angles from vectors.

        // Vector 1: Left Eye (33) to Right Eye (263) -> Defines Horizontal (Roll/Yaw basis)
        // Vector 2: Top Head (10) to Chin (152) -> Defines Vertical (Pitch basis)

        const noseTop = landmarks[10]; // Or forehead
        const chin = landmarks[152];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];

        // -- Roll (Z-axis rotation) --
        // Atan2 of the eye delta Y / delta X
        const dEyeY = rightEye.y - leftEye.y; // Inverted Y screen space? MediaPipe Y is down.
        const dEyeX = rightEye.x - leftEye.x;
        // Y increases downwards in MP. 
        // Right eye is > Left Eye in X usually (from camera view, subject's left is screen right)
        // Let's rely on indices. 33 is Left Eye (Screen Left), 263 is Right Eye (Screen Right).
        const roll = Math.atan2(dEyeY, dEyeX); // Radians

        // -- Yaw (Y-axis rotation) --
        // Use Z depth difference between eyes. MediaPipe gives normalized Z.
        // If one eye is deeper than the other, head is turned.
        const dEyeZ = rightEye.z - leftEye.z;
        // Sensitivity Factor needed since Z is relative
        const yaw = Math.atan2(dEyeZ, dEyeX); // Initial approx

        // -- Pitch (X-axis rotation) --
        // Nose/Chin Z difference vs Y difference
        const dChinY = chin.y - noseTop.y;
        const dChinZ = chin.z - noseTop.z;
        // Normal face: Chin is 'below' nose (Positive Y diff), Z should be similar?
        // Actually Z is relative depth. 
        // Simpler heuristic: Ratio of distances.
        const pitch = Math.atan2(dChinZ, dChinY);

        // Apply Rotations to Model
        if (mouthModel) {
            // Three.js Order is usually XYZ. 
            // We need to negate/adjust based on Coordinate System mismatch.
            // MP: Y-down. Three.js: Y-up.
            // A positive Roll in MP (Right eye lower) = Clockwise.
            // In Three.js, positive Z rotation is Counter-Clockwise. So invert Roll.

            // Refined Rotation Mapping
            mouthModel.rotation.z = -roll; // Roll
            mouthModel.rotation.y = -yaw * 3;  // Amplify Yaw slightly
            mouthModel.rotation.x = -pitch + 0.2; // Pitch offset (initial tilt)

            mouthModel.position.set(modelPosX, modelPosY, 0);

            // --- 3. Scale ---
            const dx = rightEye.x - leftEye.x;
            const dy = rightEye.y - leftEye.y;
            const width = Math.sqrt(dx * dx + dy * dy);

            // Adjusted Scale Multiplier (Reduced significantly from 80)
            let autoScale = width * 25;
            let userScale = parseFloat(scaleRange.value);
            if (userScale < 0.1) userScale = 0.1;

            modelScale = autoScale * userScale;
            mouthModel.scale.set(modelScale, modelScale, modelScale);
        }
    }
}

// --- Tracking Loop ---
async function trackFace() {
    if (!bgVideo.paused && !bgVideo.ended && isTracking) {
        await faceMeshDetector.send({ image: bgVideo });
    }
    if (isTracking) {
        requestAnimationFrame(trackFace);
    }
}

// --- Event Listeners ---

function setupEventListeners() {
    // Start Overlay
    startBtn.addEventListener('click', () => {
        startOverlay.style.display = 'none';
        bgVideo.play();

        isTracking = true;
        trackFace();

        triggerWelcomeMessage();

        // Unlock Audio Context
        audioPlayer.play().catch(() => { });
        audioPlayer.pause();
    });

    // Debug Controls
    scaleRange.addEventListener('input', (e) => {
        scaleVal.textContent = e.target.value;
        // Updated in loop
    });
    posXRange.addEventListener('input', (e) => {
        posXVal.textContent = e.target.value;
    });
    posYRange.addEventListener('input', (e) => {
        posYVal.textContent = e.target.value;
    });
    toggleDebug.addEventListener('click', () => {
        debugControls.style.display = debugControls.style.display === 'none' ? 'block' : 'none';
    });

    // Chat Controls
    sendBtn.addEventListener('click', sendText);
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendText();
    });

    // Mic Controls
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            // Try to pick a well-supported encoded format (typically Opus in WebM/OGG)
            let options = {};
            try {
                if (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    options.mimeType = 'audio/webm;codecs=opus';
                } else if (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                    options.mimeType = 'audio/ogg;codecs=opus';
                }
            } catch (e) {
                console.warn('MediaRecorder type support check failed:', e);
            }

            mediaRecorder = new MediaRecorder(stream, options);
            console.log('MediaRecorder initialized. mimeType =', mediaRecorder.mimeType);

            mediaRecorder.ondataavailable = e => {
                console.log('MediaRecorder ondataavailable: chunk size =', e.data && e.data.size, 'type =', e.data && e.data.type);
                audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                console.log('MediaRecorder stopped. Total chunks =', audioChunks.length);
                sendAudio();
            };
        }).catch(err => {
            console.error("Mic error:", err);
            statusDiv.textContent = "Mic access denied";
        });
    }

    micBtn.addEventListener('mousedown', () => {
        if (!mediaRecorder) return;
        isRecording = true;
        audioChunks = [];
        mediaRecorder.start();
        micBtn.classList.add('recording');
        micBtn.textContent = "Listening...";
    });

    micBtn.addEventListener('mouseup', () => {
        if (!mediaRecorder || !isRecording) return;
        isRecording = false;
        mediaRecorder.stop();
        micBtn.classList.remove('recording');
        micBtn.textContent = "Processing...";
    });
}

// --- Interaction Logic ---

// 1. Welcome Message
async function triggerWelcomeMessage() {
    console.log("Triggering Welcome Message...");
    try {
        const res = await fetch('/talk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ID: "17707462847981" }) // Special ID
        });
        const data = await res.json();
        if (data.ID) {
            statusDiv.textContent = "Playing Welcome Message...";
            startPolling(data.ID, data.total_chunks);
        }
    } catch (e) {
        console.error("Welcome message error:", e);
    }
}

// 2. Text Chat
async function sendText() {
    const text = textInput.value.trim();
    if (!text) return;

    textInput.value = '';
    statusDiv.textContent = "Thinking...";

    // Using a fixed dummy user/session ID for now as per api spec requirement
    const payload = {
        "userID": 12345,
        "sessionID": 67890,
        "query": text,
        "assistant_id": "2"
    };

    try {
        const res = await fetch('/get_text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        statusDiv.textContent = `AI: ${data.reply.substring(0, 20)}...`;
        startPolling(data.ID, data.total_chunks);

    } catch (e) {
        console.error(e);
        statusDiv.textContent = "Error: " + e.message;
    }
}

// 3. Audio Chat
async function sendAudio() {
    console.log('sendAudio() called. audioChunks length =', audioChunks.length);

    if (!audioChunks || audioChunks.length === 0) {
        console.warn('sendAudio: No audio chunks captured.');
        statusDiv.textContent = 'No audio captured. Please hold the mic button and speak.';
        micBtn.textContent = 'Hold to Talk';
        return;
    }

    // Log individual chunk sizes/types for debugging
    audioChunks.forEach((chunk, idx) => {
        if (chunk) {
            console.log(`sendAudio: chunk[${idx}] size =`, chunk.size, 'type =', chunk.type);
        } else {
            console.log(`sendAudio: chunk[${idx}] is null/undefined`);
        }
    });

    const mimeType = (mediaRecorder && mediaRecorder.mimeType) ? mediaRecorder.mimeType : 'audio/webm';
    console.log('sendAudio: Using blob mimeType =', mimeType);

    const blob = new Blob(audioChunks, { type: mimeType });
    console.log('sendAudio: Final blob size =', blob.size);

    // Guard against ultra-short / empty recordings that will break ASR
    const MIN_BLOB_SIZE = 2000; // bytes; tweak if needed
    if (blob.size < MIN_BLOB_SIZE) {
        console.warn('sendAudio: Blob too small to be valid speech. size =', blob.size);
        statusDiv.textContent = 'Recording too short. Please hold the mic button a bit longer and speak clearly.';
        micBtn.textContent = 'Hold to Talk';
        return;
    }

    const formData = new FormData();
    const ext = mimeType && mimeType.includes('/') ? mimeType.split('/')[1].split(';')[0] : 'webm';
    const filename = `recording.${ext}`;
    formData.append('audio', blob, filename);
    console.log('sendAudio: Sending file to /process-mic. filename =', filename, 'size =', blob.size);

    try {
        const res = await fetch('/process-mic', { method: 'POST', body: formData });
        const data = await res.json();

        console.log('sendAudio: Response from /process-mic =', data);

        if (data.error) throw new Error(data.error);

        statusDiv.textContent = `You: ${data.text} | AI: Generating...`;
        startPolling(data.ID, data.total_chunks);

    } catch (e) {
        console.error('sendAudio error:', e);
        statusDiv.textContent = 'Error: ' + e.message;
    } finally {
        micBtn.textContent = 'Hold to Talk';
    }
}

// --- Playback Logic ---

// function startPolling(jobId, totalChunks) {
//     let currentChunk = 0;
//     const pollInterval = 500; // ms

//     const poll = async () => {
//         if (currentChunk >= totalChunks) {
//             console.log("Polling complete for job", jobId);
//             return;
//         }

//         try {
//             const res = await fetch('/read-file', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify({ ID: jobId, chunk_ID: currentChunk })
//             });

//             if (res.status === 200) {
//                 const data = await res.json();
//                 console.log("Got Chunk", currentChunk, data);
//                 addToQueue(data.audio, data.data);
//                 currentChunk++;
//                 poll(); // Try next chunk immediately
//             } else {
//                 // Not ready, wait
//                 setTimeout(poll, pollInterval);
//             }
//         } catch (e) {
//             console.error("Polling error:", e);
//             setTimeout(poll, pollInterval);
//         }
//     };

//     poll();
// }
function startPolling(jobId, totalChunks) {
    let currentChunk = 0;
    const pollInterval = 500; // ms retry delay when chunk not ready

    const poll = async () => {
        if (currentChunk >= totalChunks) {
            console.log("Polling complete for job", jobId);
            return;
        }

        try {
            const res = await fetch('/read-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ID: jobId, chunk_ID: currentChunk })
            });

            const data = await res.json();
            console.log("Got Chunk", currentChunk, "audio length:", data.audio ? data.audio.length : 0);

            // ✅ KEY FIX: only advance if audio is actually ready
            if (data.audio && data.audio !== "") {
                addToQueue(data.audio, data.data);
                currentChunk++;
                poll(); // Try next chunk immediately
            } else {
                // Chunk not ready yet - retry same chunk after delay
                console.log("Chunk", currentChunk, "not ready, retrying in", pollInterval, "ms");
                setTimeout(poll, pollInterval);
            }

        } catch (e) {
            console.error("Polling error:", e);
            setTimeout(poll, pollInterval);
        }
    };

    poll();
}

function addToQueue(base64Audio, phonemes) {
    audioQueue.push({ audio: base64Audio, phonemes: phonemes });
    processQueue();
}

function processQueue() {
    if (isQueueProcessing || audioQueue.length === 0) return;

    isQueueProcessing = true;
    const item = audioQueue.shift();

    currentPhonemes = {
        mouthCues: item.phonemes || [],
        metadata: item.metadata
    };
    console.log("Playing chunk. Phonemes:", currentPhonemes.mouthCues.length);

    audioPlayer.src = "data:audio/wav;base64," + item.audio;

    audioPlayer.play().then(() => {
        isPlaying = true;
    }).catch(e => {
        console.error("Playback failed (Autoplay?):", e);
        isPlaying = false;
        isQueueProcessing = false;
    });

    audioPlayer.onended = () => {
        isPlaying = false;
        currentPhonemes = null;
        isQueueProcessing = false;
        processQueue(); // Play next
    };
}

// --- Animation Loop ---

function animate() {
    requestAnimationFrame(animate);
    if (!mouthModel) return;

    if (isPlaying && currentPhonemes && currentPhonemes.mouthCues) {
        const time = audioPlayer.currentTime;
        const cue = currentPhonemes.mouthCues.find(c => time >= c.start && time <= c.end);

        // Reset all morphs first
        if (faceMesh && faceMesh.morphTargetDictionary) {
            Object.values(faceMesh.morphTargetDictionary).forEach(idx => {
                faceMesh.morphTargetInfluences[idx] = 0;
            });

            if (cue) {
                const viseme = cue.value;
                const targetName = VISEME_MAP[viseme];
                const targetIdx = faceMesh.morphTargetDictionary[targetName];

                if (targetIdx !== undefined) {
                    faceMesh.morphTargetInfluences[targetIdx] = 1;
                }
            }
        }
    } else {
        // Reset to neutral
        if (faceMesh && faceMesh.morphTargetDictionary) {
            Object.values(faceMesh.morphTargetDictionary).forEach(idx => {
                faceMesh.morphTargetInfluences[idx] = 0;
            });
        }
    }

    renderer.render(scene, camera);
}

// updateModelTransform removed as it's now handled by tracking + loop

// Start
init();