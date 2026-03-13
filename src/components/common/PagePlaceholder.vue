<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <el-card>
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-base font-semibold">{{ title }}</div>
          <div v-if="subtitle" class="mt-1 text-sm text-zinc-500">
            {{ subtitle }}
          </div>
        </div>
        <el-tag type="info">Coming soon</el-tag>
      </div>
    </el-card>
  </div>
</template>

