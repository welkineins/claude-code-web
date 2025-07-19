import React, { useState } from 'react';

const PathInput = ({ onStartSession }) => {
  const [path, setPath] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onStartSession(path.trim());
  };

  return (
    <div className="path-input-container">
      <h2>Start Claude Code Session</h2>
      <form onSubmit={handleSubmit} className="path-input-form">
        <label htmlFor="path">Working Directory Path:</label>
        <input
          id="path"
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Enter path or leave empty for current directory"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <button type="submit">
          Start Session
        </button>
      </form>
    </div>
  );
};

export default PathInput;