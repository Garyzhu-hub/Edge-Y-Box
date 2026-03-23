<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'
import { Moon, Sun } from 'lucide-vue-next'

const auth = useAuthStore()

const { toggleTheme, isDark } = useTheme()

const projectLabel = computed(() => '项目：本地边缘（Demo）')

auth.loadFromStorage()
</script>

<template>
  <header
    class="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900"
  >
    <div class="flex min-w-0 items-center gap-3">
      <div class="min-w-0">
        <div class="truncate text-sm font-semibold">Edge Y-box</div>
        <div class="truncate text-xs text-zinc-500 dark:text-zinc-400">{{ projectLabel }}</div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <el-button
        circle
        class="!border-zinc-200 dark:!border-zinc-700"
        :aria-label="isDark ? '切换浅色主题' : '切换深色主题'"
        @click="toggleTheme"
      >
        <component :is="isDark ? Sun : Moon" class="h-4 w-4" />
      </el-button>

      <el-dropdown trigger="click">
        <div
          class="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          <div class="h-6 w-6 rounded-full bg-zinc-200 dark:bg-zinc-600" />
          <div class="text-sm">
            {{ auth.username }}
            <span class="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{{ auth.role }}</span>
          </div>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="auth.setRole('project_user')">
              切换为项目人员（演示）
            </el-dropdown-item>
            <el-dropdown-item @click="auth.setRole('super_admin')">
              切换为超级管理员（演示）
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

