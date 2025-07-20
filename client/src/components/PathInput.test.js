import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PathInput from './PathInput';

describe('PathInput Component', () => {
  const mockOnStartSession = jest.fn();
  
  const defaultProps = {
    onStartSession: mockOnStartSession
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    test('should render path input form', () => {
      render(<PathInput {...defaultProps} />);
      
      expect(screen.getByText('Start Claude Code Session')).toBeInTheDocument();
      expect(screen.getByLabelText('Working Directory Path:')).toBeInTheDocument();
      expect(screen.getByText('Start Session')).toBeInTheDocument();
    });

    test('should have empty default value', () => {
      render(<PathInput {...defaultProps} />);
      
      const pathInput = screen.getByLabelText('Working Directory Path:');
      expect(pathInput.value).toBe('');
    });

    test('should show placeholder text', () => {
      render(<PathInput {...defaultProps} />);
      
      const pathInput = screen.getByLabelText('Working Directory Path:');
      expect(pathInput).toHaveAttribute('placeholder', 'Enter path or leave empty for current directory');
    });
  });

  describe('Path Input Validation', () => {
    test('should accept valid absolute paths', () => {
      render(<PathInput {...defaultProps} />);
      
      const pathInput = screen.getByLabelText('Working Directory Path:');
      const startButton = screen.getByText('Start Session');
      
      fireEvent.change(pathInput, { target: { value: '/Users/test/project' } });
      fireEvent.click(startButton);
      
      expect(mockOnStartSession).toHaveBeenCalledWith('/Users/test/project');
    });

    test('should accept relative paths', () => {
      render(<PathInput {...defaultProps} />);
      
      const pathInput = screen.getByLabelText('Working Directory Path:');
      const startButton = screen.getByText('Start Session');
      
      fireEvent.change(pathInput, { target: { value: '../parent-directory' } });
      fireEvent.click(startButton);
      
      expect(mockOnStartSession).toHaveBeenCalledWith('../parent-directory');
    });

    test('should handle paths with spaces', () => {
      render(<PathInput {...defaultProps} />);
      
      const pathInput = screen.getByLabelText('Working Directory Path:');
      const startButton = screen.getByText('Start Session');
      
      fireEvent.change(pathInput, { target: { value: '/Users/test/My Project Folder' } });
      fireEvent.click(startButton);
      
      expect(mockOnStartSession).toHaveBeenCalledWith('/Users/test/My Project Folder');
    });

    test('should handle empty path submission', () => {
      render(<PathInput {...defaultProps} />);
      
      const pathInput = screen.getByLabelText('Working Directory Path:');
      const startButton = screen.getByText('Start Session');
      
      fireEvent.change(pathInput, { target: { value: '' } });
      fireEvent.click(startButton);
      
      expect(mockOnStartSession).toHaveBeenCalledWith('');
    });

    test('should trim whitespace from path input', () => {
      render(<PathInput {...defaultProps} />);
      
      const pathInput = screen.getByLabelText('Working Directory Path:');
      const startButton = screen.getByText('Start Session');
      
      fireEvent.change(pathInput, { target: { value: '  /Users/test/project  ' } });
      fireEvent.click(startButton);
      
      expect(mockOnStartSession).toHaveBeenCalledWith('/Users/test/project');
    });
  });

  describe('Form Submission', () => {
    test('should submit form on button click', () => {
      render(<PathInput {...defaultProps} />);
      
      const pathInput = screen.getByLabelText('Working Directory Path:');
      const startButton = screen.getByText('Start Session');
      
      fireEvent.change(pathInput, { target: { value: '/Users/test/project' } });
      fireEvent.click(startButton);
      
      expect(mockOnStartSession).toHaveBeenCalledWith('/Users/test/project');
    });

    test('should submit form on form submission', () => {
      render(<PathInput {...defaultProps} />);
      
      const pathInput = screen.getByLabelText('Working Directory Path:');
      const form = pathInput.closest('form');
      
      fireEvent.change(pathInput, { target: { value: '/Users/test/project' } });
      fireEvent.submit(form);
      
      expect(mockOnStartSession).toHaveBeenCalledWith('/Users/test/project');
    });
  });

});