from flask import Blueprint, request, jsonify, current_app, send_file
from werkzeug.utils import secure_filename
import os
from app.services import TerrainService, FileService

api_bp = Blueprint('api', __name__)

# ==================== File Management Endpoints ====================

@api_bp.route('/files', methods=['GET'])
def list_files():
    """List all uploaded files"""
    try:
        extension = request.args.get('type')  # 'csv', 'json', or None for all
        files = FileService.list_files(current_app.config['UPLOAD_FOLDER'], extension)
        return jsonify({
            'success': True,
            'files': files,
            'count': len(files)
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@api_bp.route('/file/<filename>', methods=['GET'])
def get_file(filename):
    """Get file info"""
    try:
        filename = secure_filename(filename)
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        if not os.path.exists(file_path):
            return jsonify({
                'success': False,
                'error': 'File not found'
            }), 404
        
        info = FileService.get_file_info(file_path)
        return jsonify({
            'success': True,
            'file': info
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@api_bp.route('/file/<filename>', methods=['DELETE'])
def delete_file(filename):
    """Delete a file"""
    try:
        filename = secure_filename(filename)
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        if FileService.delete_file(file_path):
            return jsonify({
                'success': True,
                'message': 'File deleted successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to delete file'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@api_bp.route('/upload', methods=['POST'])
def upload_file():
    """Upload a file"""
    try:
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided'
            }), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        if not FileService.allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': 'File type not allowed. Allowed types: csv, json, txt'
            }), 400
        
        filename = secure_filename(file.filename)
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        info = FileService.get_file_info(file_path)
        
        return jsonify({
            'success': True,
            'message': 'File uploaded successfully',
            'file': info
        }), 201
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== Terrain Data Endpoints ====================

@api_bp.route('/terrain/parse-csv', methods=['POST'])
def parse_csv():
    """Parse uploaded CSV file and return terrain points"""
    try:
        data = request.get_json()
        filename = data.get('filename')
        
        if not filename:
            return jsonify({
                'success': False,
                'error': 'Filename required'
            }), 400
        
        filename = secure_filename(filename)
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        if not os.path.exists(file_path):
            return jsonify({
                'success': False,
                'error': 'File not found'
            }), 404
        
        result = TerrainService.parse_xyz_csv(file_path)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'data': result.data,
            'warnings': result.warnings,
            'count': len(result.data)
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@api_bp.route('/terrain/parse-json', methods=['POST'])
def parse_json():
    """Parse uploaded JSON file and return building data"""
    try:
        data = request.get_json()
        filename = data.get('filename')
        
        if not filename:
            return jsonify({
                'success': False,
                'error': 'Filename required'
            }), 400
        
        filename = secure_filename(filename)
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        if not os.path.exists(file_path):
            return jsonify({
                'success': False,
                'error': 'File not found'
            }), 404
        
        result = TerrainService.parse_building_json(file_path)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'data': result.data,
            'warnings': result.warnings,
            'count': len(result.data)
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== Comparison Endpoints ====================

@api_bp.route('/terrain/compare', methods=['POST'])
def compare_terrain():
    """Compare two terrain files (original vs modified)"""
    try:
        data = request.get_json()
        original_file = data.get('original_file')
        modified_file = data.get('modified_file')
        
        if not original_file or not modified_file:
            return jsonify({
                'success': False,
                'error': 'Both original_file and modified_file are required'
            }), 400
        
        original_file = secure_filename(original_file)
        modified_file = secure_filename(modified_file)
        
        original_path = os.path.join(current_app.config['UPLOAD_FOLDER'], original_file)
        modified_path = os.path.join(current_app.config['UPLOAD_FOLDER'], modified_file)
        
        if not os.path.exists(original_path) or not os.path.exists(modified_path):
            return jsonify({
                'success': False,
                'error': 'One or both files not found'
            }), 404
        
        original_result = TerrainService.parse_xyz_csv(original_path)
        modified_result = TerrainService.parse_xyz_csv(modified_path)
        
        return jsonify({
            'success': True,
            'original': {
                'filename': original_file,
                'data': original_result.data,
                'count': len(original_result.data),
                'warnings': original_result.warnings
            },
            'modified': {
                'filename': modified_file,
                'data': modified_result.data,
                'count': len(modified_result.data),
                'warnings': modified_result.warnings
            }
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== Download Endpoints ====================

@api_bp.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    """Download a file from the server"""
    try:
        filename = secure_filename(filename)
        file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        if not os.path.exists(file_path):
            return jsonify({
                'success': False,
                'error': 'File not found'
            }), 404
        
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== Export Endpoints ====================

@api_bp.route('/export/json', methods=['POST'])
def export_json():
    """Export terrain data as JSON"""
    try:
        data = request.get_json()
        points = data.get('points', [])
        
        if not points:
            return jsonify({
                'success': False,
                'error': 'No points provided'
            }), 400
        
        return jsonify({
            'success': True,
            'data': points,
            'format': 'json'
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@api_bp.route('/export/csv', methods=['POST'])
def export_csv():
    """Export terrain data as CSV"""
    try:
        data = request.get_json()
        points = data.get('points', [])
        
        if not points:
            return jsonify({
                'success': False,
                'error': 'No points provided'
            }), 400
        
        # Create CSV string
        csv_lines = ['x,y,z']
        for point in points:
            csv_lines.append(f"{point.get('x')},{point.get('y')},{point.get('z')}")
        
        csv_content = '\n'.join(csv_lines)
        
        return {
            'success': True,
            'data': csv_content,
            'format': 'csv'
        }, 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
