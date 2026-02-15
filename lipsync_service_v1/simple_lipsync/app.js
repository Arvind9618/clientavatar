// Updated app.js for YOUR SPECIFIC MOUTH MODEL
// This maps Rhubarb phonemes to your model's morph targets

// LipSync Avatar - Frontend JavaScript

// State management
const state = {
    audioFile: null,
    videoFile: null,
    modelFile: null,
    phonemeData: null,
    isPlaying: false,
    scene: null,
    camera: null,
    renderer: null,
    mouthModel: null,
    animationFrameId: null,
    faceMesh: null,    // Store face mesh separately
    teethMesh: null    // Store teeth mesh separately
};

// ============================================
// CUSTOMIZED MAPPING FOR YOUR MODEL
// ============================================

// Your model has these morph targets:
// F, L, Ow, ER, AA, AE, EE, Rest, P_B_M, Default

// Rhubarb Viseme to Your Morph Target Mapping
const VISEME_TO_MORPH_MAP = {
    'X': 'Rest',      // Rest position - mouth closed
    'A': 'AE',        // AI/AY sounds - "say", "bake"
    'B': 'P_B_M',     // P/B/M sounds - "mom", "pop"
    'C': 'EE',        // EH/AE sounds - "bed", "cat"
    'D': 'AA',        // AA/AO sounds - "father", "lot"
    'E': 'EE',        // IH sounds - "sit", "bit"
    'F': 'Ow',        // U/UW sounds - "you", "boot"
    'G': 'F',         // F/V sounds - "five", "very"
    'H': 'L'          // L sounds - "hello", "lot"
};

// Optional: Blend multiple morph targets for more realism
const ADVANCED_MORPH_MAP = {
    'X': [
        { name: 'Rest', weight: 1.0 }
    ],
    'A': [
        { name: 'AE', weight: 0.8 },
        { name: 'AA', weight: 0.2 }
    ],
    'B': [
        { name: 'P_B_M', weight: 1.0 }
    ],
    'C': [
        { name: 'EE', weight: 0.7 },
        { name: 'AE', weight: 0.3 }
    ],
    'D': [
        { name: 'AA', weight: 1.0 }
    ],
    'E': [
        { name: 'EE', weight: 1.0 }
    ],
    'F': [
        { name: 'Ow', weight: 1.0 }
    ],
    'G': [
        { name: 'F', weight: 1.0 }
    ],
    'H': [
        { name: 'L', weight: 1.0 }
    ]
};

// DOM Elements
const audioInput = document.getElementById('audioInput');
const videoInput = document.getElementById('videoInput');
const modelInput = document.getElementById('modelInput');
const audioStatus = document.getElementById('audioStatus');
const videoStatus = document.getElementById('videoStatus');
const modelStatus = document.getElementById('modelStatus');
const phonemeStatus = document.getElementById('phonemeStatus');
const loadingIndicator = document.getElementById('loadingIndicator');
const videoContainer = document.getElementById('videoContainer');
const placeholder = document.getElementById('placeholder');
const videoPlayer = document.getElementById('videoPlayer');
const audioPlayer = document.getElementById('audioPlayer');
const canvas3d = document.getElementById('canvas3d');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const timeDisplay = document.getElementById('timeDisplay');
const transformControls = document.getElementById('transformControls');
const scaleControl = document.getElementById('scaleControl');
const scaleVal = document.getElementById('scaleVal');
const posXControl = document.getElementById('posXControl');
const posXVal = document.getElementById('posXVal');
const posYControl = document.getElementById('posYControl');
const posYVal = document.getElementById('posYVal');
const rotZControl = document.getElementById('rotZControl');
const rotZVal = document.getElementById('rotZVal');
const resetTransformBtn = document.getElementById('resetTransformBtn');

// Initialize Three.js scene
function initThreeJS() {
    const canvas = canvas3d;

    state.scene = new THREE.Scene();
    state.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    state.camera.position.z = 5;

    state.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        precision: 'highp'
    });
    state.renderer.setPixelRatio(window.devicePixelRatio);

    // Initial size handle
    resizeCanvasToDisplaySize();
    state.renderer.setClearColor(0x000000, 0);

    // Better color accuracy
    state.renderer.outputEncoding = THREE.sRGBEncoding;

    // Lights - Boosted for visibility
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x888888, 1.5);
    state.scene.add(hemisphereLight);

    const pointLight = new THREE.PointLight(0xffffff, 2.0);
    pointLight.position.set(0, 0, 5);
    state.scene.add(pointLight);

    const fillLight = new THREE.PointLight(0xffffff, 1.5);
    fillLight.position.set(-2, 1, 3);
    state.scene.add(fillLight);

    state.renderer.render(state.scene, state.camera);
}

// Load GLB model
function loadGLBModel(file) {
    const reader = new FileReader();

    reader.onload = function (event) {
        const loader = new THREE.GLTFLoader();

        loader.parse(event.target.result, '', function (gltf) {
            if (state.mouthModel) {
                state.scene.remove(state.mouthModel);
            }

            state.mouthModel = gltf.scene;

            // Auto-center the model geometry (Mouth center to 0,0,0)
            const box = new THREE.Box3().setFromObject(state.mouthModel);
            const center = box.getCenter(new THREE.Vector3());
            state.mouthModel.position.x += (state.mouthModel.position.x - center.x);
            state.mouthModel.position.y += (state.mouthModel.position.y - center.y);
            state.mouthModel.position.z += (state.mouthModel.position.z - center.z);

            // Apply current transform settings
            const scale = parseFloat(scaleControl.value);
            const px = parseFloat(posXControl.value);
            const py = parseFloat(posYControl.value);
            const rz = parseFloat(rotZControl.value) * (Math.PI / 180);

            state.mouthModel.position.set(px, py, 0);
            state.mouthModel.scale.set(scale, scale, scale);
            state.mouthModel.rotation.z = rz;

            // Find Face and Teeth meshes
            state.mouthModel.traverse((child) => {
                if (child.isMesh) {
                    console.log('DEBUG: Found mesh:', child.name);
                    console.log('DEBUG: Visibility:', child.visible);
                    console.log('DEBUG: Material:', child.material ? child.material.name : 'none');
                    console.log('DEBUG: Morph targets:', child.morphTargetDictionary);

                    // Ensure mesh is visible
                    child.visible = true;
                    if (child.material) {
                        child.material.transparent = false;
                        child.material.opacity = 1.0;
                        child.material.side = THREE.DoubleSide; // Help with interior visibility
                    }

                    // Store references to Face and Teeth meshes
                    if (child.name === 'Face' || child.name.toLowerCase().includes('face')) {
                        state.faceMesh = child;
                        console.log('DEBUG: Face mesh stored');
                    }
                    if (child.name === 'Teeth' || child.name.toLowerCase().includes('teeth')) {
                        state.teethMesh = child;
                        console.log('DEBUG: Teeth mesh stored');
                    }
                }
            });

            state.scene.add(state.mouthModel);
            state.renderer.render(state.scene, state.camera);

            showStatus(modelStatus, 'success', '✓ 3D model loaded with morph targets!');
            checkReadyToPlay();
        }, function (error) {
            console.error('Error loading GLB:', error);
            showStatus(modelStatus, 'error', '✗ Failed to load 3D model');
        });
    };

    reader.readAsArrayBuffer(file);
}

// Process audio with backend
async function processAudio(file) {
    showStatus(audioStatus, 'processing', '⏳ Processing audio with Rhubarb...');
    loadingIndicator.classList.add('active');

    const formData = new FormData();
    formData.append('audio', file);

    try {
        const response = await fetch('http://localhost:5000/process-audio', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Processing failed');
        }

        const data = await response.json();
        state.phonemeData = data;

        showStatus(audioStatus, 'success', '✓ Audio processed successfully');
        showStatus(phonemeStatus, 'success',
            `✓ Phoneme data ready • ${data.mouthCues.length} mouth cues • Duration: ${data.metadata.duration.toFixed(2)}s`);

        checkReadyToPlay();

    } catch (error) {
        console.error('Error processing audio:', error);
        showStatus(audioStatus, 'error', '✗ Failed to process audio: ' + error.message);
        showStatus(phonemeStatus, 'error', 'Make sure Python backend is running: python3 app.py');
    } finally {
        loadingIndicator.classList.remove('active');
    }
}

// Get current viseme based on time
function getCurrentViseme(time) {
    if (!state.phonemeData) return 'X';

    const cue = state.phonemeData.mouthCues.find(
        c => time >= c.start && time < c.end
    );

    return cue ? cue.value : 'X';
}

// ============================================
// MAIN ANIMATION FUNCTION - CUSTOMIZED FOR YOUR MODEL
// ============================================

function animateMouth(viseme) {
    if (!state.mouthModel) return;

    // Use simple mapping (easier)
    animateMouthSimple(viseme);

    // OR use advanced blending (more realistic)
    // animateMouthAdvanced(viseme);
}

// Simple version - One morph target per viseme
function animateMouthSimple(viseme) {
    const morphName = VISEME_TO_MORPH_MAP[viseme];

    // Animate Face mesh
    if (state.faceMesh && state.faceMesh.morphTargetDictionary) {
        // Reset all morph targets to 0
        Object.keys(state.faceMesh.morphTargetDictionary).forEach(key => {
            const index = state.faceMesh.morphTargetDictionary[key];
            state.faceMesh.morphTargetInfluences[index] = 0;
        });

        // Set the current viseme to 1.0
        if (morphName && state.faceMesh.morphTargetDictionary[morphName] !== undefined) {
            const index = state.faceMesh.morphTargetDictionary[morphName];
            state.faceMesh.morphTargetInfluences[index] = 1.0;
        }
    }

    // Animate Teeth mesh (same morph targets)
    if (state.teethMesh && state.teethMesh.morphTargetDictionary) {
        Object.keys(state.teethMesh.morphTargetDictionary).forEach(key => {
            const index = state.teethMesh.morphTargetDictionary[key];
            state.teethMesh.morphTargetInfluences[index] = 0;
        });

        if (morphName && state.teethMesh.morphTargetDictionary[morphName] !== undefined) {
            const index = state.teethMesh.morphTargetDictionary[morphName];
            state.teethMesh.morphTargetInfluences[index] = 1.0;
        }
    }
}

// Advanced version - Blend multiple morph targets
function animateMouthAdvanced(viseme) {
    const morphBlends = ADVANCED_MORPH_MAP[viseme];
    if (!morphBlends) return;

    // Animate Face mesh
    if (state.faceMesh && state.faceMesh.morphTargetDictionary) {
        // Reset all
        Object.keys(state.faceMesh.morphTargetDictionary).forEach(key => {
            const index = state.faceMesh.morphTargetDictionary[key];
            state.faceMesh.morphTargetInfluences[index] = 0;
        });

        // Apply blends
        morphBlends.forEach(blend => {
            if (state.faceMesh.morphTargetDictionary[blend.name] !== undefined) {
                const index = state.faceMesh.morphTargetDictionary[blend.name];
                state.faceMesh.morphTargetInfluences[index] = blend.weight;
            }
        });
    }

    // Animate Teeth mesh
    if (state.teethMesh && state.teethMesh.morphTargetDictionary) {
        Object.keys(state.teethMesh.morphTargetDictionary).forEach(key => {
            const index = state.teethMesh.morphTargetDictionary[key];
            state.teethMesh.morphTargetInfluences[index] = 0;
        });

        morphBlends.forEach(blend => {
            if (state.teethMesh.morphTargetDictionary[blend.name] !== undefined) {
                const index = state.teethMesh.morphTargetDictionary[blend.name];
                state.teethMesh.morphTargetInfluences[index] = blend.weight;
            }
        });
    }
}

// Animation loop
function animate() {
    if (!state.isPlaying) return;

    const currentTime = audioPlayer.currentTime;
    timeDisplay.textContent = currentTime.toFixed(2) + 's';

    const viseme = getCurrentViseme(currentTime);
    animateMouth(viseme);

    state.renderer.render(state.scene, state.camera);
    state.animationFrameId = requestAnimationFrame(animate);
}

// Play/Pause controls
function play() {
    if (!state.audioFile || !state.videoFile || !state.phonemeData) {
        alert('Please upload all files and wait for audio processing');
        return;
    }

    state.isPlaying = true;
    audioPlayer.play();
    videoPlayer.play();

    playBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';

    animate();
}

function pause() {
    state.isPlaying = false;
    audioPlayer.pause();
    videoPlayer.pause();

    playBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';

    if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
    }
}

function showStatus(element, type, message) {
    element.className = 'status ' + type;
    element.textContent = message;
}

function resizeCanvasToDisplaySize() {
    const canvas = state.renderer.domElement;
    const width = videoContainer.clientWidth;
    const height = videoContainer.clientHeight;

    if (width > 0 && height > 0) {
        // Preserve sharp rendering with pixel ratio
        const pixelRatio = window.devicePixelRatio || 1;

        // Set the internal resolution (high res for sharpness)
        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;

        // Set the display size (CSS)
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        state.renderer.setSize(width * pixelRatio, height * pixelRatio, false);
        state.camera.aspect = width / height;
        state.camera.updateProjectionMatrix();
        console.log(`Canvas resized: ${width}x${height} (internal: ${width * pixelRatio}x${height * pixelRatio})`);
    }
}

function checkReadyToPlay() {
    const ready = state.audioFile && state.videoFile && state.phonemeData && state.mouthModel;
    playBtn.disabled = !ready;

    if (ready) {
        placeholder.style.display = 'none';
        videoContainer.style.display = 'block';
        transformControls.style.display = 'grid';
    }
}

// Event Listeners
audioInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        state.audioFile = file;
        audioPlayer.src = URL.createObjectURL(file);
        processAudio(file);
    }
});

videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        state.videoFile = file;
        videoPlayer.src = URL.createObjectURL(file);

        videoPlayer.onloadedmetadata = () => {
            showStatus(videoStatus, 'success', '✓ Video loaded');
            resizeCanvasToDisplaySize();
            checkReadyToPlay();
        };
    }
});

modelInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        state.modelFile = file;
        loadGLBModel(file);
    }
});

playBtn.addEventListener('click', play);
pauseBtn.addEventListener('click', pause);

// Transform Event Listeners
scaleControl.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    scaleVal.textContent = val.toFixed(1);
    if (state.mouthModel) {
        state.mouthModel.scale.set(val, val, val);
        state.renderer.render(state.scene, state.camera);
    }
});

posXControl.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    posXVal.textContent = val.toFixed(2);
    if (state.mouthModel) {
        state.mouthModel.position.x = val;
        state.renderer.render(state.scene, state.camera);
    }
});

posYControl.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    posYVal.textContent = val.toFixed(2);
    if (state.mouthModel) {
        state.mouthModel.position.y = val;
        state.renderer.render(state.scene, state.camera);
    }
});

rotZControl.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    rotZVal.textContent = val + '°';
    if (state.mouthModel) {
        state.mouthModel.rotation.z = val * (Math.PI / 180);
        state.renderer.render(state.scene, state.camera);
    }
});

resetTransformBtn.addEventListener('click', () => {
    scaleControl.value = 0.5;
    posXControl.value = 0;
    posYControl.value = 0;
    rotZControl.value = 0;

    scaleVal.textContent = "0.5";
    posXVal.textContent = "0.0";
    posYVal.textContent = "0.0";
    rotZVal.textContent = "0°";

    if (state.mouthModel) {
        state.mouthModel.scale.set(0.5, 0.5, 0.5);
        state.mouthModel.position.set(0, 0, 0);
        state.mouthModel.rotation.z = 0;
        state.renderer.render(state.scene, state.camera);
    }
});

audioPlayer.addEventListener('ended', () => {
    pause();
    audioPlayer.currentTime = 0;
    videoPlayer.currentTime = 0;
    timeDisplay.textContent = '0.00s';
});

// Initialize on load
window.addEventListener('load', () => {
    initThreeJS();
    console.log('LipSync Avatar initialized');
    console.log('Model morph target mapping:');
    console.log('Rhubarb → Your Model');
    Object.keys(VISEME_TO_MORPH_MAP).forEach(key => {
        console.log(`  ${key} → ${VISEME_TO_MORPH_MAP[key]}`);
    });
});