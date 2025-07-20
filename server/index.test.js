const request = require('supertest');
const express = require('express');
const WebSocket = require('ws');
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

// Create a test server similar to the main server but isolated for testing
const createTestServer = () => {
  const app = express();
  const cors = require('cors');
  
  app.use(cors());
  app.use(express.json());
  
  // In-memory session storage for testing
  const allSessions = new Map();
  const wsSessions = new Map();
  
  // Helper functions for session management
  const generateSessionId = () => {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };
  
  const cleanupSessionById = (sessionId) => {
    const session = allSessions.get(sessionId);
    if (session && session.ptyProcess) {
      if (!session.ptyProcess.killed) {
        session.ptyProcess.kill('SIGTERM');
      }
      allSessions.delete(sessionId);
      
      // Remove session from all WebSocket tracking
      wsSessions.forEach((sessionIds, ws) => {
        const index = sessionIds.indexOf(sessionId);
        if (index > -1) {
          sessionIds.splice(index, 1);
        }
      });
    }
  };
  
  // API endpoint to list active sessions
  app.get('/api/sessions', (req, res) => {
    const activeSessions = [];
    
    allSessions.forEach((session, sessionId) => {
      if (session.ptyProcess && !session.ptyProcess.killed) {
        // Find if any WebSocket is connected to this session
        let isConnected = false;
        let lastSeen = session.createdAt;
        
        wsSessions.forEach((sessionIds, ws) => {
          if (sessionIds.includes(sessionId) && ws.readyState === 1) {
            isConnected = true;
            lastSeen = ws.lastSeen || session.createdAt;
          }
        });
        
        activeSessions.push({
          sessionId: session.sessionId,
          workingDir: session.workingDir,
          createdAt: session.createdAt,
          lastActive: lastSeen,
          isConnected: isConnected,
          hasBuffer: Boolean(session.terminalBuffer && session.terminalBuffer.length > 0),
          bufferSize: session.terminalBuffer ? session.terminalBuffer.length : 0
        });
      }
    });
    
    res.json(activeSessions);
  });
  
  // API endpoint to reconnect to a session
  app.post('/api/sessions/:sessionId/reconnect', (req, res) => {
    const { sessionId } = req.params;
    
    // Find the session
    const foundSession = allSessions.get(sessionId);
    
    if (foundSession && foundSession.ptyProcess && !foundSession.ptyProcess.killed) {
      res.json({ 
        success: true, 
        sessionId: sessionId,
        workingDir: foundSession.workingDir,
        message: 'Session found and ready for reconnection' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        message: 'Session not found or terminated' 
      });
    }
  });
  
  // API endpoint to remove/terminate a session
  app.delete('/api/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    // Find the session
    const foundSession = allSessions.get(sessionId);
    
    if (foundSession) {
      // Clean up the session
      cleanupSessionById(sessionId);
      
      res.json({ 
        success: true, 
        sessionId: sessionId,
        message: 'Session removed successfully' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        message: 'Session not found' 
      });
    }
  });
  
  // Helper methods for testing
  app._addTestSession = (sessionData) => {
    allSessions.set(sessionData.sessionId, sessionData);
  };
  
  app._getTestSessions = () => allSessions;
  
  app._addTestWebSocket = (ws, sessionIds) => {
    wsSessions.set(ws, sessionIds);
  };
  
  return app;
};

describe('Server Integration Tests', () => {
  let app;
  let mockPtyProcess;

  beforeEach(() => {
    app = createTestServer();
    
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

  describe('API Integration Tests', () => {
    test('should handle complete session lifecycle', async () => {
      // 1. Initially no sessions
      let response = await request(app)
        .get('/api/sessions')
        .expect(200);
      expect(response.body).toEqual([]);
      
      // 2. Add a test session
      const testSession = {
        sessionId: 'test-session-123',
        workingDir: '/Users/test/project',
        createdAt: new Date().toISOString(),
        isConnected: true,
        terminalBuffer: 'test buffer content',
        ptyProcess: mockPtyProcess
      };
      
      app._addTestSession(testSession);
      
      // 3. Session should appear in list
      response = await request(app)
        .get('/api/sessions')
        .expect(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        sessionId: 'test-session-123',
        workingDir: '/Users/test/project',
        isConnected: false, // No WebSocket connected
        hasBuffer: true,
        bufferSize: 19 // 'test buffer content' is 19 characters
      });
      
      // 4. Test reconnection
      response = await request(app)
        .post('/api/sessions/test-session-123/reconnect')
        .expect(200);
      expect(response.body).toMatchObject({
        success: true,
        sessionId: 'test-session-123',
        workingDir: '/Users/test/project'
      });
      
      // 5. Test session removal
      response = await request(app)
        .delete('/api/sessions/test-session-123')
        .expect(200);
      expect(response.body).toMatchObject({
        success: true,
        sessionId: 'test-session-123',
        message: 'Session removed successfully'
      });
      
      // 6. Session should be gone
      response = await request(app)
        .get('/api/sessions')
        .expect(200);
      expect(response.body).toEqual([]);
    });
    
    test('should handle multiple sessions correctly', async () => {
      // Add multiple sessions
      const sessions = [
        {
          sessionId: 'session-1',
          workingDir: '/project1',
          createdAt: new Date().toISOString(),
          isConnected: true,
          terminalBuffer: 'buffer1',
          ptyProcess: { ...mockPtyProcess, pid: 1001, killed: false }
        },
        {
          sessionId: 'session-2',
          workingDir: '/project2',
          createdAt: new Date().toISOString(),
          isConnected: false,
          terminalBuffer: '',
          ptyProcess: { ...mockPtyProcess, pid: 1002, killed: false }
        },
        {
          sessionId: 'session-3',
          workingDir: '/project3',
          createdAt: new Date().toISOString(),
          isConnected: true,
          terminalBuffer: 'buffer3',
          ptyProcess: { ...mockPtyProcess, pid: 1003, killed: false }
        }
      ];
      
      sessions.forEach(session => app._addTestSession(session));
      
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);
      
      expect(response.body).toHaveLength(3);
      
      // Verify each session
      const session1 = response.body.find(s => s.sessionId === 'session-1');
      const session2 = response.body.find(s => s.sessionId === 'session-2');
      const session3 = response.body.find(s => s.sessionId === 'session-3');
      
      expect(session1.workingDir).toBe('/project1');
      expect(session1.hasBuffer).toBe(true);
      
      expect(session2.workingDir).toBe('/project2');
      expect(session2.hasBuffer).toBe(false);
      
      expect(session3.workingDir).toBe('/project3');
      expect(session3.hasBuffer).toBe(true);
    });
    
    test('should handle WebSocket connection status correctly', async () => {
      const testSession = {
        sessionId: 'ws-test-session',
        workingDir: '/test',
        createdAt: new Date().toISOString(),
        isConnected: false,
        terminalBuffer: '',
        ptyProcess: mockPtyProcess
      };
      
      app._addTestSession(testSession);
      
      // Mock WebSocket
      const mockWs = {
        readyState: 1, // OPEN
        lastSeen: new Date().toISOString()
      };
      
      // Add WebSocket connection
      app._addTestWebSocket(mockWs, ['ws-test-session']);
      
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);
      
      expect(response.body[0].isConnected).toBe(true);
    });
  });
  
  describe('Error Handling Tests', () => {
    test('should handle reconnection to terminated session', async () => {
      const terminatedSession = {
        sessionId: 'terminated-session',
        workingDir: '/test',
        createdAt: new Date().toISOString(),
        isConnected: false,
        terminalBuffer: '',
        ptyProcess: { ...mockPtyProcess, killed: true }
      };
      
      app._addTestSession(terminatedSession);
      
      const response = await request(app)
        .post('/api/sessions/terminated-session/reconnect')
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Session not found or terminated');
    });
    
    test('should handle removal of non-existent session', async () => {
      const response = await request(app)
        .delete('/api/sessions/non-existent-session')
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Session not found');
    });
    
    test('should handle malformed session requests', async () => {
      // Test with invalid session ID format
      await request(app)
        .post('/api/sessions/ /reconnect')
        .expect(404);
      
      await request(app)
        .delete('/api/sessions/ ')
        .expect(404);
    });
  });
  
  describe('Session Buffer Management Tests', () => {
    test('should track buffer size correctly', async () => {
      const bufferContent = 'A'.repeat(1000); // 1KB of content
      
      const sessionWithBuffer = {
        sessionId: 'buffer-session',
        workingDir: '/test',
        createdAt: new Date().toISOString(),
        isConnected: false,
        terminalBuffer: bufferContent,
        ptyProcess: mockPtyProcess
      };
      
      app._addTestSession(sessionWithBuffer);
      
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);
      
      expect(response.body[0].hasBuffer).toBe(true);
      expect(response.body[0].bufferSize).toBe(1000);
    });
    
    test('should handle sessions without buffer', async () => {
      const sessionWithoutBuffer = {
        sessionId: 'no-buffer-session',
        workingDir: '/test',
        createdAt: new Date().toISOString(),
        isConnected: false,
        terminalBuffer: '',
        ptyProcess: mockPtyProcess
      };
      
      app._addTestSession(sessionWithoutBuffer);
      
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);
      
      expect(response.body[0].hasBuffer).toBe(false);
      expect(response.body[0].bufferSize).toBe(0);
    });
  });
  
  describe('Session Cleanup Tests', () => {
    test('should properly clean up session when deleted', async () => {
      const testSession = {
        sessionId: 'cleanup-session',
        workingDir: '/test',
        createdAt: new Date().toISOString(),
        isConnected: false,
        terminalBuffer: 'test',
        ptyProcess: mockPtyProcess
      };
      
      app._addTestSession(testSession);
      
      // Verify session exists
      let response = await request(app).get('/api/sessions');
      expect(response.body).toHaveLength(1);
      
      // Delete session
      await request(app)
        .delete('/api/sessions/cleanup-session')
        .expect(200);
      
      // Verify PTY process was killed
      expect(mockPtyProcess.kill).toHaveBeenCalledWith('SIGTERM');
      
      // Verify session is removed
      response = await request(app).get('/api/sessions');
      expect(response.body).toHaveLength(0);
      
      // Verify session is removed from internal map
      expect(app._getTestSessions().size).toBe(0);
    });
    
    test('should skip killing already killed PTY process', async () => {
      const killedSession = {
        sessionId: 'killed-session',
        workingDir: '/test',
        createdAt: new Date().toISOString(),
        isConnected: false,
        terminalBuffer: '',
        ptyProcess: { ...mockPtyProcess, killed: true }
      };
      
      app._addTestSession(killedSession);
      
      await request(app)
        .delete('/api/sessions/killed-session')
        .expect(200);
      
      // Should not try to kill already killed process
      expect(mockPtyProcess.kill).not.toHaveBeenCalled();
    });
  });
  
  describe('Edge Cases and Boundary Tests', () => {
    test('should handle concurrent session operations', async () => {
      // Add test session
      const testSession = {
        sessionId: 'concurrent-session',
        workingDir: '/test',
        createdAt: new Date().toISOString(),
        isConnected: false,
        terminalBuffer: '',
        ptyProcess: mockPtyProcess
      };
      
      app._addTestSession(testSession);
      
      // Perform multiple operations concurrently
      const operations = [
        request(app).get('/api/sessions'),
        request(app).post('/api/sessions/concurrent-session/reconnect'),
        request(app).get('/api/sessions'),
        request(app).delete('/api/sessions/concurrent-session'),
        request(app).get('/api/sessions')
      ];
      
      const results = await Promise.all(operations);
      
      // First GET should show session
      expect(results[0].status).toBe(200);
      expect(results[0].body).toHaveLength(1);
      
      // Reconnect should succeed
      expect(results[1].status).toBe(200);
      expect(results[1].body.success).toBe(true);
      
      // Second GET should still show session
      expect(results[2].status).toBe(200);
      expect(results[2].body).toHaveLength(1);
      
      // Delete should succeed
      expect(results[3].status).toBe(200);
      expect(results[3].body.success).toBe(true);
      
      // Final GET should show no sessions
      expect(results[4].status).toBe(200);
      expect(results[4].body).toHaveLength(0);
    });
    
    test('should handle sessions with special characters in paths', async () => {
      const specialSession = {
        sessionId: 'special-session',
        workingDir: '/path/with spaces/and-symbols!@#$%^&*()',
        createdAt: new Date().toISOString(),
        isConnected: false,
        terminalBuffer: '',
        ptyProcess: mockPtyProcess
      };
      
      app._addTestSession(specialSession);
      
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);
      
      expect(response.body[0].workingDir).toBe('/path/with spaces/and-symbols!@#$%^&*()');
    });
    
    test('should handle very long session IDs', async () => {
      const longSessionId = 'session-' + 'a'.repeat(100);
      
      const longSession = {
        sessionId: longSessionId,
        workingDir: '/test',
        createdAt: new Date().toISOString(),
        isConnected: false,
        terminalBuffer: '',
        ptyProcess: mockPtyProcess
      };
      
      app._addTestSession(longSession);
      
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);
      
      expect(response.body[0].sessionId).toBe(longSessionId);
      
      // Test reconnection with long ID
      await request(app)
        .post(`/api/sessions/${longSessionId}/reconnect`)
        .expect(200);
      
      // Test deletion with long ID
      await request(app)
        .delete(`/api/sessions/${longSessionId}`)
        .expect(200);
    });
  });
});