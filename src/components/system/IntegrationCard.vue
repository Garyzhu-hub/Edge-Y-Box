<script setup lang="ts">
const props = defineProps<{
  title: string
  enabled: boolean
  statusText: string
  statusType: 'success' | 'warning' | 'danger' | 'info'
  testing: boolean
}>()

const emit = defineEmits<{
  (e: 'update:enabled', v: boolean): void
  (e: 'test'): void
}>()

const enabledModel = computed({
  get: () => props.enabled,
  set: (v: boolean) => emit('update:enabled', v),
})
</script>

<template>
  <el-card>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold">{{ title }}</div>
        <div class="mt-1 flex items-center gap-2">
          <el-tag :type="statusType" size="small">{{ statusText }}</el-tag>
          <span class="text-xs text-zinc-500">启用后可执行连接测试（演示）。</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xs text-zinc-500">启用</span>
          <el-switch v-model="enabledModel" />
        </div>
        <el-button :loading="testing" @click="emit('test')">测试</el-button>
      </div>
    </div>
    <div class="mt-4">
      <slot />
    </div>
  </el-card>
</template>

