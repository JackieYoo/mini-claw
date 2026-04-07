/**
 * Shell Tool - Execute shell commands (with security validation)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { validateShellCommand } from '../utils/validator.js';
import { createLogger } from '../utils/logger.js';

const execAsync = promisify(exec);
const logger = createLogger('shell');

export const shellTool = {
  name: 'shell',
  description: 'Execute a shell command on the system',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)'
      }
    },
    required: ['command']
  },
  
  async execute({ command, timeout = 30000 }) {
    // 安全验证
    const validation = validateShellCommand(command);
    if (!validation.valid) {
      logger.warn(`命令被拒绝: ${validation.error}`);
      return {
        success: false,
        error: validation.error,
        stdout: '',
        stderr: ''
      };
    }

    try {
      logger.info(`执行命令: ${command.substring(0, 100)}...`);
      
      // 安全的环境变量白名单
      const safeEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        LANG: process.env.LANG,
        TERM: process.env.TERM,
        SHELL: process.env.SHELL,
        PWD: process.env.PWD,
        TMPDIR: process.env.TMPDIR,
      };
      
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024, // 1MB
        cwd: process.cwd(),
        env: safeEnv,
      });
      
      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } catch (err) {
      logger.error(`命令执行失败: ${err.message}`);
      return {
        success: false,
        error: err.message,
        stdout: err.stdout || '',
        stderr: err.stderr || '',
        code: err.code,
        killed: err.killed
      };
    }
  }
};
