# Terrain Web Viewer

A full-stack web-based 3D viewer for visualizing terrain from CSV files with XYZ coordinates and building footprints from JSON files. Features a React/Vite frontend with Three.js visualization and a Flask backend API for file management and data processing.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Setup Guide](#setup-guide)
- [Implementation Summary](#implementation-summary)
- [File Reference](#file-reference)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)

---

## Overview

Built with:
- **Frontend**: Vite, React, TypeScript, Three.js, React Three Fiber, Drei
- **Backend**: Flask, Flask-CORS, Python
- **Data Processing**: Pandas, NumPy, Scipy

### Features

✅ Upload and store files on server  
✅ Parse terrain CSV files (XYZ coordinates)  
✅ Parse building JSON files  
✅ 3D visualization with Three.js  
✅ Terrain comparison (original vs modified)  
✅ Data export (JSON, CSV)  
✅ CORS-enabled API  
✅ Type-safe TypeScript integration  

---

## Quick Start

### Option 1: Using Setup Script (Windows)

```powershell
cd c:\Users\panz\Documents\GitHub\terrainwebviewer
.\setup-backend.bat
```

Then in new terminals:
```bash
# Terminal 1: Backend
cd backend
python run.py

# Terminal 2: Frontend
npm run dev
```

### Option 2: Manual Setup (Windows)

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

```bash
# Frontend (in new terminal)
npm install
npm run dev
```

### Option 3: Manual Setup (macOS/Linux)

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py
```

```bash
# Frontend (in new terminal)
npm install
npm run dev
```

**URLs:**
- Backend: http://localhost:5000
- Frontend: http://localhost:5173

---

## Project Structure

```
terrainwebviewer/
├── backend/                          # Flask API server
│   ├── app/
│   │   ├── __init__.py              # Flask app factory
│   │   ├── routes.py                # API endpoints
│   │   └── services.py              # Business logic
│   ├── uploads/                      # File storage
│   ├── config.py                     # Configuration
│   ├── run.py                        # Entry point
│   ├── requirements.txt              # Python dependencies
│   ├── .env                          # Environment variables
│   └── README.md                     # Backend docs
│
├── src/                              # React/TypeScript frontend
│   ├── App.tsx                       # Main app component
│   ├── apiService.ts                 # API client with hooks
│   ├── FileManager.tsx               # File management component
│   ├── terrainModel.ts               # Terrain utilities
│   ├── main.tsx                      # Entry point
│   └── styles.css
│
├── sample-data/                      # Test data files
│   ├── *_TerrainOriginal*.csv
│   ├── *_TerrainModified*.csv
│   └── *_Placed_Buildings.json
│
├── vite.config.ts
├── package.json
├── tsconfig.json
├── index.html
├── README.md                         # This file
├── SETUP_GUIDE.md                    # Detailed setup
├── FLASK_SETUP_SUMMARY.md            # Implementation details
├── FILE_REFERENCE.md                 # File documentation
├── setup-backend.bat                 # Windows setup script
└── .env                              # Frontend env vars
```

---

## Setup Guide

### Backend Setup (Windows)

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

The server runs on: http://localhost:5000

### Backend Setup (macOS/Linux)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py
```

### Frontend Setup

```bash
# In new terminal
npm install
npm run dev
```

The frontend runs on: http://localhost:5173

### Environment Configuration

**Frontend (.env)**
```env
VITE_API_URL=http://localhost:5000/api
```

**Backend (.env)**
```env
FLASK_ENV=development
PORT=5000
SECRET_KEY=dev-secret-key-change-in-production
```

---

## Implementation Summary

### What Was Created

#### Backend (Flask API)
- `app/__init__.py` - Flask app factory with CORS configuration
- `app/routes.py` - API endpoints for file and terrain management
- `app/services.py` - Business logic for parsing CSV/JSON files
- `config.py` - Configuration management
- `run.py` - Flask server entry point
- `requirements.txt` - Python dependencies
- `uploads/` - Server-side file storage

**Features:**
- File upload/download/deletion
- CSV parsing (XYZ terrain points)
- JSON parsing (building data)
- Terrain comparison
- Data export (JSON, CSV)
- CORS enabled

#### Frontend (React)
- `apiService.ts` - API client with React hooks
- `FileManager.tsx` - Example file management component
- `.env` - Frontend environment config

**Key Exports:**
- `fileService` - Raw API calls for files
- `terrainService` - Raw terrain API calls
- `exportService` - Raw export API calls
- `useTerrainAPI()` - React hook combining all operations

### Data Flow

1. User uploads file → React → `POST /api/upload` → Flask backend
2. Backend stores file in `backend/uploads/`
3. User parses file → React → `POST /api/terrain/parse-csv` → Flask backend
4. Backend parses and returns JSON data
5. React visualizes with Three.js

### Usage Example

```typescript
import { useTerrainAPI } from './apiService';

function App() {
  const { files, uploadFile, parseCsv, loading, error } = useTerrainAPI();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const result = await uploadFile(file);
      console.log('File uploaded:', result);
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  const handleParse = async (filename: string) => {
    try {
      const result = await parseCsv(filename);
      console.log('Parsed data:', result.data); // XYZ points
      // Use result.data for visualization
    } catch (err) {
      console.error('Parse failed:', err);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileUpload} />
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}
      <ul>
        {files.map(file => (
          <li key={file.name}>
            {file.name}
            <button onClick={() => handleParse(file.name)}>Parse</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## File Reference

### Backend Files (backend/)

| File | Purpose |
|------|---------|
| `run.py` | Flask server entry point |
| `config.py` | Configuration for dev/production |
| `requirements.txt` | Python dependencies |
| `.env` | Environment variables |
| `app/__init__.py` | Flask app factory |
| `app/routes.py` | API endpoints (11 total) |
| `app/services.py` | Parsing and file services |

### Frontend Files (src/)

| File | Purpose |
|------|---------|
| `apiService.ts` | API client with React hooks |
| `FileManager.tsx` | File management component |
| `App.tsx` | Main application component |
| `terrainModel.ts` | Terrain utilities |

### Total New Files: 15+

---

## API Documentation

### File Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files` | List all files |
| GET | `/api/file/<filename>` | Get file info |
| POST | `/api/upload` | Upload new file |
| DELETE | `/api/file/<filename>` | Delete file |
| GET | `/api/download/<filename>` | Download file |

### Terrain Processing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/terrain/parse-csv` | Parse CSV → XYZ points |
| POST | `/api/terrain/parse-json` | Parse JSON → Buildings |
| POST | `/api/terrain/compare` | Compare terrain files |

### Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/export/json` | Export as JSON |
| POST | `/api/export/csv` | Export as CSV |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

---

## Data Formats

### Terrain CSV Format

The app accepts CSV files with X, Y, Z coordinates:

```csv
x,y,z
0,0,0
1,0,0.4
2,0,0.7
```

Header row is optional. Without a header, the first three columns are treated as `x`, `y`, and `z`.

**File Size Limit:** 50MB  
**Allowed Formats:** CSV, JSON, TXT

### Buildings JSON Format

The app accepts JSON files with building footprints:

```json
[
  {
    "id": "building_1",
    "footprint": [
      { "x": 8.83, "y": 13.45 },
      { "x": 25.08, "y": 1.12 },
      { "x": 20.50, "y": -5.30 }
    ],
    "height": 15,
    "color": "#ff0000"
  }
]
```

**Properties:**
- `id` - Unique building identifier
- `footprint` - Array of {x, y} points defining the building outline
- `height` - Total building height
- `color` - Hex color code

---

## React Hooks & Functions

### useTerrainAPI Hook

```typescript
const {
  loading,        // boolean - loading state
  error,          // string | null - error message
  files,          // FileInfo[] - list of files
  listFiles,      // (type?) => Promise - list files
  uploadFile,     // (file) => Promise - upload file
  deleteFile,     // (filename) => Promise - delete file
  parseCsv,       // (filename) => Promise<ParsedData> - parse CSV
  parseJson,      // (filename) => Promise<ParsedData> - parse JSON
  compareTerrain, // (orig, mod) => Promise - compare terrains
} = useTerrainAPI();
```

### Service Objects

```typescript
import { fileService, terrainService, exportService } from './apiService';

// File operations
await fileService.listFiles('csv');
await fileService.uploadFile(file);
await fileService.deleteFile('filename.csv');

// Terrain operations
await terrainService.parseCsv('terrain.csv');
await terrainService.parseJson('buildings.json');
await terrainService.compareTerrain('original.csv', 'modified.csv');

// Export operations
await exportService.exportAsJson(points);
await exportService.exportAsCsv(points);
```

---

## Production Deployment

### Backend

Use Gunicorn for production:

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 run:app
```

Update `.env`:
```env
FLASK_ENV=production
CORS_ORIGINS=https://yourdomain.com
```

### Frontend

Build for production:

```bash
npm run build
```

Serve the `dist/` folder with a static server (Nginx, Apache, etc.)

---

## Troubleshooting

### Backend won't start

- **Issue**: `ModuleNotFoundError: No module named 'flask'`
- **Solution**: Activate virtual environment and install dependencies
  ```bash
  venv\Scripts\activate
  pip install -r requirements.txt
  ```

- **Issue**: Port 5000 already in use
- **Solution**: Change PORT in `.env` or kill process using port 5000

### CORS Errors

- **Issue**: `Access to XMLHttpRequest blocked by CORS policy`
- **Solution**: 
  1. Verify backend is running on port 5000
  2. Verify frontend is on port 5173
  3. Check `config.py` has correct CORS_ORIGINS

### File Upload Issues

- **Issue**: `413 Payload Too Large`
- **Solution**: Maximum file size is 50MB. Check file size.

- **Issue**: `File type not allowed`
- **Solution**: Only CSV, JSON, TXT allowed. Check file extension.

- **Issue**: Files not appearing in backend/uploads/
- **Solution**: Check folder permissions and disk space

### Connection Issues

- **Verify backend is running**: `curl http://localhost:5000/health`
- **Verify API URL**: Check `.env` has correct `VITE_API_URL`
- **Check browser console**: Press F12, look for CORS/network errors
- **Restart both servers**: Kill and restart Flask and npm dev

### Parse Errors

- **Issue**: CSV parse fails
- **Solution**: Verify CSV has x, y, z columns and valid numbers

- **Issue**: JSON parse fails
- **Solution**: Verify JSON structure matches building format

---

## Next Steps

1. **Test the setup**: Open http://localhost:5173 in browser
2. **Upload sample data**: Use files from `sample-data/` folder
3. **Integrate components**: Add FileManager or apiService to your App
4. **Customize UI**: Style components to match your design
5. **Add features**: Implement additional visualization options
6. **Deploy**: Follow production deployment guide above

---

## Additional Resources

- [Flask Documentation](https://flask.palletsprojects.com/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Three.js Documentation](https://threejs.org/docs/)
- [CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

## Support

For issues or questions:

1. Check backend logs from `python run.py` terminal
2. Open browser DevTools (F12) and check Console and Network tabs
3. Review error messages in terminal outputs
4. Verify all dependencies installed: `pip list`, `npm list`
5. Ensure ports 5000 and 5173 are available

---

## License

MIT

---

## Version Info

- Python: 3.8+
- Node.js: 14.0+
- npm: 6.0+
- Flask: 3.0.0
- React: 19.2.5
          },
          {
            "x": 33.54223918169737, "y": 12.265353229129687
          },
          {
            "x": 17.297151227947325, "y": 24.60129751288332
          }
        ],
        "z": 2.9346918295624738,
        "height": 2.7
      },"footprint": […]
] 
"floorHeight": 2.815,
    "splitLevel": false,
    "color": "#10b981"
  }]


## Notes

The idea is that we could automatically pull the .csv of the terrain and the .json of the building directly from a folder by providing a link to a project
When moving or roating we save the modifications into a .json file


