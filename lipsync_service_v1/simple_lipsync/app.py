"""
LipSync Avatar - Python Backend Server
Uses Flask to handle audio processing with Rhubarb
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import subprocess
import os
import json
from werkzeug.utils import secure_filename
import tempfile
import shutil

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_AUDIO_EXTENSIONS = {'wav', 'mp3', 'ogg'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Create upload folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename, allowed_extensions):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

def check_rhubarb():
    """Check if Rhubarb is installed"""
    try:
        result = subprocess.run(['rhubarb', '--version'], 
                              capture_output=True, 
                              text=True, 
                              timeout=5)
        return True, result.stdout.strip()
    except FileNotFoundError:
        return False, "Rhubarb not found in PATH"
    except Exception as e:
        return False, str(e)

def process_with_rhubarb(audio_path):
    """Process audio file with Rhubarb and return phoneme data"""
    output_path = audio_path + '.json'
    
    try:
        # Run Rhubarb
        result = subprocess.run(
            ['rhubarb', '-f', 'json', '-o', output_path, audio_path],
            capture_output=True,
            text=True,
            timeout=60  # 1 minute timeout
        )
        
        if result.returncode != 0:
            raise Exception(f"Rhubarb failed: {result.stderr}")
        
        # Read the output JSON
        with open(output_path, 'r') as f:
            phoneme_data = json.load(f)
        
        # Clean up
        os.remove(output_path)
        
        return phoneme_data
        
    except subprocess.TimeoutExpired:
        raise Exception("Rhubarb processing timed out")
    except Exception as e:
        # Clean up on error
        if os.path.exists(output_path):
            os.remove(output_path)
        raise e

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    rhubarb_ok, rhubarb_info = check_rhubarb()
    
    return jsonify({
        'status': 'ok',
        'rhubarb': {
            'installed': rhubarb_ok,
            'version': rhubarb_info if rhubarb_ok else None,
            'message': rhubarb_info
        }
    })

@app.route('/process-audio', methods=['POST'])
def process_audio():
    """Process audio file and return phoneme data"""
    
    # Check if file was uploaded
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    
    file = request.files['audio']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename, ALLOWED_AUDIO_EXTENSIONS):
        return jsonify({'error': 'Invalid file type. Use WAV, MP3, or OGG'}), 400
    
    # Save uploaded file temporarily
    filename = secure_filename(file.filename)
    temp_path = os.path.join(UPLOAD_FOLDER, filename)
    
    try:
        file.save(temp_path)
        
        # Process with Rhubarb
        phoneme_data = process_with_rhubarb(temp_path)
        
        # Clean up uploaded file
        os.remove(temp_path)
        
        return jsonify(phoneme_data)
        
    except Exception as e:
        # Clean up on error
        if os.path.exists(temp_path):
            os.remove(temp_path)
        
        return jsonify({
            'error': 'Failed to process audio',
            'message': str(e)
        }), 500

@app.route('/phonemes', methods=['GET'])
def get_phonemes():
    """Get phoneme reference information"""
    return jsonify({
        'visemes': {
            'X': {'name': 'Rest', 'description': 'Mouth closed, neutral position'},
            'A': {'name': 'AI/AY', 'description': 'Open mouth, tongue down'},
            'B': {'name': 'P/B/M', 'description': 'Lips pressed together'},
            'C': {'name': 'EH/AE', 'description': 'Medium open, relaxed'},
            'D': {'name': 'AA/AO', 'description': 'Wide open mouth'},
            'E': {'name': 'IH', 'description': 'Slightly open'},
            'F': {'name': 'U/UW', 'description': 'Rounded lips, puckered'},
            'G': {'name': 'F/V', 'description': 'Upper teeth on lower lip'},
            'H': {'name': 'L', 'description': 'Tongue forward to teeth'}
        },
        'reference': 'Preston Blair phoneme set'
    })

@app.route('/')
def index():
    """Serve the frontend"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory('.', path)

if __name__ == '__main__':
    print("=" * 60)
    print("🎭 LipSync Avatar - Python Backend Server")
    print("=" * 60)
    print()
    
    # Check Rhubarb
    rhubarb_ok, rhubarb_info = check_rhubarb()
    if rhubarb_ok:
        print(f"✅ Rhubarb installed: {rhubarb_info}")
    else:
        print(f"❌ Rhubarb not found: {rhubarb_info}")
        print("   Please install Rhubarb and add to PATH")
    
    print()
    print("Starting server...")
    print("Open http://localhost:5000 in your browser")
    print()
    print("Press Ctrl+C to stop")
    print("=" * 60)
    print()
    
    app.run(debug=True, port=5000, host='0.0.0.0')
