import csv
import json
import os
from typing import List, Dict, Any, Tuple
import numpy as np
from dataclasses import dataclass
from datetime import datetime

@dataclass
class XYZPoint:
    x: float
    y: float
    z: float
    
    def to_dict(self):
        return {'x': self.x, 'y': self.y, 'z': self.z}

@dataclass
class BuildingFootprint:
    id: str
    footprint: List[Dict[str, float]]  # List of {x, y, z?}
    height: float
    color: str = '#ff0000'
    
    def to_dict(self):
        return {
            'id': self.id,
            'footprint': self.footprint,
            'height': self.height,
            'color': self.color
        }

class ParseResult:
    def __init__(self, data: List[Any], warnings: List[str] = None):
        self.data = data
        self.warnings = warnings or []
    
    def to_dict(self):
        return {
            'data': self.data,
            'warnings': self.warnings,
            'count': len(self.data)
        }

class TerrainService:
    """Service for terrain data processing"""
    
    @staticmethod
    def parse_xyz_csv(file_path: str) -> ParseResult:
        """Parse CSV file with XYZ coordinates"""
        warnings = []
        points = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                # Try to detect if first row is header
                reader = csv.reader(f)
                rows = list(reader)
                
                if not rows:
                    warnings.append("The file is empty.")
                    return ParseResult(points, warnings)
                
                # Check if first row contains headers
                first_row = [cell.lower().strip() for cell in rows[0]]
                has_header = 'x' in first_row and 'y' in first_row and 'z' in first_row
                
                x_index = first_row.index('x') if has_header else 0
                y_index = first_row.index('y') if has_header else 1
                z_index = first_row.index('z') if has_header else 2
                
                data_rows = rows[1:] if has_header else rows
                
                for idx, row in enumerate(data_rows):
                    line_num = idx + 2 if has_header else idx + 1
                    
                    if len(row) < 3:
                        warnings.append(f"Skipped line {line_num}: expected at least 3 columns.")
                        continue
                    
                    try:
                        x = float(row[x_index])
                        y = float(row[y_index])
                        z = float(row[z_index])
                        points.append(XYZPoint(x, y, z).to_dict())
                    except (ValueError, IndexError) as e:
                        warnings.append(f"Skipped line {line_num}: invalid numeric value.")
                        continue
        
        except Exception as e:
            warnings.append(f"Error reading file: {str(e)}")
        
        return ParseResult(points, warnings)
    
    @staticmethod
    def parse_building_json(file_path: str) -> ParseResult:
        """Parse JSON file with building footprints"""
        warnings = []
        buildings = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Handle different JSON structures
            features = data if isinstance(data, list) else data.get('features', [])
            
            for idx, feature in enumerate(features):
                try:
                    # Extract properties
                    props = feature.get('properties', feature)
                    
                    building = BuildingFootprint(
                        id=props.get('id', f'building_{idx}'),
                        footprint=props.get('footprint', []),
                        height=float(props.get('height', 10)),
                        color=props.get('color', '#ff0000')
                    )
                    
                    buildings.append(building.to_dict())
                except Exception as e:
                    warnings.append(f"Skipped building {idx}: {str(e)}")
                    continue
        
        except json.JSONDecodeError:
            warnings.append("Invalid JSON format.")
        except Exception as e:
            warnings.append(f"Error reading file: {str(e)}")
        
        return ParseResult(buildings, warnings)

class FileService:
    """Service for file management"""
    
    ALLOWED_EXTENSIONS = {'csv', 'json', 'txt'}
    
    @staticmethod
    def allowed_file(filename: str) -> bool:
        """Check if file extension is allowed"""
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in FileService.ALLOWED_EXTENSIONS
    
    @staticmethod
    def get_file_info(file_path: str) -> Dict[str, Any]:
        """Get information about a file"""
        if not os.path.exists(file_path):
            return None
        
        return {
            'name': os.path.basename(file_path),
            'size': os.path.getsize(file_path),
            'created': datetime.fromtimestamp(os.path.getctime(file_path)).isoformat(),
            'modified': datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat(),
            'path': file_path
        }
    
    @staticmethod
    def list_files(directory: str, extension: str = None) -> List[Dict[str, Any]]:
        """List all files in directory"""
        files = []
        
        if not os.path.exists(directory):
            return files
        
        for filename in os.listdir(directory):
            if extension and not filename.endswith(f'.{extension}'):
                continue
            
            file_path = os.path.join(directory, filename)
            if os.path.isfile(file_path):
                info = FileService.get_file_info(file_path)
                if info:
                    files.append(info)
        
        return sorted(files, key=lambda x: x['modified'], reverse=True)
    
    @staticmethod
    def delete_file(file_path: str) -> bool:
        """Delete a file safely"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
        except Exception:
            pass
        return False
