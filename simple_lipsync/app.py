
from flask import Flask, request, jsonify, send_from_directory, make_response
from flask_cors import CORS
import subprocess
import os
import json
import tempfile
import threading
import time
import base64
from gtts import gTTS
import speech_recognition as sr
from pydub import AudioSegment
import re
import traceback

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
RHUBARB_PATH = 'rhubarb'

# Locate Rhubarb
def find_rhubarb():
    global RHUBARB_PATH
    candidates = [
        'rhubarb', 'rhubarb.exe', './rhubarb.exe',
        'Rhubarb-Lip-Sync-1.14.0-Windows/rhubarb.exe',
        './Rhubarb-Lip-Sync-1.14.0-Windows/rhubarb.exe'
    ]
    for path in candidates:
        try:
            subprocess.run([path, '--version'], capture_output=True, timeout=2)
            RHUBARB_PATH = path
            print(f"✅ Found Rhubarb at: {RHUBARB_PATH}")
            return
        except:
            continue
    print("❌ Rhubarb not found. Ensure it is installed.")

find_rhubarb()

# Simple Job Manager
class JobManager:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def _get_job_dir(self, job_id):
        return os.path.join(self.base_dir, str(job_id))

    def create_job(self, total_chunks=1):
        job_id = str(int(time.time() * 10000))
        job_dir = self._get_job_dir(job_id)
        os.makedirs(job_dir, exist_ok=True)
        
        metadata = {
            "id": job_id,
            "status": "processing",
            "total_chunks": total_chunks,
            "processed_count": 0,
            "created_at": time.time()
        }
        with open(os.path.join(job_dir, "metadata.json"), "w") as f:
            json.dump(metadata, f)
        return job_id

    def save_chunk(self, job_id, index, audio_base64, phonemes):
        job_dir = self._get_job_dir(job_id)
        chunk_file = os.path.join(job_dir, f"chunk_{index}.json")
        
        data = {
            "audio": audio_base64,
            "data": phonemes.get('mouthCues', []),
            "metadata": phonemes.get('metadata', {})
        }
        with open(chunk_file, "w") as f:
            json.dump(data, f)
            
        # Update metadata
        meta_path = os.path.join(job_dir, "metadata.json")
        try:
            with open(meta_path, "r") as f:
                meta = json.load(f)
            meta["processed_count"] += 1
            if meta["processed_count"] >= meta["total_chunks"]:
                meta["status"] = "completed"
            with open(meta_path, "w") as f:
                json.dump(meta, f)
        except:
            pass

    def get_chunk(self, job_id, index):
        chunk_file = os.path.join(self._get_job_dir(job_id), f"chunk_{index}.json")
        if os.path.exists(chunk_file):
            with open(chunk_file, "r") as f:
                return json.load(f)
        return None

job_manager = JobManager(UPLOAD_FOLDER)

def run_rhubarb(wav_path):
    json_out = wav_path + '.json'
    try:
        subprocess.run([RHUBARB_PATH, '-f', 'json', '-o', json_out, wav_path], capture_output=True)
        if os.path.exists(json_out):
            with open(json_out, 'r') as f:
                data = json.load(f)
            os.remove(json_out)
            return data
    except Exception as e:
        print(f"Rhubarb Error: {e}")
    return {"mouthCues": []}

@app.route('/health')
def health():
    return jsonify({"status": "ok"})

@app.route('/process-mic', methods=['POST'])
def process_mic():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio part'}), 400
    file = request.files['audio']
    
    # 1. Save Temp Audio
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        tmp.close()
        audio_path = tmp.name
    
    try:
        file.save(audio_path)
        
        # 2. Convert to consistent WAV (16kHz mono) for reliable ASR/Rhubarb
        converted_path = audio_path + "_conv.wav"
        subprocess.run(['ffmpeg', '-i', audio_path, '-ar', '16000', '-ac', '1', '-y', converted_path], capture_output=True)
        processing_path = converted_path if os.path.exists(converted_path) else audio_path

        # 3. ASR (Speech to Text)
        text = ""
        r = sr.Recognizer()
        try:
            with sr.AudioFile(processing_path) as source:
                audio_data = r.record(source)
                text = r.recognize_google(audio_data)
                print(f"DEBUG: Transcribed: {text}")
        except Exception as e:
            print(f"ASR Error: {e}")
            text = "(Unintelligible)"

        # 4. Rhubarb (Phonemes)
        phonemes = run_rhubarb(processing_path)

        # 5. Base64 Audio
        with open(processing_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode('utf-8')

        # 6. Save Job (Single Chunk)
        job_id = job_manager.create_job(total_chunks=1)
        job_manager.save_chunk(job_id, 0, audio_b64, phonemes)

        return jsonify({
            "ID": str(job_id),
            "text": text,
            "reply": "Echo: " + text, # No LLM for now
            "status": "processing",
            "total_chunks": 1
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(audio_path): os.remove(audio_path)
        # converted_path might be removed by Rhubarb logic or left

@app.route('/talk', methods=['POST'])
def talk():
    data = request.json
    text = data.get('text', '')
    
    # 1. TTS
    try:
        tts = gTTS(text=text, lang='en')
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp:
            tmp.close()
            mp3_path = tmp.name
        tts.save(mp3_path)
        
        # Convert to WAV
        wav_path = mp3_path.replace('.mp3', '.wav')
        subprocess.run(['ffmpeg', '-i', mp3_path, '-y', wav_path], capture_output=True)
        
        # 2. Rhubarb
        phonemes = run_rhubarb(wav_path)
        
        # 3. Base64
        with open(wav_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode('utf-8')
            
        # 4. Save Job
        job_id = job_manager.create_job(total_chunks=1)
        job_manager.save_chunk(job_id, 0, audio_b64, phonemes)
        
        if os.path.exists(mp3_path): os.remove(mp3_path)
        if os.path.exists(wav_path): os.remove(wav_path)

        return jsonify({
            "ID": str(job_id),
            "status": "processing",
            "total_chunks": 1
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_chunk', methods=['POST'])
def get_chunk():
    data = request.json
    job_id = data.get('ID') or data.get('taskId')
    meta_path = os.path.join(UPLOAD_FOLDER, str(job_id), 'metadata.json')
    
    if os.path.exists(meta_path):
        with open(meta_path, 'r') as f:
            meta = json.load(f)
        return jsonify({"total_chunk": meta['total_chunks']})
    
    print(f"ERROR: Job {job_id} not found.")
    return jsonify({'error': 'Job not found'}), 404

@app.route('/read-file', methods=['POST'])
def read_file():
    data = request.json
    job_id = data.get('ID') or data.get('taskId')
    chunk_idx = data.get('chunk_ID') 
    if chunk_idx is None: chunk_idx = data.get('chunkIdx', 0)
    
    chunk = job_manager.get_chunk(job_id, chunk_idx)
    if chunk:
        return jsonify({
            "audio": chunk['audio'],
            "taskId": f"{job_id}_{chunk_idx}",
            "data": chunk['data']
        })
        
    return jsonify({'error': 'Chunk not ready'}), 404

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    resp = make_response(send_from_directory('.', path))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return resp

if __name__ == '__main__':
    app.run(debug=True, port=8000, host='0.0.0.0')
