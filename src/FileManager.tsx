import { useState, useEffect } from 'react';
import { Upload, RotateCcw, Save, Trash2, Download, Play } from 'lucide-react';
import { useTerrainAPI, fileService } from './apiService';

/**
 * FileManager Component
 * 
 * Demonstrates how to use the Flask API for:
 * - Uploading files
 * - Listing files
 * - Parsing terrain data
 * - Downloading files
 * - Deleting files
 */
export function FileManager() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const { files, loading, error, listFiles, uploadFile, deleteFile, parseCsv, parseJson } = useTerrainAPI();
  const [parseResult, setParseResult] = useState<any>(null);

  // Load files on component mount
  useEffect(() => {
    listFiles();
  }, []);

  // Handle file selection for upload
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      const result = await uploadFile(selectedFile);
      console.log('Upload successful:', result);
      setSelectedFile(null);
      // Reset file input
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (input) input.value = '';
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  // Handle file deletion
  const handleDelete = async (filename: string) => {
    if (window.confirm(`Delete ${filename}?`)) {
      try {
        await deleteFile(filename);
      } catch (err) {
        console.error('Delete failed:', err);
      }
    }
  };

  // Handle file download
  const handleDownload = async (filename: string) => {
    try {
      const blob = await fileService.downloadFile(filename);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  // Handle file parsing
  const handleParse = async (filename: string) => {
    try {
      setSelectedFilename(filename);
      const ext = filename.split('.').pop()?.toLowerCase();
      
      const result = ext === 'csv' 
        ? await parseCsv(filename)
        : ext === 'json'
        ? await parseJson(filename)
        : null;

      if (result) {
        setParseResult(result);
        console.log('Parse result:', result);
      }
    } catch (err) {
      console.error('Parse failed:', err);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Terrain File Manager</h1>

      {/* Upload Section */}
      <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <h2>Upload Files</h2>
        <p>Supported formats: CSV, JSON, TXT (max 50MB)</p>
        
        <div style={{ marginBottom: '10px' }}>
          <input 
            type="file" 
            onChange={handleFileSelect}
            accept=".csv,.json,.txt"
            style={{ marginRight: '10px' }}
          />
          {selectedFile && <span>{selectedFile.name}</span>}
        </div>

        <button
          onClick={handleUpload}
          disabled={!selectedFile || loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Upload size={18} style={{ marginRight: '5px' }} />
          {loading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          padding: '15px',
          marginBottom: '20px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '4px',
          border: '1px solid #f5c6cb'
        }}>
          Error: {error}
        </div>
      )}

      {/* Files List */}
      <div>
        <h2>Files ({files.length})</h2>
        {files.length === 0 ? (
          <p>No files uploaded yet</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Size</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Modified</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.name} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '10px' }}>
                    <strong>{file.name}</strong>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    {(file.size / 1024).toFixed(2)} KB
                  </td>
                  <td style={{ padding: '10px' }}>
                    {new Date(file.modified).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <button
                      onClick={() => handleParse(file.name)}
                      title="Parse file"
                      style={{
                        marginRight: '5px',
                        padding: '5px 10px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={() => handleDownload(file.name)}
                      title="Download file"
                      style={{
                        marginRight: '5px',
                        padding: '5px 10px',
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(file.name)}
                      title="Delete file"
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Parse Results */}
      {parseResult && (
        <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#e7f3ff', borderRadius: '8px' }}>
          <h2>Parse Results: {selectedFilename}</h2>
          <p>Status: {parseResult.success ? '✓ Success' : '✗ Failed'}</p>
          <p>Records found: <strong>{parseResult.count}</strong></p>
          
          {parseResult.warnings.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <p>Warnings:</p>
              <ul style={{ color: '#856404', backgroundColor: '#fff3cd', padding: '10px', borderRadius: '4px' }}>
                {parseResult.warnings.map((warning: string, idx: number) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <details>
            <summary>View Data ({parseResult.data.length} items)</summary>
            <pre style={{
              backgroundColor: '#f4f4f4',
              padding: '10px',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '300px',
              marginTop: '10px'
            }}>
              {JSON.stringify(parseResult.data.slice(0, 10), null, 2)}
              {parseResult.data.length > 10 && '\n... and more'}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default FileManager;
