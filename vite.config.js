import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      // 前端请求 /api 时转发给 SQLite 后端服务
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // 材料库文件在线预览：/uploads 也转发给后端静态托管
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
