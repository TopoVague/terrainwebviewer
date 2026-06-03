from flask import Flask
from flask_cors import CORS
import os
from config import config

def create_app(config_name=None):
    """Application factory"""
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')
    
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # Create upload folder if it doesn't exist
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Initialize CORS
    CORS(app, resources={
        r"/api/*": {
            "origins": app.config['CORS_ORIGINS'],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type"]
        }
    })
    
    # Register blueprints
    from app.routes import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')
    
    @app.route('/health', methods=['GET'])
    def health_check():
        return {'status': 'ok'}, 200
    
    return app
