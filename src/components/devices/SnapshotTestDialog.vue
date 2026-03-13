<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { Camera } from '@/components/devices/CameraFormDialog.vue'

const props = defineProps<{ modelValue: boolean; camera: Camera | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)
const resultUrl = ref('')

function mockImage(prompt: string) {
  const encoded = encodeURIComponent(
    `SDXL, professional surveillance snapshot, ${prompt}, realistic CCTV, high detail, sharp, documentary, neutral colors`
  )
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`
}

watch(
  () => open.value,
  (v) => {
    if (!v) return
    resultUrl.value = ''
  }
)

async function runOnce() {
  if (!props.camera) return
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 550))
    resultUrl.value = mockImage(`camera snapshot test, camera ${props.camera.name}, ip ${props.camera.ip}`)
    ElMessage.success('抓图成功（占位）')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" title="抓图测试" width="760" destroy-on-close>
    <div v-if="camera" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="text-xs text-zinc-500">摄像头</div>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">{{ camera.name }}</span>
          <span class="text-xs text-zinc-500">{{ camera.ip }}:{{ camera.port }}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div class="rounded-xl border border-zinc-200 bg-white p-3">
          <div class="text-xs text-zinc-500">结果预览</div>
          <div class="mt-2">
            <el-image
              v-if="resultUrl"
              :src="resultUrl"
              fit="cover"
              class="h-[220px] w-full rounded-lg bg-zinc-50"
              :preview-src-list="[resultUrl]"
            />
            <div v-else class="flex h-[220px] items-center justify-center rounded-lg bg-zinc-50 text-xs text-zinc-500">
              暂无结果
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-white p-3">
          <div class="text-xs text-zinc-500">说明</div>
          <div class="mt-2 text-sm text-zinc-700">
            该弹窗为占位实现；后续可接入后端接口获取实时抓图与错误码。
          </div>
          <div class="mt-4">
            <el-button type="primary" :loading="loading" @click="runOnce">开始抓图</el-button>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择摄像头</div>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

