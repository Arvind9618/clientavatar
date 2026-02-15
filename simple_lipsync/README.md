# LipSync Avatar - Simple Python Version

## 🎯 What You Get

A complete lip-sync avatar system with:
- ✅ **Python Flask backend** (no Node.js needed!)
- ✅ **Pure HTML/CSS/JavaScript frontend** (no React!)
- ✅ **Three.js for 3D rendering**
- ✅ **Rhubarb for phoneme extraction**

## 📁 Project Structure

```
simple_lipsync/
├── app.py              # Python Flask backend
├── requirements.txt    # Python dependencies
├── index.html          # Frontend HTML
├── app.js              # Frontend JavaScript
├── README.md           # This file
├── setup.sh            # Setup script
└── uploads/            # Temporary upload folder (auto-created)
```

## 🚀 Quick Start

### Step 1: Install Python Dependencies

```bash
pip install -r requirements.txt
```

Or manually:
```bash
pip install Flask flask-cors
```

### Step 2: Make Sure Rhubarb is Installed

You already have it! Verify:
```bash
rhubarb --version
```

### Step 3: Run the Server

```bash
python app.py
```

### Step 4: Open Your Browser

Go to: **http://localhost:5000**

## 📋 How to Use

1. **Upload Audio** - Your speech/dialogue file (WAV or MP3)
2. **Upload Video** - Your avatar video (MP4 or WebM)
3. **Upload 3D Model** - Your mouth model (GLB or GLTF)
4. Wait for audio processing (happens automatically)
5. Click **Play** to see the lip-sync in action!

## 🎨 Asset Requirements

### Audio File
- **Format:** WAV (recommended) or MP3
- **Quality:** 16kHz or higher sample rate
- **Content:** Clear speech, minimal background noise

### Video File
- **Format:** MP4 or WebM
- **Resolution:** 720p or 1080p
- **Frame Rate:** 30fps
- **Content:** Person with neutral expression, face forward

### 3D Mouth Model
- **Format:** GLB or GLTF
- **Animation:** Rigged jaw bone OR morph targets
- **Polygon Count:** Under 5000 triangles for best performance
- **Bone Names:** Use "Jaw", "jaw", or "JawBone" for automatic detection

## 🔧 How It Works

```
1. You upload audio → Python Flask receives it
2. Flask runs Rhubarb → Extracts phoneme timeline
3. Frontend receives JSON → Contains mouth cue timings
4. Video plays + Audio plays → Synchronized playback
5. JavaScript animates 3D mouth → Based on phoneme data
```

## 🐛 Troubleshooting

### "Failed to process audio"
- Make sure Python server is running: `python app.py`
- Check that Rhubarb is installed: `rhubarb --version`
- Try using WAV format instead of MP3

### "3D model not loading"
- Verify GLB file is valid (test at https://gltf-viewer.donmccurdy.com)
- Check file size (should be under 10MB)
- Make sure it's GLB format, not separate GLTF files

### "Video/Audio not syncing"
- Ensure both files start at the same time
- Check browser console for errors (F12)
- Try using a shorter audio clip for testing

## 📊 API Endpoints

The Python backend provides these endpoints:

### `GET /health`
Check server and Rhubarb status

### `POST /process-audio`
Upload audio file, returns phoneme data
- **Input:** Audio file (multipart/form-data)
- **Output:** JSON with mouth cues

### `GET /phonemes`
Get phoneme reference information

## 🎯 Next Steps

1. **Test with sample files** - Start with a 5-second audio clip
2. **Adjust mouth animation** - Edit the VISEME_MAP values in app.js
3. **Customize the design** - Modify index.html CSS
4. **Add more features** - Export video, save presets, etc.

## 💡 Tips

- Start with short audio clips (5-10 seconds) for testing
- Use WAV format for best Rhubarb results
- Test your GLB model structure first (check bone/morph target names)
- Keep the browser console open to see any errors
- Video file doesn't need audio (we use separate audio file)

## 🔗 Useful Resources

- Rhubarb: https://github.com/DanielSWolf/rhubarb-lip-sync
- Three.js: https://threejs.org
- Flask: https://flask.palletsprojects.com
- GLB Viewer: https://gltf-viewer.donmccurdy.com

## 📄 License

Free to use and modify!

---

**Simple. Python. No React. No Node.js. Just works!** 🎭
