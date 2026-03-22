import { copyFileSync } from 'fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import Inspector from 'unplugin-vue-dev-locator/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  base: '/Edge-Y-Box/',
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    vue(),
    Inspector(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
    // GitHub Pages：无服务端回退到 index.html，刷新子路径会 404。
    // 将 index.html 复制为 404.html，让 Pages 在「未命中静态文件」时仍返回 SPA 壳，由 Vue Router 解析路径。
    {
      name: 'github-pages-spa-fallback',
      closeBundle() {
        const out = path.resolve(__dirname, 'dist/index.html')
        copyFileSync(out, path.resolve(__dirname, 'dist/404.html'))
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // ✅ 定义 @ = src
    },
  },
})
