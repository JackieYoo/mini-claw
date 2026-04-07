/**
 * PM2 Ecosystem Configuration
 * 用于生产环境进程守护
 */

module.exports = {
  apps: [
    {
      name: 'mini-claw',
      script: 'src/index.js',
      
      // 实例配置
      instances: 1,
      exec_mode: 'fork',
      
      // 自动重启
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],
      
      // 重启策略
      exp_backoff_restart_delay: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000,
      
      // 日志配置
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      
      // 环境变量
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      },
      env_development: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug'
      },
      
      // 优雅关闭
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 3000,
      
      // 内存限制
      max_memory_restart: '500M',
      
      // 定时重启（可选，每天凌晨 3 点）
      cron_restart: '0 3 * * *'
    }
  ]
};
