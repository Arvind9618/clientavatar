import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * LipSyncRenderer — Clean build based on the working simple_lipsync approach.
 * 
 * Architecture (matches simple_lipsync/app.js):
 * - Video plays directly in HTML (visible, with green screen)
 * - Three.js canvas overlays with alpha: true (transparent background)
 * - GLB face model is positioned/rotated/scaled to follow detected face
 * - Diffuse texture + alpha mask provides inpainting-style blending
 * - Rhubarb viseme data drives morph target animation
 */
export class LipSyncRenderer {
    constructor(canvas, video, basePath = '.') {
        this.canvas = canvas;
        this.video = video; // Store video reference for face tracking
        this.basePath = basePath;

        // Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // GLB model
        this.faceModel = null;
        this.faceMeshes = [];       // Meshes with morph targets
        this.morphTargetMap = {};   // viseme letter → morph target index

        // Video ref (for face tracking)
        // (already assigned from constructor argument: this.video)

        // MediaPipe face tracking
        this.faceMeshDetector = null;
        this.faceResults = null;
        this.isProcessingFace = false;
        this.isTracking = false;

        // Viseme state
        this.targetViseme = 'X';
        this.interpolationSpeed = 15;

        // Config
        this.positionConfig = null;

        // Render loop
        this.animationFrameId = null;
        this.isRendering = false;
        this.clock = new THREE.Clock();
        this.isLoaded = false;
    }

    async init() {
        // Load position config
        try {
            const res = await fetch(this.basePath + '/avatars/position.json');
            this.positionConfig = await res.json();
        } catch (err) {
            this.positionConfig = { positionX: 0, positionY: -1.5, scale: 1 };
        }

        this.video = document.getElementById('avatarVideo');

        // ── Setup Three.js Scene ──────────────────────
        this.scene = new THREE.Scene();

        // Get actual container dimensions (canvas is inside avatar-wrapper, not fullscreen)
        const container = this.canvas.parentElement;
        const rect = container?.getBoundingClientRect();
        const renderW = rect ? rect.width : this.canvas.width;
        const renderH = rect ? rect.height : this.canvas.height;

        // PerspectiveCamera — matches the working simple_lipsync
        this.camera = new THREE.PerspectiveCamera(
            45,
            renderW / renderH,
            0.1,
            1000
        );
        this.camera.position.z = 10;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,      // Transparent background — video shows through
            antialias: true
        });
        this.renderer.setSize(renderW, renderH);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0x000000, 0); // Fully transparent

        // Lighting — matches simple_lipsync
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
        this.scene.add(hemiLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(0, 2, 5);
        this.scene.add(dirLight);

        // ── Load GLB Face Model ──────────────────────
        await this._loadFaceModel();

        // ── Init MediaPipe Face Mesh ─────────────────
        this._initFaceMesh();

        // ── Handle window resize ─────────────────────
        window.addEventListener('resize', () => {
            const r = container?.getBoundingClientRect();
            const w = r ? r.width : this.canvas.width;
            const h = r ? r.height : this.canvas.height;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });

        this.isLoaded = true;
        console.log('[LipSync] ✅ Engine initialized');
    }

    // ─── Load GLB Face Model ─────────────────────────────
    async _loadFaceModel() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(this.basePath + '/avatars/face-model.glb', (gltf) => {
                this.faceModel = gltf.scene;

                // Initial transform (will be overridden by face tracking)
                this.faceModel.position.set(0, 0, 0);
                this.faceModel.scale.setScalar(1);

                // Hide until face tracking positions it
                this.faceModel.visible = false;

                this.faceMeshes = [];

                // Set up textures once
                const texLoader = new THREE.TextureLoader();
                const diffuseTex = texLoader.load(this.basePath + '/avatars/diffuse_indian_f.png');
                diffuseTex.flipY = false;

                const alphaTex = texLoader.load(this.basePath + '/avatars/alpha.png');
                alphaTex.flipY = false;

                this.faceModel.traverse((child) => {
                    if (child.isMesh) {
                        // Apply materials similar to simple_lipsync, but use textures
                        if (child.material) {
                            child.material.map = diffuseTex;
                            child.material.alphaMap = alphaTex;
                            child.material.transparent = true;
                            child.material.color.setHex(0xffffff); // Use exact texture color
                            child.material.roughness = 0.5;
                            child.material.metalness = 0.1;
                            child.material.needsUpdate = true;
                        }

                        if (child.morphTargetInfluences && child.morphTargetDictionary) {
                            if (Object.keys(child.morphTargetDictionary).length > 2) {
                                this.faceMeshes.push(child);
                                if (Object.keys(this.morphTargetMap).length === 0) {
                                    this._buildMorphTargetMap(child.morphTargetDictionary);
                                }
                            }
                        }
                    }
                });

                this.scene.add(this.faceModel);
                console.log('[LipSync] GLB loaded, meshes:', this.faceMeshes.length,
                    'morphs:', this.morphTargetMap);
                resolve();
            }, undefined, (err) => {
                console.error('[LipSync] GLB load failed:', err);
                reject(err);
            });
        });
    }

    // ─── Morph Target Map ────────────────────────────────
    // Maps Rhubarb viseme letters (A-H, X) → morph target indices.
    // GLB morph targets from the working setup: Rest, AE, P_B_M, EE, AA, Ow, F, L
    _buildMorphTargetMap(dict) {
        console.log('[LipSync] GLB morph targets:', JSON.stringify(dict));

        const norm = {};
        for (const [k, v] of Object.entries(dict)) {
            norm[k.toLowerCase().trim()] = v;
        }

        // Corrected mapping matching Rhubarb→GLB from simple_lipsync VISEME_MAP
        const mapping = {
            'A': ['ae', 'v_aa', 'a', 'mouth_close'],          // Rhubarb A → AE
            'B': ['p_b_m', 'pbm', 'b', 'mouth_close'],        // Rhubarb B → P_B_M  
            'C': ['ee', 'v_e', 'c', 'slightly_open'],          // Rhubarb C → EE
            'D': ['aa', 'jaw_open', 'v_ah', 'd', 'mouth_open'],// Rhubarb D → AA
            'E': ['ee', 'ae', 'v_ae', 'e'],                    // Rhubarb E → EE (fallback AE)
            'F': ['ow', 'oo', 'uw', 'pucker', 'v_u'],          // Rhubarb F → Ow
            'G': ['f', 'fv', 'v_f', 'g'],                      // Rhubarb G → F
            'H': ['l', 'v_l', 'h'],                             // Rhubarb H → L
            'X': ['rest', 'neutral', 'idle', 'x', 'base']      // Rhubarb X → Rest
        };

        this.morphTargetMap = {};
        for (const [vis, candidates] of Object.entries(mapping)) {
            for (const name of candidates) {
                if (norm[name] !== undefined) {
                    this.morphTargetMap[vis] = norm[name];
                    console.log(`[LipSync] ${vis} → "${name}" (idx ${norm[name]})`);
                    break;
                }
            }
            if (this.morphTargetMap[vis] === undefined) {
                console.warn(`[LipSync] ⚠️ No morph for viseme ${vis}`);
            }
        }
    }

    // ─── MediaPipe FaceMesh ──────────────────────────────
    _initFaceMesh() {
        if (!window.FaceMesh) {
            console.warn('[LipSync] FaceMesh not available, tracking disabled');
            return;
        }

        try {
            this.faceMeshDetector = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });

            this.faceMeshDetector.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.faceMeshDetector.onResults((results) => {
                this.faceResults = results;
                this.isProcessingFace = false;
                if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                    if (!this._faceLoggedOnce) {
                        console.log('[LipSync] Face detected! Landmarks:', results.multiFaceLandmarks[0].length);
                        this._faceLoggedOnce = true;
                    }
                }
            });

            this.isTracking = true;
            console.log('[LipSync] MediaPipe FaceMesh ready');
        } catch (err) {
            console.error('[LipSync] FaceMesh init error:', err);
        }
    }

    // ─── Set Viseme ──────────────────────────────────────
    setViseme(v) {
        this.targetViseme = v || 'X';
    }

    // ─── Render Control ──────────────────────────────────
    startRendering() {
        this.isRendering = true;
        this.clock.start();
        this._animate();

        // Start separate face tracking loop (matches simple_lipsync pattern)
        this._trackFace();
    }
    stopRendering() {
        this.isRendering = false;
        this.isTracking = false;
    }

    // ─── Separate Face Tracking Loop (from simple_lipsync) ──
    _trackFace() {
        if (!this.isTracking) return;

        // Use readyState >= 2 (have enough data) instead of checking paused,
        // because video may not start until user interaction
        if (this.video && this.video.readyState >= 2 && this.faceMeshDetector && !this.isProcessingFace) {
            this.isProcessingFace = true;

            // Console log to see if it starts sending
            if (!this._firstSendLogged) {
                console.log('[LipSync] Sending first frame to FaceMesh. Video dimensions:', this.video.videoWidth, 'x', this.video.videoHeight);
                this._firstSendLogged = true;
            }

            this.faceMeshDetector.send({ image: this.video })
                .then(() => {
                    this.isProcessingFace = false;
                })
                .catch((err) => {
                    this.isProcessingFace = false;
                    if (!this._sendErrorLogged) {
                        console.error('[LipSync] FaceMesh send() error:', err);
                        this._sendErrorLogged = true;
                    }
                });
        }

        requestAnimationFrame(() => this._trackFace());
    }

    // ─── Animation Loop ──────────────────────────────────
    _animate() {
        if (!this.isRendering) return;
        requestAnimationFrame(() => this._animate());

        // Apply face tracking
        this._applyFaceTracking();

        // Animate morph targets
        this._updateMorphTargets(this.clock.getDelta());

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    // ─── Face Tracking (from simple_lipsync/app.js) ──────
    _applyFaceTracking() {
        if (!this.faceResults?.multiFaceLandmarks?.[0] || !this.faceModel) return;

        // Make model visible now that face tracking is positioning it
        this.faceModel.visible = true;

        const landmarks = this.faceResults.multiFaceLandmarks[0];

        // --- Position: center between eyes → world coords ---
        const leftEyeAnchor = landmarks[33];
        const rightEyeAnchor = landmarks[263];
        const anchorX = (leftEyeAnchor.x + rightEyeAnchor.x) / 2;
        const anchorY = (leftEyeAnchor.y + rightEyeAnchor.y) / 2;

        // MediaPipe returns values 0-1 relative to the exact video dimensions.
        // We must compensate for CSS object-fit: cover which scales and crops the video to the canvas.
        const vidW = this.video.videoWidth;
        const vidH = this.video.videoHeight;

        // Use container dimensions for logic (backing Buffer size might vary with device ratio, but CSS size rules)
        const container = this.canvas.parentElement;
        const rect = container ? container.getBoundingClientRect() : { width: this.canvas.width, height: this.canvas.height };
        const canW = rect.width;
        const canH = rect.height;

        // Calculate how the video is stretched to *cover* the container
        const coverScale = Math.max(canW / vidW, canH / vidH);
        const drawnW = vidW * coverScale;
        const drawnH = vidH * coverScale;

        // Calculate the cropped margins (centered by default)
        const offsetX = (drawnW - canW) / 2;
        const offsetY = (drawnH - canH) / 2;

        // Convert normalized MediaPipe coordinates (0-1) to pixel positions on the scaled drawn video
        let px = anchorX * drawnW;
        let py = anchorY * drawnH;

        // Subtract the crop margins to find the position *on the visible canvas* 
        px = px - offsetX;
        py = py - offsetY;

        // Convert back to normalized device coordinates (-1 to 1) for Three.js camera unprojection
        const ndcX = (px / canW) * 2 - 1;
        const ndcY = -(py / canH) * 2 + 1;

        // Unproject to 3D world space
        const vec = new THREE.Vector3();
        vec.set(ndcX, ndcY, 0.5);
        vec.unproject(this.camera);
        vec.sub(this.camera.position).normalize();
        const distance = -this.camera.position.z / vec.z;
        const pos = new THREE.Vector3();
        pos.copy(this.camera.position).add(vec.multiplyScalar(distance));

        // Apply config offset
        const ox = this.positionConfig?.positionX || 0;
        const oy = this.positionConfig?.positionY || 0;

        this.faceModel.position.x = pos.x + ox;
        this.faceModel.position.y = pos.y + oy;

        // --- Rotation from landmarks ---
        const noseTop = landmarks[10];
        const chin = landmarks[152];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];

        // Roll (Z-axis) from eye angle
        const dEyeY = rightEye.y - leftEye.y;
        const dEyeX = rightEye.x - leftEye.x;
        const roll = Math.atan2(dEyeY, dEyeX);

        // Yaw (Y-axis) from eye Z-depth
        const dEyeZ = rightEye.z - leftEye.z;
        const yaw = Math.atan2(dEyeZ, dEyeX);

        // Pitch (X-axis) from chin/forehead
        const dChinY = chin.y - noseTop.y;
        const dChinZ = chin.z - noseTop.z;
        const pitch = Math.atan2(dChinZ, dChinY);

        this.faceModel.rotation.z = -roll;
        this.faceModel.rotation.y = -yaw * 3;
        this.faceModel.rotation.x = -pitch + 0.2;

        // --- Scale from inter-eye distance ---
        const dx = rightEye.x - leftEye.x;
        const dy = rightEye.y - leftEye.y;
        const eyeWidth = Math.sqrt(dx * dx + dy * dy);

        // Reduced multiplier to avoid oversized model (from 8.0 -> 4.0)
        const autoScale = eyeWidth * 4.0;
        const userScale = Math.max(0.1, this.positionConfig?.scale || 1);
        const targetScale = autoScale * userScale;

        this.faceModel.scale.set(targetScale, targetScale, targetScale);
    }

    // ─── Morph Target Animation ──────────────────────────
    _updateMorphTargets(delta) {
        if (this.faceMeshes.length === 0) return;
        const factor = Math.min(this.interpolationSpeed * delta, 1.0);

        const targetIdx = this.morphTargetMap[this.targetViseme];
        const hasSpecific = targetIdx !== undefined;

        for (const mesh of this.faceMeshes) {
            if (!mesh.morphTargetInfluences) continue;

            let animIdx = targetIdx;
            // Fallback: unknown viseme → use D (open mouth)
            if (!hasSpecific && this.targetViseme !== 'X') {
                animIdx = this.morphTargetMap['D'];
            }

            for (const [vis, idx] of Object.entries(this.morphTargetMap)) {
                let weight = (idx === animIdx) ? 1.0 : 0.0;

                // Micro-variation for liveliness
                if (weight > 0.5 && this.targetViseme !== 'X') {
                    weight += (Math.random() - 0.5) * 0.15;
                }

                mesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(
                    mesh.morphTargetInfluences[idx],
                    Math.max(0, Math.min(1, weight)),
                    factor
                );
            }
        }
    }

    // ─── Utility ─────────────────────────────────────────
    setScale(s) {
        if (this.positionConfig) this.positionConfig.scale = s;
    }

    resize(w, h) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}

export default LipSyncRenderer;
