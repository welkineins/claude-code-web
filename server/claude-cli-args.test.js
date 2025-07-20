const { getClaudeCliArgs } = require('./index.js');

describe('Claude CLI Arguments Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = {
      CLAUDE_CLI_ARGS: process.env.CLAUDE_CLI_ARGS
    };
    
    // Clear require cache to get fresh function
    delete require.cache[require.resolve('./index.js')];
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv.CLAUDE_CLI_ARGS) {
      process.env.CLAUDE_CLI_ARGS = originalEnv.CLAUDE_CLI_ARGS;
    } else {
      delete process.env.CLAUDE_CLI_ARGS;
    }
  });

  test('should return default arguments when no environment variable is set', () => {
    delete process.env.CLAUDE_CLI_ARGS;
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--dangerously-skip-permissions']);
  });

  test('should return default arguments when environment variable is empty', () => {
    process.env.CLAUDE_CLI_ARGS = '';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--dangerously-skip-permissions']);
  });

  test('should return default arguments when environment variable is whitespace only', () => {
    process.env.CLAUDE_CLI_ARGS = '   ';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--dangerously-skip-permissions']);
  });

  test('should parse space-separated arguments correctly', () => {
    process.env.CLAUDE_CLI_ARGS = '--debug --verbose';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--debug', '--verbose']);
  });

  test('should parse arguments with extra spaces correctly', () => {
    process.env.CLAUDE_CLI_ARGS = '  --debug   --verbose  --model sonnet  ';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--debug', '--verbose', '--model', 'sonnet']);
  });

  test('should parse single argument correctly', () => {
    process.env.CLAUDE_CLI_ARGS = '--debug';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--debug']);
  });

  test('should parse JSON array format correctly', () => {
    process.env.CLAUDE_CLI_ARGS = '["--debug", "--verbose", "--model", "sonnet"]';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--debug', '--verbose', '--model', 'sonnet']);
  });

  test('should parse JSON array with complex arguments correctly', () => {
    process.env.CLAUDE_CLI_ARGS = '["--mcp-config", "/path/to/mcp.json", "--debug"]';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--mcp-config', '/path/to/mcp.json', '--debug']);
  });

  test('should fallback to space-separated parsing when JSON parsing fails', () => {
    process.env.CLAUDE_CLI_ARGS = '["--invalid-json --debug --verbose';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['["--invalid-json', '--debug', '--verbose']);
  });

  test('should handle empty JSON array', () => {
    process.env.CLAUDE_CLI_ARGS = '[]';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual([]);
  });

  test('should handle arguments with equals signs', () => {
    process.env.CLAUDE_CLI_ARGS = '--model=sonnet --permission-mode=acceptEdits';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--model=sonnet', '--permission-mode=acceptEdits']);
  });

  test('should handle quoted arguments in JSON format', () => {
    process.env.CLAUDE_CLI_ARGS = '["--append-system-prompt", "You are helpful", "--add-dir", "/tmp/test dir"]';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--append-system-prompt', 'You are helpful', '--add-dir', '/tmp/test dir']);
  });

  test('should handle mixed argument formats', () => {
    process.env.CLAUDE_CLI_ARGS = '--dangerously-skip-permissions --debug --verbose';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--dangerously-skip-permissions', '--debug', '--verbose']);
  });

  test('should handle invalid JSON that is not an array', () => {
    process.env.CLAUDE_CLI_ARGS = '{"model": "sonnet"}';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    // Should fallback to space-separated parsing
    expect(result).toEqual(['{"model":', '"sonnet"}']);
  });
});