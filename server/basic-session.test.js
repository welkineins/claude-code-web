const request = require('supertest');
const express = require('express');
const { spawn } = require('node-pty');

// Mock node-pty
jest.mock('node-pty', () => ({
  spawn: jest.fn()
}));

// Create a minimal test server with just the session management routes
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // In-memory session storage for testing
  const sessions = new Map();
  
  // Session management routes
  app.get('/api/sessions', (req, res) => {
    const sessionList = Array.from(sessions.values()).map(session => ({
      sessionId: session.sessionId,
      workingDir: session.workingDir,
      status: session.isConnected ? 'active' : 'disconnected',
      lastSeen: session.lastSeen,
      pid: session.pid
    }));
    res.json(sessionList);
  });
  
  app.post('/api/sessions/:sessionId/reconnect', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or terminated'
      });
    }
    
    res.json({
      success: true,
      sessionId: sessionId,
      workingDir: session.workingDir
    });
  });
  
  app.delete('/api/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Kill PTY process if it exists
    if (session.ptyProcess && !session.ptyProcess.killed) {
      session.ptyProcess.kill();
    }
    
    // Remove session
    sessions.delete(sessionId);
    
    res.json({
      success: true,
      message: 'Session terminated successfully'
    });
  });
  
  // Helper function to add session (for testing)
  app._addTestSession = (sessionData) => {
    sessions.set(sessionData.sessionId, sessionData);
  };
  
  app._getTestSessions = () => sessions;
  
  return app;
};

describe('Basic Session Management Functions', () => {
  let app;
  let mockPtyProcess;

  beforeEach(() => {
    app = createTestApp();
    
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

  describe('Initial State - No Sessions', () => {
    test('should return empty array when no sessions exist', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('should return 404 for reconnect to non-existent session', async () => {
      const response = await request(app)
        .post('/api/sessions/non-existent-session/reconnect')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Session not found or terminated');
    });

    test('should return 404 for delete non-existent session', async () => {
      const response = await request(app)
        .delete('/api/sessions/non-existent-session')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Session not found');
    });
  });

  describe('Session Creation and Listing', () => {
    test('should list active sessions with correct details', async () => {
      // Add test sessions
      const session1 = {
        sessionId: 'session-123-abc',
        workingDir: '/Users/test/project1',
        isConnected: true,
        lastSeen: new Date().toISOString(),
        pid: 12345,
        ptyProcess: mockPtyProcess
      };
      
      const session2 = {
        sessionId: 'session-456-def',
        workingDir: '/Users/test/project2',
        isConnected: false,
        lastSeen: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        pid: 12346,
        ptyProcess: mockPtyProcess
      };

      app._addTestSession(session1);
      app._addTestSession(session2);

      const response = await request(app)
        .get('/api/sessions')
        .expect(200);

      expect(response.body).toHaveLength(2);
      
      const responseSession1 = response.body.find(s => s.sessionId === 'session-123-abc');
      expect(responseSession1).toMatchObject({
        sessionId: 'session-123-abc',
        workingDir: '/Users/test/project1',
        status: 'active',
        pid: 12345
      });

      const responseSession2 = response.body.find(s => s.sessionId === 'session-456-def');
      expect(responseSession2).toMatchObject({
        sessionId: 'session-456-def',
        workingDir: '/Users/test/project2',
        status: 'disconnected',
        pid: 12346
      });
    });

    test('should show correct session status based on connection state', async () => {
      const activeSession = {
        sessionId: 'active-session',
        workingDir: '/test/active',
        isConnected: true,
        lastSeen: new Date().toISOString(),
        pid: 123,
        ptyProcess: mockPtyProcess
      };

      const disconnectedSession = {
        sessionId: 'disconnected-session',
        workingDir: '/test/disconnected',
        isConnected: false,
        lastSeen: new Date().toISOString(),
        pid: 124,
        ptyProcess: mockPtyProcess
      };

      app._addTestSession(activeSession);
      app._addTestSession(disconnectedSession);

      const response = await request(app).get('/api/sessions');
      
      const active = response.body.find(s => s.sessionId === 'active-session');
      const disconnected = response.body.find(s => s.sessionId === 'disconnected-session');
      
      expect(active.status).toBe('active');
      expect(disconnected.status).toBe('disconnected');
    });

    test('should include lastSeen timestamp for all sessions', async () => {
      const testSession = {
        sessionId: 'test-session',
        workingDir: '/test',
        isConnected: true,
        lastSeen: '2024-01-01T12:00:00Z',
        pid: 123,
        ptyProcess: mockPtyProcess
      };

      app._addTestSession(testSession);

      const response = await request(app).get('/api/sessions');
      
      expect(response.body[0].lastSeen).toBe('2024-01-01T12:00:00Z');
    });
  });

  describe('Session Reconnection', () => {
    test('should successfully reconnect to existing session', async () => {
      const testSession = {
        sessionId: 'reconnect-session',
        workingDir: '/Users/test/reconnect',
        isConnected: false,
        lastSeen: new Date().toISOString(),
        pid: 123,
        ptyProcess: mockPtyProcess
      };

      app._addTestSession(testSession);

      const response = await request(app)
        .post('/api/sessions/reconnect-session/reconnect')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessionId).toBe('reconnect-session');
      expect(response.body.workingDir).toBe('/Users/test/reconnect');
    });

    test('should fail to reconnect to non-existent session', async () => {
      const response = await request(app)
        .post('/api/sessions/non-existent/reconnect')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Session not found or terminated');
    });
  });

  describe('Session Removal', () => {
    test('should successfully remove an existing session', async () => {
      const testSession = {
        sessionId: 'remove-session',
        workingDir: '/Users/test/remove',
        isConnected: true,
        lastSeen: new Date().toISOString(),
        pid: 123,
        ptyProcess: mockPtyProcess
      };

      app._addTestSession(testSession);

      // Verify session exists
      let response = await request(app).get('/api/sessions');
      expect(response.body).toHaveLength(1);

      // Remove the session
      response = await request(app)
        .delete('/api/sessions/remove-session')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Session terminated successfully');

      // Verify session is removed
      response = await request(app).get('/api/sessions');
      expect(response.body).toHaveLength(0);
    });

    test('should kill PTY process when removing session', async () => {
      const testSession = {
        sessionId: 'kill-session',
        workingDir: '/test',
        isConnected: true,
        lastSeen: new Date().toISOString(),
        pid: 123,
        ptyProcess: mockPtyProcess
      };

      app._addTestSession(testSession);

      await request(app)
        .delete('/api/sessions/kill-session')
        .expect(200);

      expect(mockPtyProcess.kill).toHaveBeenCalled();
    });

    test('should return 404 when trying to remove non-existent session', async () => {
      const response = await request(app)
        .delete('/api/sessions/non-existent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Session not found');
    });

    test('should handle removal of already terminated session', async () => {
      const testSession = {
        sessionId: 'temp-session',
        workingDir: '/test',
        isConnected: true,
        lastSeen: new Date().toISOString(),
        pid: 123,
        ptyProcess: mockPtyProcess
      };

      app._addTestSession(testSession);

      // First removal should succeed
      await request(app)
        .delete('/api/sessions/temp-session')
        .expect(200);

      // Second removal should return 404
      const response = await request(app)
        .delete('/api/sessions/temp-session')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Session not found');
    });
  });

  describe('Session Data Validation', () => {
    test('should handle sessions with different working directories', async () => {
      const sessions = [
        {
          sessionId: 'session-1',
          workingDir: '/',
          isConnected: true,
          lastSeen: new Date().toISOString(),
          pid: 100,
          ptyProcess: mockPtyProcess
        },
        {
          sessionId: 'session-2',
          workingDir: '/home/user/project with spaces',
          isConnected: true,
          lastSeen: new Date().toISOString(),
          pid: 200,
          ptyProcess: mockPtyProcess
        },
        {
          sessionId: 'session-3',
          workingDir: '/very/long/path/to/some/deeply/nested/project/directory',
          isConnected: false,
          lastSeen: new Date().toISOString(),
          pid: 300,
          ptyProcess: mockPtyProcess
        }
      ];

      sessions.forEach(session => app._addTestSession(session));

      const response = await request(app).get('/api/sessions');
      
      expect(response.body).toHaveLength(3);
      expect(response.body[0].workingDir).toBe('/');
      expect(response.body[1].workingDir).toBe('/home/user/project with spaces');
      expect(response.body[2].workingDir).toBe('/very/long/path/to/some/deeply/nested/project/directory');
    });

    test('should handle sessions with various PIDs', async () => {
      const testSession = {
        sessionId: 'pid-session',
        workingDir: '/test',
        isConnected: true,
        lastSeen: new Date().toISOString(),
        pid: 999999,
        ptyProcess: mockPtyProcess
      };

      app._addTestSession(testSession);

      const response = await request(app).get('/api/sessions');
      
      expect(response.body[0].pid).toBe(999999);
    });

    test('should preserve lastSeen timestamp format', async () => {
      const testTime = '2024-07-20T10:30:45.123Z';
      const testSession = {
        sessionId: 'time-session',
        workingDir: '/test',
        isConnected: true,
        lastSeen: testTime,
        pid: 123,
        ptyProcess: mockPtyProcess
      };

      app._addTestSession(testSession);

      const response = await request(app).get('/api/sessions');
      
      expect(response.body[0].lastSeen).toBe(testTime);
    });
  });

  describe('Multiple Session Management', () => {
    test('should handle many sessions efficiently', async () => {
      // Create 20 test sessions
      for (let i = 0; i < 20; i++) {
        const session = {
          sessionId: `session-${i}`,
          workingDir: `/test/project${i}`,
          isConnected: i % 2 === 0, // Alternate connected/disconnected
          lastSeen: new Date(Date.now() - i * 1000).toISOString(),
          pid: 1000 + i,
          ptyProcess: mockPtyProcess
        };
        app._addTestSession(session);
      }

      const response = await request(app).get('/api/sessions');
      
      expect(response.body).toHaveLength(20);
      
      // Check that we have both active and disconnected sessions
      const activeCount = response.body.filter(s => s.status === 'active').length;
      const disconnectedCount = response.body.filter(s => s.status === 'disconnected').length;
      
      expect(activeCount).toBe(10);
      expect(disconnectedCount).toBe(10);
    });

    test('should handle concurrent session operations', async () => {
      // Add multiple sessions
      for (let i = 0; i < 5; i++) {
        const session = {
          sessionId: `concurrent-${i}`,
          workingDir: `/test${i}`,
          isConnected: true,
          lastSeen: new Date().toISOString(),
          pid: 2000 + i,
          ptyProcess: mockPtyProcess
        };
        app._addTestSession(session);
      }

      // Perform concurrent operations
      const operations = [
        request(app).get('/api/sessions'),
        request(app).post('/api/sessions/concurrent-0/reconnect'),
        request(app).delete('/api/sessions/concurrent-1'),
        request(app).get('/api/sessions'),
        request(app).post('/api/sessions/concurrent-2/reconnect')
      ];

      const results = await Promise.all(operations);
      
      // First GET should return 5 sessions
      expect(results[0].body).toHaveLength(5);
      
      // Reconnect should succeed
      expect(results[1].body.success).toBe(true);
      
      // Delete should succeed
      expect(results[2].body.success).toBe(true);
      
      // Second GET should return 4 sessions (one deleted)
      expect(results[3].body).toHaveLength(4);
      
      // Second reconnect should succeed
      expect(results[4].body.success).toBe(true);
    });
  });
});