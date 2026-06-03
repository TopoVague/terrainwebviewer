import os
from app import create_app

if __name__ == '__main__':
    app = create_app(os.environ.get('FLASK_ENV', 'development'))
    
    # Run the Flask development server
    # For production, use a WSGI server like Gunicorn
    app.run(
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000)),
        debug=os.environ.get('FLASK_ENV') == 'development'
    )
