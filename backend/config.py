import os
from datetime import timedelta

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    DEBUG = False
    TESTING = False
    
    # Upload folder settings
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max file size
    ALLOWED_EXTENSIONS = {'csv', 'json', 'txt'}
    
    # CORS settings
    CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:3000']
    
    # Session settings
    PERMANENT_SESSION_LIFETIME = timedelta(hours=24)

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '').split(',')

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'test_uploads')

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
