# 🎭 SIMPLE LipSync Avatar - Quick Start Guide

## ✨ What Makes This Simple?

- ✅ **Python backend** (no Node.js!)
- ✅ **Pure HTML/CSS/JavaScript** (no React!)
- ✅ **Just 6 files total**
- ✅ **Works in any browser**

---

## 📁 Files You Have

```
simple_lipsync/
├── app.py              ← Python Flask server
├── requirements.txt    ← Python dependencies (Flask, flask-cors)
├── index.html          ← Frontend webpage
├── app.js              ← JavaScript logic
├── setup.sh            ← Automated setup
└── README.md           ← Full documentation
```

---

## 🚀 3-Step Setup

### Step 1: Install Dependencies
```bash
cd simple_lipsync
pip install -r requirements.txt
```

### Step 2: Run the Server
```bash
python3 app.py
```

### Step 3: Open Browser
```
http://localhost:5000
```

**That's it!** 🎉

---

## 📋 How to Use (In the Browser)

```
1. Click "Audio Input" → Upload your speech file (WAV/MP3)
   ↓
2. Click "Avatar Video" → Upload your video (MP4)
   ↓
3. Click "3D Mouth Model" → Upload your GLB file
   ↓
4. Wait ~5 seconds (automatic phoneme processing)
   ↓
5. Click "▶️ Play" button
   ↓
6. Watch your avatar speak! 🎭
```

---

## 🎯 What You Need

### Before You Start
- ✅ Python 3 (you have this)
- ✅ Rhubarb installed (you have this)
- ⏳ Audio file (your speech)
- ⏳ Video file (your avatar)
- ⏳ 3D mouth model (GLB file)

### File Requirements

**Audio:**
- Format: WAV or MP3
- Duration: Any (start with 5-10 seconds)
- Quality: Clear speech

**Video:**
- Format: MP4 or WebM
- Resolution: 720p or 1080p
- Content: Person facing camera, neutral expression

**3D Model:**
- Format: GLB or GLTF
- Animation: Jaw bone or morph targets
- Size: Under 10MB

---

## 💻 Commands Cheat Sheet

### Start Server
```bash
python3 app.py
```

### Check if Running
```bash
curl http://localhost:5000/health
```

### Stop Server
```
Press Ctrl+C in terminal
```

---

## 🎨 What Happens Behind the Scenes

```
┌─────────────┐
│ Upload Audio│
└──────┬──────┘
       ↓
┌─────────────────────┐
│ Python Flask Server │
└──────┬──────────────┘
       ↓
┌──────────────────┐
│ Rhubarb Analysis │  (Extracts phoneme timing)
└──────┬───────────┘
       ↓
┌────────────────────┐
│ JSON Response      │  {"mouthCues": [...]}
└──────┬─────────────┘
       ↓
┌───────────────────────┐
│ JavaScript Animation  │  (Syncs mouth to audio)
└───────────────────────┘
```

---

## 🔍 Testing Your Setup

### 1. Test Server
```bash
# Terminal 1
python3 app.py

# Terminal 2
curl http://localhost:5000/health
```

**Expected output:**
```json
{
  "status": "ok",
  "rhubarb": {
    "installed": true,
    "version": "Rhubarb Lip Sync version 1.13.0"
  }
}
```

### 2. Test in Browser
1. Open http://localhost:5000
2. You should see the purple gradient page
3. Upload test files
4. Watch the magic happen!

---

## 🐛 Common Issues

### Issue: "Connection refused"
**Solution:** Make sure Python server is running
```bash
python3 app.py
```

### Issue: "Failed to process audio"
**Solution:** Check Rhubarb installation
```bash
rhubarb --version
```

### Issue: "3D model not showing"
**Solution:** Check GLB file is valid
- Visit: https://gltf-viewer.donmccurdy.com
- Drag your GLB file there
- If it doesn't show, your file has issues

### Issue: "Mouth not moving"
**Solution:** Check your GLB model structure
- Your model needs jaw bone or morph targets
- Common bone names: "Jaw", "jaw", "JawBone"
- Check browser console (F12) for errors

---

## 🎓 Understanding Phonemes

The system uses 9 mouth shapes (visemes):

| Code | Sound | Example | Mouth Position |
|------|-------|---------|----------------|
| X    | Rest  | -       | Closed         |
| A    | AI/AY | "say"   | Open           |
| B    | P/B/M | "mom"   | Lips together  |
| C    | EH/AE | "bed"   | Medium open    |
| D    | AA/AO | "father"| Wide open      |
| E    | IH    | "sit"   | Slightly open  |
| F    | U/UW  | "you"   | Rounded        |
| G    | F/V   | "five"  | Teeth on lip   |
| H    | L     | "hello" | Tongue forward |

---

## 📊 File Structure Explained

### app.py (Backend)
- Receives audio uploads
- Runs Rhubarb command
- Returns phoneme JSON
- Serves frontend files

### index.html (Frontend)
- Upload interface
- Video player
- 3D canvas
- Controls

### app.js (Logic)
- Handles file uploads
- Calls backend API
- Animates 3D mouth
- Syncs to audio

---

## 🎯 Next Steps

Once it works:

1. **Customize appearance** - Edit CSS in index.html
2. **Adjust mouth movement** - Change VISEME_MAP values in app.js
3. **Add features** - Export video, save settings, etc.
4. **Create presets** - Save different avatar configurations

---

## 📝 Pro Tips

- ✨ Use short audio clips (5-10s) for testing
- ✨ WAV format works better than MP3
- ✨ Keep browser console open (F12) to see errors
- ✨ Test GLB model separately first
- ✨ Video file doesn't need audio track

---

## 🆘 Need Help?

1. Check README.md for detailed docs
2. Look at browser console (F12)
3. Check Python terminal for errors
4. Verify all files uploaded correctly

---

## 🎉 Success Checklist

- [ ] Python server running (port 5000)
- [ ] Browser shows purple page
- [ ] Audio uploaded (green checkmark)
- [ ] Video uploaded (green checkmark)
- [ ] Model uploaded (green checkmark)
- [ ] "Phoneme data ready" message shown
- [ ] Play button is enabled (not grayed out)
- [ ] Click play → Video and audio sync!

---

**That's it! Much simpler than React, right?** 😊

Made with ❤️ using Python + Flask + Vanilla JavaScript
