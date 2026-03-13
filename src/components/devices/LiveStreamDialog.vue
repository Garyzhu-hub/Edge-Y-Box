<script setup lang="ts">
import type { Camera } from '@/components/devices/CameraFormDialog.vue'

const props = defineProps<{ modelValue: boolean; camera: Camera | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})
</script>

<template>
  <el-dialog v-model="open" title="直播流" width="860" destroy-on-close>
    <div v-if="camera" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="text-xs text-zinc-500">摄像头</div>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">{{ camera.name }}</span>
          <span class="text-xs text-zinc-500">{{ camera.ip }}:{{ camera.port }}</span>
          <span class="text-xs text-zinc-500">｜{{ camera.protocol }}</span>
        </div>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-white p-3">
        <div class="text-xs text-zinc-500">播放器区域</div>
        <div class="mt-2 flex h-[360px] items-center justify-center rounded-lg bg-zinc-50 text-sm text-zinc-600">
          直播播放器占位（后续可接入 WebRTC/HLS/FLV.js 或 GB28181 拉流服务）
        </div>
        <div class="mt-3 text-xs text-zinc-500">流地址：{{ camera.streamUrl || '—' }}</div>
      </div>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择摄像头</div>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

