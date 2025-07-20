import React, { useState, useEffect } from 'react';

const SessionList = ({ onSelectSession, onNewSession }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSessions();
    
    // Refresh sessions every 5 seconds
    const interval = setInterval(fetchSessions, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
        setError(null);
      } else {
        setError('Failed to fetch sessions');
      }
    } catch (err) {
      setError('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  const handleReconnect = async (sessionId) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/reconnect`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        onSelectSession(sessionId, data.workingDir);
      } else {
        const error = await response.json();
        alert(`Failed to reconnect: ${error.message}`);
        // Refresh sessions to remove invalid ones
        fetchSessions();
      }
    } catch (err) {
      alert('Error reconnecting to session');
    }
  };

  const handleRemoveSession = async (sessionId) => {
    if (!window.confirm(`Are you sure you want to remove session ${sessionId}? This will terminate the Claude Code process and cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Refresh sessions list to remove the deleted session
        fetchSessions();
      } else {
        const error = await response.json();
        alert(`Failed to remove session: ${error.message}`);
      }
    } catch (err) {
      alert('Error removing session');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatTimeDiff = (dateString) => {
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  };

  if (loading) {
    return (
      <div className="session-list-container">
        <h2>Loading Sessions...</h2>
      </div>
    );
  }

  return (
    <div className="session-list-container">
      <h2>Active Claude Code Sessions</h2>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <div className="session-actions">
        <button onClick={onNewSession} className="new-session-button">
          Start New Session
        </button>
        <button onClick={fetchSessions} className="refresh-button">
          Refresh
        </button>
      </div>
      
      {sessions.length === 0 ? (
        <div className="no-sessions">
          <p>No active sessions found.</p>
          <p>Click "Start New Session" to begin.</p>
        </div>
      ) : (
        <div className="sessions-grid">
          {sessions.map((session) => (
            <div key={session.sessionId} className="session-card">
              <div className="session-header">
                <h3>Session {session.sessionId}</h3>
                <span className={`session-status ${session.isConnected ? 'connected' : 'disconnected'}`}>
                  {session.isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              <div className="session-details">
                <p><strong>Working Directory:</strong></p>
                <p className="session-path">{session.workingDir}</p>
                
                <p><strong>Created:</strong> {formatDate(session.createdAt)}</p>
                <p><strong>Last Active:</strong> {formatTimeDiff(session.lastActive)}</p>
                {session.hasBuffer && (
                  <p><strong>Buffer:</strong> {Math.round(session.bufferSize / 1024)}KB preserved</p>
                )}
              </div>
              
              <div className="session-actions">
                <button 
                  onClick={() => handleReconnect(session.sessionId)}
                  className="reconnect-button"
                >
                  {session.isConnected ? 'Connect' : 'Reconnect'}
                </button>
                <button 
                  onClick={() => handleRemoveSession(session.sessionId)}
                  className="remove-button"
                  title="Remove Session"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SessionList;