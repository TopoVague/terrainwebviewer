# Terrain Web Viewer - Flask Backend

This is the backend API server for the Terrain Web Viewer application.

## Installation

1. Create a Python virtual environment:
```bash
python -m venv venv
```

2. Activate the virtual environment:
   - Windows: `venv\Scripts\activate`
   - macOS/Linux: `source venv/bin/activate`

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update `.env` with your configuration

## Running the Server

Start the development server:
```bash
python run.py
```

The server will run on `http://localhost:5000`

## API Endpoints

### File Management
- `GET /api/files` - List all uploaded files
- `GET /api/file/<filename>` - Get file info
- `POST /api/upload` - Upload a new file
- `DELETE /api/file/<filename>` - Delete a file
- `GET /api/download/<filename>` - Download a file

### Terrain Data Processing
- `POST /api/terrain/parse-csv` - Parse CSV file and return XYZ points
- `POST /api/terrain/parse-json` - Parse JSON file and return building data
- `POST /api/terrain/compare` - Compare two terrain files

### Export
- `POST /api/export/json` - Export terrain data as JSON
- `POST /api/export/csv` - Export terrain data as CSV

## Usage Example

### Upload a file
```bash
curl -X POST -F "file=@terrain.csv" http://localhost:5000/api/upload
```

### Parse terrain data
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"filename": "terrain.csv"}' \
  http://localhost:5000/api/terrain/parse-csv
```

### List files
```bash
curl http://localhost:5000/api/files
```

## Environment Variables

- `FLASK_ENV` - Environment (development/production)
- `FLASK_APP` - Entry point (run.py)
- `PORT` - Server port (default: 5000)
- `SECRET_KEY` - Session secret key
- `CORS_ORIGINS` - Comma-separated list of allowed CORS origins

## Directory Structure

```
backend/
├── app/
│   ├── __init__.py       # Flask app factory
│   ├── routes.py         # API endpoints
│   ├── services.py       # Business logic
│   └── models.py         # Data models (if needed)
├── uploads/              # Uploaded files storage
├── config.py             # Configuration
├── run.py               # Entry point
├── requirements.txt      # Python dependencies
├── .env                 # Environment variables
└── README.md            # This file
```

## Production Deployment

For production, use a WSGI application server like Gunicorn:

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 run:app
```

## CORS Configuration

The backend is configured to accept requests from:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000` (Alternative dev server)

Update `CORS_ORIGINS` in `config.py` or `.env` for production.

## Notes

- Maximum file upload size: 50MB
- Allowed file types: csv, json, txt
- Uploaded files are stored in the `uploads/` directory
