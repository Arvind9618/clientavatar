
import os
import subprocess
import speech_recognition as sr
import google.generativeai as genai
from gtts import gTTS
from pydub import AudioSegment
from dotenv import load_dotenv
import re
import json
import base64
import tempfile

# Load environment variables
load_dotenv()

# Configuration
UPLOAD_FOLDER = 'uploads'
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
RHUBARB_PATH = 'rhubarb' 

# Locate Rhubarb (Reuse logic from app.py)
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

def split_text_into_sentences(text):
    sentences = re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s', text)
    return [s.strip() for s in sentences if s.strip()]

def test_pipeline(audio_filename):
    print(f"\n--- Testing Pipeline with audio: {audio_filename} ---")
    
    # 1. Start setup
    find_rhubarb()
    if GOOGLE_API_KEY:
        genai.configure(api_key=GOOGLE_API_KEY)
        model = genai.GenerativeModel('gemini-2.0-flash')
        print("✅ Gemini Configured")
    else:
        print("❌ GOOGLE_API_KEY not found. Skipping LLM.")
        return

    file_path = os.path.join(UPLOAD_FOLDER, audio_filename)
    if not os.path.exists(file_path):
        print(f"❌ Audio file not found: {file_path}")
        return

    # 2. ASR
    print("\n--- Step 1: ASR (Speech to Text) ---")
    wav_path = file_path
    
    # Convert mp3 to wav if needed for SR
    if file_path.endswith('.mp3'):
        wav_path = file_path.replace('.mp3', '.wav')
        try:
            print("Converting MP3 to WAV...")
            subprocess.run(['ffmpeg', '-i', file_path, '-y', wav_path], capture_output=True)
        except Exception as e:
            print(f"Conversion failed: {e}")
            return

    recognizer = sr.Recognizer()
    try:
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
            text = recognizer.recognize_google(audio_data)
            print(f"🎤 Transcribed Text: '{text}'")
    except Exception as e:
        print(f"❌ ASR Failed: {e}")
        return

    # 3. LLM
    print("\n--- Step 2: LLM (Gemini) ---")
    try:
        response = model.generate_content(text)
        reply_text = response.text
        print(f"🤖 LLM Reply: '{reply_text}'")
    except Exception as e:
        print(f"❌ LLM Failed: {e}")
        return

    # 4. TTS & Phonemes
    print("\n--- Step 3: TTS & Phonemes ---")
    sentences = split_text_into_sentences(reply_text)
    print(f"Split into {len(sentences)} chunks.")

    for i, sentence in enumerate(sentences):
        print(f"\nProcessing Chunk {i}: '{sentence}'")
        
        # TTS
        try:
            tts = gTTS(text=sentence, lang='en')
            with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp:
                tmp.close()
                mp3_path = tmp.name
            tts.save(mp3_path)
            print("  ✅ TTS Audio Generated")
            
            # Convert to WAV for Rhubarb
            chunk_wav_path = mp3_path.replace('.mp3', '.wav')
            subprocess.run(['ffmpeg', '-i', mp3_path, '-y', chunk_wav_path], capture_output=True)

            # Rhubarb
            json_out = chunk_wav_path + '.json'
            subprocess.run([RHUBARB_PATH, '-f', 'json', '-o', json_out, chunk_wav_path], capture_output=True)

            if os.path.exists(json_out):
                with open(json_out, 'r') as f:
                    data = json.load(f)
                    print(f"  ✅ Phoneme Data: {json.dumps(data)[:200]}...") # Print preview
                os.remove(json_out)
            else:
                print("  ❌ Rhubarb output missing")
            
            # Allow clean up
            if os.path.exists(mp3_path): os.remove(mp3_path)
            if os.path.exists(chunk_wav_path): os.remove(chunk_wav_path)

        except Exception as e:
            print(f"  ❌ Chunk processing failed: {e}")

if __name__ == "__main__":
    # Change this filename to test specific files
    test_pipeline("output.mp3") 
