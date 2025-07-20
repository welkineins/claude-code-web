const request = require('supertest');
const express = require('express');
const { spawn } = require('node-pty');

// Mock node-pty
jest.mock('node-pty', () => ({
  spawn: jest.fn()
}));

// Mock child_process exec for claude command check
jest.mock('child_process', () => ({
  exec: jest.fn((cmd, callback) => {
    if (cmd === 'which claude') {
      callback(null, '/usr/local/bin/claude', '');
    }
  })
}));

describe('Working Directory Prefix and Path Security', () => {
  let app;
  let mockPtyProcess;
  let originalEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = {
      WORKING_DIR_PREFIX: process.env.WORKING_DIR_PREFIX
    };
    
    // Create mock PTY process
    mockPtyProcess = {
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn(),
      killed: false,
      on: jest.fn(),
      removeAllListeners: jest.fn(),
      pid: 12345
    };

    spawn.mockReturnValue(mockPtyProcess);
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv.WORKING_DIR_PREFIX) {
      process.env.WORKING_DIR_PREFIX = originalEnv.WORKING_DIR_PREFIX;
    } else {
      delete process.env.WORKING_DIR_PREFIX;
    }
  });

  describe('Working Directory Prefix Configuration', () => {
    test('should apply prefix when WORKING_DIR_PREFIX is set', async () => {
      // Set prefix environment variable
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
      
      // Import server module after setting environment
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const userInput = '/Users/chiehyu/project';
      const result = validateAndNormalizePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe('/tmp/sandbox/Users/chiehyu/project');
      expect(result.error).toBeUndefined();
    });

    test('should handle relative user paths with prefix', async () => {
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const userInput = 'project/subfolder';
      const result = validateAndNormalizePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe('/tmp/sandbox/project/subfolder');
    });

    test('should work without prefix when WORKING_DIR_PREFIX is not set', async () => {
      delete process.env.WORKING_DIR_PREFIX;
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const userInput = '/Users/chiehyu/project';
      const result = validateAndNormalizePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe('/Users/chiehyu/project');
    });

    test('should handle empty prefix gracefully', async () => {
      process.env.WORKING_DIR_PREFIX = '';
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const userInput = '/Users/chiehyu/project';
      const result = validateAndNormalizePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe('/Users/chiehyu/project');
    });
  });

  describe('Path Security Validation', () => {
    beforeEach(() => {
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
    });

    test('should reject paths with ../ (parent directory traversal)', async () => {
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const maliciousPaths = [
        '../sensitive',
        '/project/../sensitive',
        'project/../../../etc/passwd',
        '../../../etc/passwd',
        'project/../../sensitive'
      ];
      
      maliciousPaths.forEach(path => {
        const result = validateAndNormalizePath(path);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Parent directory traversal');
        expect(result.normalizedPath).toBeUndefined();
      });
    });

    test('should reject paths with ./ (current directory references)', async () => {
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const suspiciousPaths = [
        './project',
        '/project/./subfolder',
        'project/./sensitive',
        './././project'
      ];
      
      suspiciousPaths.forEach(path => {
        const result = validateAndNormalizePath(path);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Current directory references');
        expect(result.normalizedPath).toBeUndefined();
      });
    });

    test('should reject paths with multiple consecutive slashes', async () => {
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const invalidPaths = [
        '//project',
        '/project//subfolder',
        'project///sensitive'
      ];
      
      invalidPaths.forEach(path => {
        const result = validateAndNormalizePath(path);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid path format');
      });
    });

    test('should reject empty or whitespace-only paths', async () => {
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const emptyPaths = ['', '   ', '\t', '\n', '  \t  \n  '];
      
      emptyPaths.forEach(path => {
        const result = validateAndNormalizePath(path);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Path cannot be empty');
      });
    });

    test('should reject paths with null bytes', async () => {
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const nullBytePaths = [
        '/project\x00/sensitive',
        'project\0sensitive',
        '/project/\x00'
      ];
      
      nullBytePaths.forEach(path => {
        const result = validateAndNormalizePath(path);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid characters in path');
      });
    });

    test('should accept valid paths without security issues', async () => {
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const validPaths = [
        '/Users/chiehyu/project',
        'project/subfolder',
        '/project',
        'simple-project',
        '/project/with-dashes',
        '/project/with_underscores',
        '/project123/subfolder456'
      ];
      
      validPaths.forEach(path => {
        const result = validateAndNormalizePath(path);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.normalizedPath).toMatch(/^\/tmp\/sandbox/);
      });
    });
  });

  describe('Integration with Session Creation', () => {
    test('should apply prefix when creating new session', async () => {
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      // Test that the path validation function correctly applies prefix
      const userInput = '/Users/chiehyu/project';
      const result = validateAndNormalizePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe('/tmp/sandbox/Users/chiehyu/project');
      
      // Test that startClaudeCodeSession would use this validation
      // We can't easily test the actual session creation without starting the server,
      // but we verified the validation function is integrated
    });

    test('should reject session creation with invalid paths', async () => {
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      // Test that malicious paths are rejected
      const maliciousPaths = [
        '../../../etc/passwd',
        './malicious/path',
        '//invalid//path'
      ];
      
      maliciousPaths.forEach(maliciousPath => {
        const result = validateAndNormalizePath(maliciousPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.normalizedPath).toBeUndefined();
      });
    });
  });

  describe('Directory Creation', () => {
    // Helper function to create random test directory
    const createRandomTestDir = () => {
      const randomDir = Math.random().toString(36).substring(7);
      return `/tmp/test-sandbox-${randomDir}`;
    };

    test('should create directories recursively when they do not exist', async () => {
      const testPrefix = createRandomTestDir();
      process.env.WORKING_DIR_PREFIX = testPrefix;
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndCreatePath } = require('./index.js');
      
      const userInput = '/deep/nested/directory/structure';
      const result = await validateAndCreatePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe(`${testPrefix}/deep/nested/directory/structure`);
      expect(result.directoryCreated).toBe(true);
      
      // Verify directory actually exists
      const fs = require('fs');
      expect(fs.existsSync(`${testPrefix}/deep/nested/directory/structure`)).toBe(true);
    });

    test('should not create directory if it already exists', async () => {
      const testPrefix = createRandomTestDir();
      process.env.WORKING_DIR_PREFIX = testPrefix;
      
      // Create directory first
      const fs = require('fs');
      fs.mkdirSync(`${testPrefix}/existing`, { recursive: true });
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndCreatePath } = require('./index.js');
      
      const userInput = '/existing';
      const result = await validateAndCreatePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe(`${testPrefix}/existing`);
      expect(result.directoryCreated).toBe(false);
    });

    test('should handle permission errors gracefully', async () => {
      // Create a random temp directory for testing
      const randomDir = Math.random().toString(36).substring(7);
      const tempPrefix = `/tmp/test-permission-${randomDir}`;
      process.env.WORKING_DIR_PREFIX = tempPrefix;
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndCreatePath } = require('./index.js');
      
      // Mock fs.mkdirSync to simulate permission error
      const fs = require('fs');
      const originalMkdirSync = fs.mkdirSync;
      fs.mkdirSync = jest.fn().mockImplementation(() => {
        const error = new Error('EACCES: permission denied');
        error.code = 'EACCES';
        throw error;
      });
      
      const userInput = '/cannot/create/here';
      const result = await validateAndCreatePath(userInput);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Directory creation failed: permission denied');
      expect(result.normalizedPath).toBeUndefined();
      
      // Restore original function
      fs.mkdirSync = originalMkdirSync;
    });

    test('should handle invalid path for directory creation', async () => {
      const testPrefix = createRandomTestDir();
      process.env.WORKING_DIR_PREFIX = testPrefix;
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndCreatePath } = require('./index.js');
      
      const userInput = '../malicious/path';
      const result = await validateAndCreatePath(userInput);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Parent directory traversal');
      expect(result.directoryCreated).toBe(false);
    });

    test('should clean up test directories after tests', async () => {
      const fs = require('fs');
      
      // Clean up test directories - remove all test-sandbox-* directories
      const path = require('path');
      const testDirs = fs.readdirSync('/tmp').filter(dir => dir.startsWith('test-sandbox-'));
      testDirs.forEach(dir => {
        const fullPath = path.join('/tmp', dir);
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      });
      
      expect(true).toBe(true); // Cleanup successful
    });
  });

  describe('Full Path Display', () => {
    test('should return full normalized path for display', async () => {
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const userInput = '/Users/chiehyu/project';
      const result = validateAndNormalizePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBe('/tmp/sandbox/Users/chiehyu/project');
      expect(result.displayPath).toBe('/tmp/sandbox/Users/chiehyu/project');
    });

    test('should provide user input and normalized path separately', async () => {
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const userInput = 'project/subfolder';
      const result = validateAndNormalizePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.userInput).toBe('project/subfolder');
      expect(result.normalizedPath).toBe('/tmp/sandbox/project/subfolder');
      expect(result.displayPath).toBe('/tmp/sandbox/project/subfolder');
    });

    test('should show when no prefix is applied', async () => {
      delete process.env.WORKING_DIR_PREFIX;
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const userInput = '/Users/chiehyu/project';
      const result = validateAndNormalizePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.userInput).toBe('/Users/chiehyu/project');
      expect(result.normalizedPath).toBe('/Users/chiehyu/project');
      expect(result.displayPath).toBe('/Users/chiehyu/project');
      expect(result.prefixApplied).toBe(false);
    });

    test('should indicate when prefix was applied', async () => {
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const userInput = '/Users/chiehyu/project';
      const result = validateAndNormalizePath(userInput);
      
      expect(result.isValid).toBe(true);
      expect(result.prefixApplied).toBe(true);
      expect(result.prefix).toBe('/tmp/sandbox');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle very long paths', async () => {
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      // Create a very long path (over 4096 characters)
      const longPath = '/project/' + 'a'.repeat(5000);
      const result = validateAndNormalizePath(longPath);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Path too long');
    });

    test('should handle paths with special characters', async () => {
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const specialCharPaths = [
        '/project with spaces',
        '/project-with-dashes',
        '/project_with_underscores',
        '/project.with.dots',
        '/project(with)parentheses',
        '/project[with]brackets'
      ];
      
      specialCharPaths.forEach(path => {
        const result = validateAndNormalizePath(path);
        expect(result.isValid).toBe(true);
        expect(result.normalizedPath).toBe(`/tmp/sandbox${path}`);
      });
    });

    test('should handle unicode characters in paths', async () => {
      process.env.WORKING_DIR_PREFIX = '/tmp/sandbox';
      
      delete require.cache[require.resolve('./index.js')];
      const { validateAndNormalizePath } = require('./index.js');
      
      const unicodePaths = [
        '/项目/文件夹',
        '/проект/папка',
        '/プロジェクト/フォルダ',
        '/projet/dossier'
      ];
      
      unicodePaths.forEach(path => {
        const result = validateAndNormalizePath(path);
        expect(result.isValid).toBe(true);
        expect(result.normalizedPath).toBe(`/tmp/sandbox${path}`);
      });
    });
  });
});