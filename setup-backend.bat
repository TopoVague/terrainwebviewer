@echo off
REM Quick setup script for Windows

echo.
echo ===================================
echo  Terrain Web Viewer - Quick Setup
echo ===================================
echo.

REM Check if backend folder exists
if not exist "backend" (
    echo ERROR: backend folder not found!
    exit /b 1
)

echo [1/4] Creating Python virtual environment...
cd backend
python -m venv venv
if errorlevel 1 (
    echo ERROR: Failed to create virtual environment
    exit /b 1
)

echo [2/4] Activating virtual environment...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo ERROR: Failed to activate virtual environment
    exit /b 1
)

echo [3/4] Installing Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    exit /b 1
)

echo [4/4] Setup complete!
echo.
echo ===================================
echo  Next Steps:
echo ===================================
echo.
echo 1. Backend - In backend folder, run:
echo    python run.py
echo.
echo 2. Frontend - In new terminal, run:
echo    npm run dev
echo.
echo 3. Open browser:
echo    http://localhost:5173
echo.
echo ===================================
echo.
pause
