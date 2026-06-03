/**
 * API Service for communicating with Flask backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ==================== File Management ====================

export const fileService = {
  /**
   * List all uploaded files
   */
  async listFiles(type?: 'csv' | 'json') {
    const url = new URL(`${API_BASE_URL}/files`);
    if (type) url.searchParams.append('type', type);
    
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to list files');
    return response.json();
  },

  /**
   * Get file information
   */
  async getFileInfo(filename: string) {
    const response = await fetch(`${API_BASE_URL}/file/${encodeURIComponent(filename)}`);
    if (!response.ok) throw new Error('Failed to get file info');
    return response.json();
  },

  /**
   * Upload a file
   */
  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) throw new Error('Failed to upload file');
    return response.json();
  },

  /**
   * Delete a file
   */
  async deleteFile(filename: string) {
    const response = await fetch(`${API_BASE_URL}/file/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) throw new Error('Failed to delete file');
    return response.json();
  },

  /**
   * Download a file
   */
  async downloadFile(filename: string) {
    const response = await fetch(`${API_BASE_URL}/download/${encodeURIComponent(filename)}`);
    if (!response.ok) throw new Error('Failed to download file');
    return response.blob();
  },
};

// ==================== Terrain Data ====================

export const terrainService = {
  /**
   * Parse CSV file and return terrain points
   */
  async parseCsv(filename: string) {
    const response = await fetch(`${API_BASE_URL}/terrain/parse-csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });
    
    if (!response.ok) throw new Error('Failed to parse CSV');
    return response.json();
  },

  /**
   * Parse JSON file and return building data
   */
  async parseJson(filename: string) {
    const response = await fetch(`${API_BASE_URL}/terrain/parse-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });
    
    if (!response.ok) throw new Error('Failed to parse JSON');
    return response.json();
  },

  /**
   * Compare two terrain files
   */
  async compareTerrain(originalFile: string, modifiedFile: string) {
    const response = await fetch(`${API_BASE_URL}/terrain/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original_file: originalFile,
        modified_file: modifiedFile,
      }),
    });
    
    if (!response.ok) throw new Error('Failed to compare terrain');
    return response.json();
  },
};

// ==================== Export ====================

export const exportService = {
  /**
   * Export terrain data as JSON
   */
  async exportAsJson(points: any[]) {
    const response = await fetch(`${API_BASE_URL}/export/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    });
    
    if (!response.ok) throw new Error('Failed to export as JSON');
    return response.json();
  },

  /**
   * Export terrain data as CSV
   */
  async exportAsCsv(points: any[]) {
    const response = await fetch(`${API_BASE_URL}/export/csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    });
    
    if (!response.ok) throw new Error('Failed to export as CSV');
    return response.json();
  },
};

// ==================== React Hook ====================

import { useState, useCallback } from 'react';

export interface FileInfo {
  name: string;
  size: number;
  created: string;
  modified: string;
  path: string;
}

export interface ParsedData {
  success: boolean;
  filename: string;
  data: any[];
  warnings: string[];
  count: number;
}

export function useTerrainAPI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);

  const listFiles = useCallback(async (type?: 'csv' | 'json') => {
    try {
      setLoading(true);
      setError(null);
      const result = await fileService.listFiles(type);
      setFiles(result.files);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    try {
      setLoading(true);
      setError(null);
      const result = await fileService.uploadFile(file);
      // Refresh file list
      await listFiles();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [listFiles]);

  const deleteFile = useCallback(async (filename: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await fileService.deleteFile(filename);
      // Refresh file list
      await listFiles();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [listFiles]);

  const parseCsv = useCallback(async (filename: string): Promise<ParsedData> => {
    try {
      setLoading(true);
      setError(null);
      return await terrainService.parseCsv(filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const parseJson = useCallback(async (filename: string): Promise<ParsedData> => {
    try {
      setLoading(true);
      setError(null);
      return await terrainService.parseJson(filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const compareTerrain = useCallback(
    async (originalFile: string, modifiedFile: string) => {
      try {
        setLoading(true);
        setError(null);
        return await terrainService.compareTerrain(originalFile, modifiedFile);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    files,
    listFiles,
    uploadFile,
    deleteFile,
    parseCsv,
    parseJson,
    compareTerrain,
  };
}
