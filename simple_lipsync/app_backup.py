
"""
LipSync Avatar - Python Backend Server (Full Feature Backup)
Uses Flask to handle audio processing with Rhubarb, Gemini LLM, and gTTS.
File-based storage for persistence.
"""

from flask import Flask, request, jsonify, send_from_directory, make_response
from flask_cors import CORS
import subprocess
import os
import json
from werkzeug.utils import secure_filename
import tempfile
import threading
import uuid
import base64
import time
from gtts import gTTS
import google.generativeai as genai
from pydub import AudioSegment
from dotenv import load_dotenv
import re
import concurrent.futures
import speech_recognition as sr
import shutil
import traceback

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_AUDIO_EXTENSIONS = {'wav', 'mp3', 'ogg', 'webm'} 
RHUBARB_PATH = 'rhubarb'

# Gemini Configuration
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
    # Using the flash model as requested/validated
    model = genai.GenerativeModel('gemini-2.0-flash')
else:
    print("WARNING: GOOGLE_API_KEY not found. /get_text and /process-mic will fail.")
    model = None

# Welcome Message Configuration
WELCOME_CONFIG = {
    "ID": "17707462847981",
    "text": "Hello, I'm GIA.  I'm your virtual assistant, here to help you with anything you need, feel free to ask your question, and I'll do my best to assist you!",
    "avatar": "09122024",
    "lang": "en-US"
}

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

# Job Manager (File Based)
class FileJobManager:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def _get_job_dir(self, job_id):
        return os.path.join(self.base_dir, str(job_id))

    def create_job(self, total_sentences, job_id=None):
        # Generate numeric ID if not provided
        if job_id is None:
            job_id = str(int(time.time() * 10000))
        else:
            job_id = str(job_id)

        job_dir = self._get_job_dir(job_id)
        os.makedirs(job_dir, exist_ok=True)
        
        # Save metadata
        metadata = {
            "id": job_id,
            "status": "processing",
            "total_chunks": total_sentences,
            "processed_count": 0,
            "created_at": time.time()
        }
        with open(os.path.join(job_dir, "metadata.json"), "w") as f:
            json.dump(metadata, f)
            
        print(f"DEBUG: Created Job {job_id} at {job_dir}")
        return job_id

    def update_chunk(self, job_id, index, audio_base64, phoneme_data):
        job_dir = self._get_job_dir(job_id)
        if not os.path.exists(job_dir):
            return False
            
        # Save chunk data
        chunk_file = os.path.join(job_dir, f"chunk_{index}.json")
        data = {
            "audio": audio_base64,
            "data": phoneme_data.get('mouthCues', []),
            "metadata": phoneme_data.get('metadata', {})
        }
        with open(chunk_file, "w") as f:
            json.dump(data, f)
            
        # Update metadata processed count
        meta_path = os.path.join(job_dir, "metadata.json")
        try:
            with open(meta_path, "r") as f:
                meta = json.load(f)
            meta["processed_count"] += 1
            if meta["processed_count"] >= meta["total_chunks"]:
                meta["status"] = "completed"
            with open(meta_path, "w") as f:
                json.dump(meta, f)
        except Exception as e:
            print(f"Error updating metadata for {job_id}: {e}")
            
        return True

    def get_job_status(self, job_id):
        job_dir = self._get_job_dir(job_id)
        meta_path = os.path.join(job_dir, "metadata.json")
        if not os.path.exists(meta_path):
            return None
            
        with open(meta_path, "r") as f:
            return json.load(f)

    def get_chunk(self, job_id, index):
        job_dir = self._get_job_dir(job_id)
        chunk_file = os.path.join(job_dir, f"chunk_{index}.json")
        if not os.path.exists(chunk_file):
            return None
            
        with open(chunk_file, "r") as f:
            return json.load(f)

    def list_jobs(self):
        try:
            return os.listdir(self.base_dir)
        except:
            return []

job_manager = FileJobManager(UPLOAD_FOLDER)

# Helper Functions
def split_text_into_sentences(text):
    sentences = re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s', text)
    return [s.strip() for s in sentences if s.strip()]

def process_single_chunk(job_id, index, sentence):
    try:
        print(f"DEBUG: Processing chunk {index} for job {job_id}: '{sentence}'")
        # TTS
        tts = gTTS(text=sentence, lang='en')
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp:
            tmp.close()
            mp3_path = tmp.name
        tts.save(mp3_path)
        
        # Convert to WAV
        wav_path = mp3_path.replace('.mp3', '.wav')
        try:
            audio = AudioSegment.from_mp3(mp3_path)
            audio.export(wav_path, format="wav")
        except:
            wav_path = mp3_path # Fallback
            
        # Rhubarb
        phoneme_data = {"mouthCues": [], "metadata": {"duration": 0}}
        json_out = wav_path + '.json'
        try:
            subprocess.run([RHUBARB_PATH, '-f', 'json', '-o', json_out, wav_path], 
                           capture_output=True, timeout=60)
            if os.path.exists(json_out):
                with open(json_out, 'r') as f:
                    phoneme_data = json.load(f)
                os.remove(json_out)
        except Exception as e:
            print(f"Rhubarb error: {e}")
            
        # Read Audio
        read_path = wav_path if os.path.exists(wav_path) else mp3_path
        with open(read_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode('utf-8')
            
        # Store
        job_manager.update_chunk(job_id, index, audio_b64, phoneme_data)
        print(f"DEBUG: Chunk {index} saved for job {job_id}")
        
        # Cleanup
        if os.path.exists(mp3_path): os.remove(mp3_path)
        if os.path.exists(wav_path) and wav_path != mp3_path: os.remove(wav_path)
        
    except Exception as e:
        print(f"Chunk processing error: {e}")

def process_tts_job(job_id, text):
    try:
        sentences = split_text_into_sentences(text)
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(process_single_chunk, job_id, i, s) for i, s in enumerate(sentences)]
            concurrent.futures.wait(futures)
        print(f"DEBUG: Job {job_id} completed processing.")
    except Exception as e:
        print(f"DEBUG: Job {job_id} failed: {e}")

# Welcome Message Cache Logic
def ensure_welcome_message():
    job_id = WELCOME_CONFIG["ID"]
    # Check if exists
    status = job_manager.get_job_status(job_id)
    if status and status.get("status") == "completed":
        print(f"DEBUG: Welcome message {job_id} already validated and ready.")
        return

    print(f"DEBUG: Generating Welcome Message {job_id}...")
    text = WELCOME_CONFIG["text"]
    
    # Manually prepare job directory to force specific ID
    job_dir = job_manager._get_job_dir(job_id)
    os.makedirs(job_dir, exist_ok=True)
    
    sentences = split_text_into_sentences(text)
    metadata = {
        "id": job_id,
        "status": "processing",
        "total_chunks": len(sentences),
        "processed_count": 0,
        "created_at": time.time()
    }
    
    with open(os.path.join(job_dir, "metadata.json"), "w") as f:
        json.dump(metadata, f)
        
    # Process chunks directly
    process_tts_job(job_id, text)
    print(f"DEBUG: Welcome message {job_id} generation complete.")

# Trigger cache check in background on startup
threading.Thread(target=ensure_welcome_message).start()


# Endpoints
@app.route('/health')
def health():
    return jsonify({"status": "ok", "rhubarb": RHUBARB_PATH})

@app.route('/get_text', methods=['POST'])
def get_text():
    """
    Payload:
    {
        "userID": 825313070771,
        "sessionID": 13534566470771,
        "query": "what is llm",
        "assistant_id": "2"
    }
    """
    data = request.json or {}
    query = data.get('query')
    
    if not query:
        return jsonify({'error': 'No query provided'}), 400
        
    print(f"DEBUG: /get_text Query: {query} - Payload: {data}")
    
    # LLM Interaction
    try:
        if not model:
            raise Exception("LLM not configured")
            
        print("DEBUG: Calling Gemini...")
        response = model.generate_content(query)
        reply_text = response.text
        print(f"DEBUG: LLM Reply: '{reply_text}'")
        
        # Start TTS Job
        sentences = split_text_into_sentences(reply_text)
        job_id = job_manager.create_job(len(sentences), job_id=data.get('ID'))
        
        t = threading.Thread(target=process_tts_job, args=(job_id, reply_text))
        t.daemon = True
        t.start()
        
        print(f"DEBUG: /get_text responding with ID: {job_id}")
        return jsonify({
            "ID": str(job_id),
            "text": query,
            "reply": reply_text,
            "generated_text": reply_text,
            "status": "processing",
            "total_chunks": len(sentences)
        })
        
    except Exception as e:
        print(f"ERROR: /get_text failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/process-mic', methods=['POST'])
def process_mic():
    if 'audio' not in request.files:
        print("ERROR: /process-mic - No audio file in request")
        return jsonify({'error': 'No audio file'}), 400
        
    file = request.files['audio']
    # Save temp
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        tmp.close()
        tmp_path = tmp.name
        
    try:
        file.save(tmp_path)
        print(f"DEBUG: Saved mic audio to {tmp_path}. Size: {os.path.getsize(tmp_path)} bytes")
        
        # Convert to WAV/PCM for SpeechRecognition
        wav_path = tmp_path + "_converted.wav"
        subprocess.run(['ffmpeg', '-i', tmp_path, '-y', wav_path], capture_output=True)
        
        use_path = wav_path if os.path.exists(wav_path) and os.path.getsize(wav_path) > 0 else tmp_path
        print(f"DEBUG: Using audio file: {use_path}")

        print("DEBUG: Starting ASR...")
        # ASR
        r = sr.Recognizer()
        with sr.AudioFile(use_path) as source:
            audio_data = r.record(source)
            text = r.recognize_google(audio_data)
        
        print(f"DEBUG: ASR Result: '{text}'")

        # LLM
        if not model: 
            print("ERROR: LLM model not initialized")
            raise Exception("LLM not configured")
            
        print("DEBUG: Calling Gemini...")
        response = model.generate_content(text)
        reply_text = response.text
        print(f"DEBUG: LLM Reply: '{reply_text}'")
        
        # TTS Job
        sentences = split_text_into_sentences(reply_text)
        job_id = job_manager.create_job(len(sentences))
        
        t = threading.Thread(target=process_tts_job, args=(job_id, reply_text))
        t.daemon = True
        t.start()
        
        return jsonify({
            "ID": str(job_id), # Ensure string
            "text": text,
            "reply": reply_text,
            "status": "processing",
            "total_chunks": len(sentences)
        })
        
    except sr.UnknownValueError:
        print("ERROR: ASR could not understand audio")
        return jsonify({'error': 'Could not understand audio'}), 400
    except sr.RequestError as e:
        print(f"ERROR: ASR Service error: {e}")
        return jsonify({'error': f'ASR Error: {e}'}), 500
    except Exception as e:
        print(f"ERROR: /process-mic exception:")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(tmp_path): 
            try: os.remove(tmp_path)
            except: pass

@app.route('/talk', methods=['POST'])
def talk():
    data = request.json or {}
    req_id = str(data.get('ID', ''))
    print(f"DEBUG: /talk - Payload: {data}")
    # Welcome Message Intercept
    if req_id == WELCOME_CONFIG["ID"]:
        print("DEBUG: Request for Welcome Message")
        status = job_manager.get_job_status(req_id)
        
        # If not ready (should be done by startup, but just in case), trigger it
        if not status or status.get('status') != 'completed':
             ensure_welcome_message()
             status = job_manager.get_job_status(req_id)
             
        return jsonify({
            "ID": req_id,
            "text": WELCOME_CONFIG["text"],
            "status": status.get('status', 'processing') if status else 'processing',
            "processed_chunks": status.get('processed_count', 0) if status else 0,
            "total_chunks": status.get('total_chunks', 0) if status else 0
        })

    text = data.get('text')
    if not text: return jsonify({'error': 'No text'}), 400
    
    sentences = split_text_into_sentences(text)
    # Use the client provided ID or generate one
    job_id = job_manager.create_job(len(sentences), job_id=data.get('ID'))
    
    t = threading.Thread(target=process_tts_job, args=(job_id, text))
    t.daemon = True
    t.start()
    
    print(f"DEBUG: /talk responding with ID: {job_id}")
    return jsonify({
        "ID": str(job_id), # Ensure string
        "status": "processing",
        "processed_chunks": 0,
        "total_chunks": len(sentences),
        "reply": text,
        "generated_text": text
    })

@app.route('/get_chunk', methods=['POST'])
def get_chunk():
    data = request.json or {}
    print(f"DEBUG: /get_chunk - Payload: {data}")
    job_id = data.get('ID') or data.get('taskId')
    if not job_id: 
        print(f"ERROR: /get_chunk - No ID in {data}")
        return jsonify({'error': 'No ID'}), 400
    
    # Handle Welcome Message specifically
    if str(job_id) == str(WELCOME_CONFIG["ID"]):
        print("DEBUG: /get_chunk - Request for Welcome Message")
        status = job_manager.get_job_status(job_id)
        if not status or status.get('status') != 'completed':
             ensure_welcome_message()
             status = job_manager.get_job_status(job_id)
        if status:
            return jsonify({"total_chunk": status['total_chunks']})

    status = job_manager.get_job_status(job_id)
    if not status: 
        print(f"ERROR: /get_chunk - Job {job_id} not found. Available: {job_manager.list_jobs()}")
        return jsonify({'error': 'Job not found'}), 404
    
    return jsonify({"total_chunk": status['total_chunks']})

@app.route('/read-file', methods=['POST'])
def read_file():
    data = request.json or {}
    print(f"DEBUG: /read-file - Payload: {data}")
    job_id = data.get('ID') or data.get('taskId')
    chunk_idx = data.get('chunk_ID') 
    if chunk_idx is None: chunk_idx = data.get('chunkIdx')
    
    if not job_id: 
        print(f"ERROR: /read-file - No ID in {data}")
        return jsonify({'error': 'No ID'}), 400
    
    # Handle Welcome Message specifically
    if str(job_id) == str(WELCOME_CONFIG["ID"]):
        status = job_manager.get_job_status(job_id)
        if not status or status.get('status') != 'completed':
             print("DEBUG: /read-file - Triggering Welcome Message generation")
             ensure_welcome_message()
    
    if chunk_idx is None:
        print(f"ERROR: /read-file - Invalid params: {data}")
        return jsonify({'error': 'ID and chunk_ID required'}), 400

    chunk = job_manager.get_chunk(job_id, chunk_idx)
    if not chunk: 
        # print((f"DEBUG: /read-file - Chunk {chunk_idx} for Job {job_id} not ready"))
        return jsonify({
            "audio": "",
            "taskId": f"{job_id}_{chunk_idx}",
            "data": []
        })
    
    return jsonify({
        "audio": chunk['audio'],
        "taskId": f"{job_id}_{chunk_idx}",
        "data": chunk['data']
    })

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    response = make_response(send_from_directory('.', path))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

if __name__ == '__main__':
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.run(debug=True, port=8088, host='0.0.0.0')
