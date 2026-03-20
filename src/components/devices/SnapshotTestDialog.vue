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
const lastSuccessAtMs = ref(0)
const lastError = ref('')
const runCount = ref(0)

type SnapshotHistory = {
  tsMs: number
  status: '成功' | '失败'
  message: string
}
const history = ref<SnapshotHistory[]>([])

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
    lastError.value = ''
  }
)

async function runOnce() {
  if (!props.camera) return
  runCount.value += 1
  lastError.value = ''
  loading.value = true
  try {
    await new Promise((r) => setTimeout(r, 550))
    const shouldFail = runCount.value % 4 === 0
    if (shouldFail) {
      throw new Error('模拟抓图超时，请检查摄像头连接与流地址')
    }
    resultUrl.value = mockImage(`camera snapshot test, camera ${props.camera.name}, ip ${props.camera.ip}`)
    lastSuccessAtMs.value = Date.now()
    history.value = [
      { tsMs: lastSuccessAtMs.value, status: '成功' as const, message: '抓图完成，已生成预览图' },
      ...history.value,
    ].slice(0, 8)
    ElMessage.success('抓图成功')
  } catch (err) {
    const msg = err instanceof Error ? err.message : '抓图失败'
    lastError.value = msg
    history.value = [{ tsMs: Date.now(), status: '失败' as const, message: msg }, ...history.value].slice(0, 8)
    ElMessage.error(msg)
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
          <div class="text-xs text-zinc-500">执行状态</div>
          <div class="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
            <div>最近成功：{{ lastSuccessAtMs ? new Date(lastSuccessAtMs).toLocaleString() : '暂无' }}</div>
            <div class="mt-1">最近失败：{{ lastError || '无' }}</div>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <el-button type="primary" :loading="loading" @click="runOnce">开始抓图</el-button>
            <el-button :disabled="loading || !lastError" @click="runOnce">重试</el-button>
          </div>
          <div class="mt-3">
            <div class="mb-1 text-xs text-zinc-500">最近记录</div>
            <div v-if="!history.length" class="text-xs text-zinc-500">暂无执行记录</div>
            <div v-else class="max-h-[130px] space-y-1 overflow-auto">
              <div
                v-for="item in history"
                :key="`${item.tsMs}-${item.status}`"
                class="rounded border border-zinc-200 bg-white px-2 py-1 text-xs"
              >
                <span class="font-mono text-zinc-500">{{ new Date(item.tsMs).toLocaleTimeString() }}</span>
                <span class="mx-1">{{ item.status }}</span>
                <span class="text-zinc-600">{{ item.message }}</span>
              </div>
            </div>
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

