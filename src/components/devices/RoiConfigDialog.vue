<script setup lang="ts">
import type { Camera } from '@/components/devices/CameraFormDialog.vue'
import RoiCanvasEditor from '@/components/deployments/RoiCanvasEditor.vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { RoiShape } from '@/utils/deploymentsMock'

const props = defineProps<{ modelValue: boolean; camera: Camera | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const active = ref<'roi' | 'params'>('roi')
type RoiMode = 'select' | 'draw_rect' | 'draw_polygon'
const roiMode = ref<RoiMode>('select')
const activeRoiId = ref('')
const rois = ref<RoiShape[]>([])
const confidence = ref(0.65)
const triggerCount = ref(3)
const minSize = ref(48)
const saving = ref(false)

watch(
  () => open.value,
  (v) => {
    if (!v) return
    active.value = 'roi'
    roiMode.value = 'select'
    loadByCamera()
  }
)

const roiBackgroundUrl = computed(() => {
  if (!props.camera) return ''
  const encoded = encodeURIComponent(
    `SDXL, CCTV camera view background, camera ${props.camera.name}, realistic, neutral colors`
  )
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`
})

const storageKey = computed(() => `edge_camera_roi_v1_${props.camera?.id || 'unknown'}`)

function makeRoiId() {
  const n = Math.floor(100 + Math.random() * 900)
  return `ROI-${n}`
}

function loadByCamera() {
  if (!props.camera) return
  rois.value = []
  confidence.value = 0.65
  triggerCount.value = 3
  minSize.value = 48
  try {
    const raw = window.localStorage.getItem(storageKey.value)
    if (!raw) return
    const parsed = JSON.parse(raw)
    const nextRois = Array.isArray(parsed.rois) ? parsed.rois : []
    rois.value = nextRois.map((r: any, idx: number) => ({
      id: String(r.id || makeRoiId()),
      name: String(r.name || `ROI-${idx + 1}`),
      type: r.type === 'rect' ? 'rect' : 'polygon',
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      points: Array.isArray(r.vertices) ? r.vertices.length : Number(r.points || 0),
      vertices: Array.isArray(r.vertices) ? r.vertices : [],
      paramsOverride: r.paramsOverride || undefined,
    }))
    confidence.value = Number(parsed.params?.confidence ?? 0.65)
    triggerCount.value = Number(parsed.params?.triggerCount ?? 3)
    minSize.value = Number(parsed.params?.minSize ?? 48)
  } catch {
    rois.value = []
  }
  activeRoiId.value = rois.value[0]?.id || ''
}

function newRoi(type: 'rect' | 'polygon') {
  const id = makeRoiId()
  rois.value = [
    ...rois.value,
    {
      id,
      name: `ROI-${rois.value.length + 1}`,
      type,
      enabled: true,
      points: 0,
      vertices: [],
    },
  ]
  activeRoiId.value = id
  roiMode.value = type === 'rect' ? 'draw_rect' : 'draw_polygon'
}

function completeDraw() {
  roiMode.value = 'select'
}

function cancelDraw() {
  if (roiMode.value === 'select') return
  const activeRoi = rois.value.find((r) => r.id === activeRoiId.value)
  if (activeRoi && (!activeRoi.vertices || activeRoi.vertices.length < 3)) {
    rois.value = rois.value.filter((r) => r.id !== activeRoi.id)
    activeRoiId.value = rois.value[0]?.id || ''
  }
  roiMode.value = 'select'
}

function removeRoi(id: string) {
  rois.value = rois.value.filter((r) => r.id !== id)
  if (activeRoiId.value === id) activeRoiId.value = rois.value[0]?.id || ''
}

function onCanvasRoisUpdate(next: RoiShape[]) {
  rois.value = next
}

function onCanvasActiveUpdate(nextId: string) {
  activeRoiId.value = nextId
}

async function clearRois() {
  const confirmed = await ElMessageBox.confirm('确认清空当前摄像头的全部 ROI 区域？', '清空ROI', {
    type: 'warning',
    confirmButtonText: '清空',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  rois.value = []
  activeRoiId.value = ''
  roiMode.value = 'select'
}

const activeRoi = computed(() => rois.value.find((r) => r.id === activeRoiId.value) || null)

async function onSave() {
  if (!props.camera) return
  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 200))
    window.localStorage.setItem(
      storageKey.value,
      JSON.stringify({
        cameraId: props.camera.id,
        rois: rois.value,
        params: {
          minSize: minSize.value,
          confidence: confidence.value,
          triggerCount: triggerCount.value,
        },
        updatedAtMs: Date.now(),
      })
    )
    ElMessage.success('ROI 配置已保存')
    open.value = false
  } finally {
    saving.value = false
  }
}
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
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-xs text-zinc-500">画布区域</div>
            <div class="flex items-center gap-2">
              <el-button size="small" :disabled="roiMode !== 'select'" @click="newRoi('rect')">新建矩形</el-button>
              <el-button size="small" :disabled="roiMode !== 'select'" @click="newRoi('polygon')">新建多边形</el-button>
              <el-button v-if="roiMode !== 'select'" size="small" type="primary" @click="completeDraw">完成</el-button>
              <el-button v-if="roiMode !== 'select'" size="small" @click="cancelDraw">取消</el-button>
            </div>
          </div>
          <div class="mt-2">
            <RoiCanvasEditor
              :rois="rois"
              :active-id="activeRoiId"
              :mode="roiMode"
              :background-url="roiBackgroundUrl"
              @update:rois="onCanvasRoisUpdate"
              @update:active-id="onCanvasActiveUpdate"
              @complete-draw="completeDraw"
              @cancel-draw="cancelDraw"
            />
          </div>
        </div>
        <div class="rounded-xl border border-zinc-200 bg-white p-3">
          <div class="flex items-center justify-between">
            <div class="text-xs text-zinc-500">ROI列表</div>
            <el-button size="small" :disabled="!rois.length || roiMode !== 'select'" @click="clearRois">清空</el-button>
          </div>
          <div class="mt-2 space-y-2">
            <div v-if="!rois.length" class="text-xs text-zinc-500">暂无ROI</div>
            <div
              v-for="r in rois"
              :key="r.id"
              class="rounded-lg border p-2"
              :class="r.id === activeRoiId ? 'border-blue-300 bg-blue-50' : 'border-zinc-200'"
              @click="activeRoiId = r.id"
            >
              <div class="flex items-center justify-between gap-2">
                <el-input v-model="r.name" size="small" @click.stop />
                <el-switch v-model="r.enabled" size="small" @click.stop />
              </div>
              <div class="mt-1 text-xs text-zinc-500">
                类型：{{ r.type === 'rect' ? '矩形' : '多边形' }}｜点数：{{ r.vertices?.length || r.points || 0 }}
              </div>
              <div class="mt-1 text-right">
                <el-button link type="danger" size="small" @click.stop="removeRoi(r.id)">删除</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="rounded-xl border border-zinc-200 bg-white p-3">
        <div class="text-xs text-zinc-500">参数面板</div>
        <div class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
          <el-input-number v-model="minSize" :min="8" :max="1024" placeholder="最小目标尺寸" />
          <el-input-number v-model="confidence" :min="0.1" :max="0.99" :step="0.01" placeholder="置信度阈值" />
          <el-input-number v-model="triggerCount" :min="1" :max="10" placeholder="触发次数阈值" />
        </div>
        <div v-if="activeRoi" class="mt-3 text-xs text-zinc-500">当前选中区域：{{ activeRoi.name }}（{{ activeRoi.id }}）</div>
      </div>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择摄像头</div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">关闭</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

