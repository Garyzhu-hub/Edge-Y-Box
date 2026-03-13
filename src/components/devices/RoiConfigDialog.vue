<script setup lang="ts">
import type { Camera } from '@/components/devices/CameraFormDialog.vue'

const props = defineProps<{ modelValue: boolean; camera: Camera | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const active = ref<'roi' | 'params'>('roi')

watch(
  () => open.value,
  (v) => {
    if (!v) return
    active.value = 'roi'
  }
)
</script>

<template>
  <el-dialog v-model="open" title="ROI配置" width="920" destroy-on-close>
    <div v-if="camera" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="text-xs text-zinc-500">摄像头</div>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">{{ camera.name }}</span>
          <span class="text-xs text-zinc-500">{{ camera.ip }}:{{ camera.port }}</span>
        </div>
      </div>

      <el-segmented
        v-model="active"
        size="small"
        :options="[
          { label: 'ROI区域', value: 'roi' },
          { label: '检测参数', value: 'params' },
        ]"
      />

      <div v-if="active === 'roi'" class="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div class="lg:col-span-2 rounded-xl border border-zinc-200 bg-white p-3">
          <div class="text-xs text-zinc-500">画布区域</div>
          <div class="mt-2 flex h-[420px] items-center justify-center rounded-lg bg-zinc-50 text-sm text-zinc-600">
            ROI画布占位（后续可支持拖拽多边形/矩形、吸附、缩放）
          </div>
        </div>
        <div class="rounded-xl border border-zinc-200 bg-white p-3">
          <div class="text-xs text-zinc-500">ROI列表</div>
          <div class="mt-2 space-y-2">
            <div class="rounded-lg border border-zinc-200 p-2">
              <div class="text-sm font-semibold">ROI-1</div>
              <div class="mt-1 text-xs text-zinc-500">类型：多边形｜点数：6</div>
            </div>
            <div class="rounded-lg border border-zinc-200 p-2">
              <div class="text-sm font-semibold">ROI-2</div>
              <div class="mt-1 text-xs text-zinc-500">类型：矩形｜点数：4</div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="rounded-xl border border-zinc-200 bg-white p-3">
        <div class="text-xs text-zinc-500">参数面板</div>
        <div class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
          <el-input placeholder="最小目标尺寸（占位）" />
          <el-input placeholder="置信度阈值（占位）" />
          <el-input placeholder="触发次数阈值（占位）" />
        </div>
        <div class="mt-3 text-xs text-zinc-500">该页面为占位实现；后续可接入算法配置与规则参数。</div>
      </div>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择摄像头</div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">关闭</el-button>
        <el-button type="primary" disabled>保存（占位）</el-button>
      </div>
    </template>
  </el-dialog>
</template>

