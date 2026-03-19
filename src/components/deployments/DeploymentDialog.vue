<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import AlgorithmInstanceDialog from '@/components/deployments/AlgorithmInstanceDialog.vue'
import RoiCanvasEditor from '@/components/deployments/RoiCanvasEditor.vue'
import {
  defaultDeploymentParams,
  defaultInstanceParams,
  makeCameraOptions,
  type AlgorithmInstance,
  type Deployment,
  type DeploymentParams,
  type DeploymentStatus,
  type DeploymentRunStatus,
  type RoiShape,
  type TimeSlot,
} from '@/utils/deploymentsMock'
import type { Algorithm } from '@/utils/algorithmsMock'

const props = defineProps<{ modelValue: boolean; initial: Deployment | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved', deployment: Deployment): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

type FormModel = {
  name: string
  cameraId: string
  enabled: boolean
}

const cameraOptions = makeCameraOptions()
type Option = { id: string; label: string }

const ALGORITHMS_KEY = 'edge_algorithms_v1'

function loadAlgorithmsFromStorage(): Algorithm[] {
  try {
    const raw = window.localStorage.getItem(ALGORITHMS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Algorithm[]) : []
  } catch {
    return []
  }
}

function loadAlgorithmOptionsFromStorage(): Option[] {
  try {
    const raw = window.localStorage.getItem(ALGORITHMS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as Algorithm[])
      .filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string')
      .map((x) => ({ id: x.id, label: x.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
  } catch {
    return []
  }
}

function makeFallbackAlgorithmOptions(): Option[] {
  return [
    { id: 'ALG-10001', label: '安全帽检测' },
    { id: 'ALG-10002', label: '离岗检测' },
    { id: 'ALG-10003', label: '违停占道检测' },
    { id: 'ALG-10004', label: '火焰识别' },
    { id: 'ALG-10005', label: '公共区域卫生' },
  ]
}

const algorithmOptions = ref<Option[]>([])
const algorithmMetas = ref<Algorithm[]>([])

function refreshAlgorithmOptions() {
  algorithmMetas.value = loadAlgorithmsFromStorage()
  const list = loadAlgorithmOptionsFromStorage()
  algorithmOptions.value = list.length ? list : makeFallbackAlgorithmOptions()
}

const form = reactive<FormModel>({
  name: '',
  cameraId: cameraOptions[0]?.id || '',
  enabled: true,
})

const params = reactive<DeploymentParams>(defaultDeploymentParams())

const instances = ref<AlgorithmInstance[]>([])
const activeInstanceId = ref('')

const formRef = ref()
const saving = ref(false)
const title = computed(() => (props.initial ? '编辑布点' : '新增布点'))

const rules = {
  name: [{ required: true, message: '请输入布点名称', trigger: 'blur' }],
  cameraId: [{ required: true, message: '请选择摄像头', trigger: 'change' }],
}

function resetFromInitial() {
  refreshAlgorithmOptions()
  if (!props.initial) {
    form.name = ''
    form.cameraId = cameraOptions[0]?.id || ''
    form.enabled = true
    params.repeat = defaultDeploymentParams().repeat
    params.timeSlots = defaultDeploymentParams().timeSlots.map((s) => ({ ...s }))
    instances.value = []
    activeInstanceId.value = ''
    return
  }

  form.name = props.initial.name
  form.cameraId = props.initial.cameraId
  form.enabled = props.initial.status === '已启用'
  params.repeat = props.initial.params.repeat || defaultDeploymentParams().repeat
  params.timeSlots = Array.isArray(props.initial.params.timeSlots)
    ? props.initial.params.timeSlots.map((s) => ({ ...s }))
    : defaultDeploymentParams().timeSlots.map((s) => ({ ...s }))
  instances.value = props.initial.instances.map((x) => ({
    ...x,
    algorithmName: algorithmOptions.value.find((a) => a.id === x.algorithmId)?.label || x.algorithmName,
    rois: x.rois.map((r) => ({
      ...r,
      enabled: typeof (r as any).enabled === 'boolean' ? (r as any).enabled : true,
      vertices: Array.isArray((r as any).vertices) ? (r as any).vertices : undefined,
      points: Array.isArray((r as any).vertices) ? (r as any).vertices.length : (r as any).points || 0,
      paramsOverride: (r as any).paramsOverride && typeof (r as any).paramsOverride === 'object' ? (r as any).paramsOverride : undefined,
    })),
    params: x.params ? { ...x.params } : defaultInstanceParams(),
  }))
  activeInstanceId.value = instances.value[0]?.id || ''
}

watch(
  () => open.value,
  (v) => {
    if (!v) return
    resetFromInitial()
  }
)

const activeInstance = computed(() => instances.value.find((x) => x.id === activeInstanceId.value) || null)

type RoiMode = 'select' | 'draw_rect' | 'draw_polygon'
const roiMode = ref<RoiMode>('select')
const activeRoiId = ref('')

function mockImage(prompt: string) {
  const encoded = encodeURIComponent(`SDXL, CCTV camera view background, ${prompt}, realistic, neutral colors, high detail`)
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`
}

const roiBackgroundUrl = computed(() => {
  const label = cameraLabelById(form.cameraId)
  return mockImage(`scene ${label}`)
})

function ensureActiveInstance() {
  if (activeInstanceId.value && instances.value.some((x) => x.id === activeInstanceId.value)) return
  activeInstanceId.value = instances.value[0]?.id || ''
}

watch(
  () => instances.value,
  () => ensureActiveInstance(),
  { deep: true }
)

function makeDeploymentId() {
  const n = Math.floor(10000 + Math.random() * 90000)
  return `DEP-${String(n).padStart(5, '0')}`
}

function cameraLabelById(id: string) {
  const c = cameraOptions.find((x) => x.id === id)
  return c ? c.label : '—'
}

const instanceDialogOpen = ref(false)
const editingInstance = ref<AlgorithmInstance | null>(null)

function openAddInstance() {
  editingInstance.value = null
  instanceDialogOpen.value = true
}

function openEditInstance(ins: AlgorithmInstance) {
  editingInstance.value = { ...ins, rois: ins.rois.map((r) => ({ ...r })), params: { ...ins.params } }
  instanceDialogOpen.value = true
}

function upsertInstance(ins: AlgorithmInstance) {
  const idx = instances.value.findIndex((x) => x.id === ins.id)
  if (idx >= 0) instances.value[idx] = ins
  else instances.value.push(ins)
  activeInstanceId.value = ins.id
}

function normalizeSlots(slots: TimeSlot[]) {
  return slots
    .map((s) => ({ start: String(s.start || '').slice(0, 5), end: String(s.end || '').slice(0, 5) }))
    .filter((s) => s.start && s.end)
    .filter((s) => s.start < s.end)
}

function addSlot() {
  if (params.timeSlots.length >= 8) {
    ElMessage.warning('最多支持8个时间段')
    return
  }
  params.timeSlots.push({ start: '09:00', end: '18:00' })
}

function removeSlot(idx: number) {
  params.timeSlots.splice(idx, 1)
}

async function resetAllInstanceParams() {
  const confirmed = await ElMessageBox.confirm('确认将该布点下所有算法实例参数重置为默认值？', '参数重置', {
    type: 'warning',
    confirmButtonText: '重置',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  instances.value = instances.value.map((x) => ({ ...x, params: defaultInstanceParams() }))
}

async function removeInstance(ins: AlgorithmInstance) {
  const confirmed = await ElMessageBox.confirm(`确认删除算法实例「${ins.algorithmName}」？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  instances.value = instances.value.filter((x) => x.id !== ins.id)
}

function makeRoiId() {
  const n = Math.floor(100 + Math.random() * 900)
  return `ROI-${String(n).padStart(3, '0')}`
}

function addSampleRoi() {
  if (!activeInstance.value) return
  const isRect = Math.random() < 0.35
  const next: RoiShape = {
    id: makeRoiId(),
    name: `ROI-${activeInstance.value.rois.length + 1}`,
    type: isRect ? 'rect' : 'polygon',
    enabled: true,
    points: isRect ? 4 : 5,
    vertices: isRect
      ? [
          { x: 0.25, y: 0.25 },
          { x: 0.65, y: 0.25 },
          { x: 0.65, y: 0.6 },
          { x: 0.25, y: 0.6 },
        ]
      : [
          { x: 0.25, y: 0.25 },
          { x: 0.65, y: 0.25 },
          { x: 0.72, y: 0.5 },
          { x: 0.5, y: 0.7 },
          { x: 0.25, y: 0.6 },
        ],
  }
  const idx = instances.value.findIndex((x) => x.id === activeInstance.value?.id)
  if (idx < 0) return
  instances.value[idx] = { ...instances.value[idx], rois: [...instances.value[idx].rois, next] }
}

function ensureActiveRoi() {
  const rois = activeInstance.value?.rois || []
  if (activeRoiId.value && rois.some((r) => r.id === activeRoiId.value)) return
  activeRoiId.value = rois[0]?.id || ''
}

watch(
  () => activeInstanceId.value,
  () => {
    roiMode.value = 'select'
    ensureActiveRoi()
  }
)

watch(
  () => instances.value,
  () => ensureActiveRoi(),
  { deep: true }
)

const activeRoi = computed(() => {
  const rois = activeInstance.value?.rois || []
  return rois.find((r) => r.id === activeRoiId.value) || null
})

function setActiveRoi(id: string) {
  activeRoiId.value = id
  roiMode.value = 'select'
}

function updateActiveInstanceRois(next: RoiShape[]) {
  if (!activeInstance.value) return
  const idx = instances.value.findIndex((x) => x.id === activeInstance.value?.id)
  if (idx < 0) return
  instances.value[idx] = { ...instances.value[idx], rois: next }
}

function newRoi(type: 'rect' | 'polygon') {
  if (!activeInstance.value) return
  const id = makeRoiId()
  const next: RoiShape = {
    id,
    name: `ROI-${(activeInstance.value.rois?.length || 0) + 1}`,
    type,
    enabled: true,
    points: 0,
    vertices: [],
  }
  updateActiveInstanceRois([...(activeInstance.value.rois || []), next])
  activeRoiId.value = id
  roiMode.value = type === 'rect' ? 'draw_rect' : 'draw_polygon'
}

function cancelDraw() {
  roiMode.value = 'select'
  if (activeRoi.value && (!activeRoi.value.vertices || activeRoi.value.vertices.length < 3)) {
    const rois = (activeInstance.value?.rois || []).filter((r) => r.id !== activeRoiId.value)
    updateActiveInstanceRois(rois)
    activeRoiId.value = rois[0]?.id || ''
  }
}

function completeDraw() {
  roiMode.value = 'select'
}

function removeRoi(id: string) {
  if (!activeInstance.value) return
  const rois = (activeInstance.value.rois || []).filter((r) => r.id !== id)
  updateActiveInstanceRois(rois)
  if (activeRoiId.value === id) activeRoiId.value = rois[0]?.id || ''
  roiMode.value = 'select'
}

function toggleRoiOverride(roi: RoiShape, enabled: boolean) {
  const rois = (activeInstance.value?.rois || []).map((r) => {
    if (r.id !== roi.id) return r
    if (!enabled) return { ...r, paramsOverride: undefined }
    return { ...r, paramsOverride: r.paramsOverride || { confidence: undefined, triggerCount: undefined } }
  })
  updateActiveInstanceRois(rois)
}

async function clearRois() {
  if (!activeInstance.value) return
  const confirmed = await ElMessageBox.confirm('确认清空当前实例的所有ROI？', '清空ROI', {
    type: 'warning',
    confirmButtonText: '清空',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  const idx = instances.value.findIndex((x) => x.id === activeInstance.value?.id)
  if (idx < 0) return
  instances.value[idx] = { ...instances.value[idx], rois: [] }
}

function switchTabSafety() {
  if (!activeInstanceId.value && instances.value.length) {
    activeInstanceId.value = instances.value[0].id
  }
}

async function onSave() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return
  if (instances.value.length === 0) {
    ElMessage.warning('请至少添加一个算法实例（占位约束）')
    return
  }

  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 320))
    const id = props.initial?.id || makeDeploymentId()
    const status: DeploymentStatus = form.enabled ? '已启用' : '已停用'
    const runStatus: DeploymentRunStatus = form.enabled ? props.initial?.runStatus || '运行中' : '已暂停'
    emit('saved', {
      id,
      name: form.name,
      cameraId: form.cameraId,
      cameraLabel: cameraLabelById(form.cameraId),
      status,
      runStatus,
      instances: instances.value.map((x) => ({
        ...x,
        rois: x.rois.map((r) => ({
          ...r,
          points: Array.isArray(r.vertices) ? r.vertices.length : r.points,
          enabled: typeof (r as any).enabled === 'boolean' ? (r as any).enabled : true,
        })),
        params: { ...x.params },
      })),
      params: { repeat: params.repeat, timeSlots: normalizeSlots(params.timeSlots) },
      updatedAtMs: Date.now(),
    })
    open.value = false
    ElMessage.success('已保存布点（占位）')
  } finally {
    saving.value = false
  }
}

const active = ref<'instances' | 'roi' | 'params'>('instances')
watch(
  () => active.value,
  () => switchTabSafety()
)
</script>

<template>
  <el-dialog v-model="open" :title="title" width="1040" destroy-on-close>
    <div class="space-y-4">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="92">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <el-form-item label="布点名称" prop="name" class="md:col-span-2">
            <el-input v-model="form.name" placeholder="例如：北门出入口-3 安全帽布点" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
          <el-form-item label="摄像头" prop="cameraId" class="md:col-span-2">
            <el-select v-model="form.cameraId" placeholder="选择摄像头" filterable>
              <el-option v-for="c in cameraOptions" :key="c.id" :label="c.label" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="实例数量">
            <el-input :model-value="String(instances.length)" disabled />
          </el-form-item>
        </div>
      </el-form>

      <el-segmented
        v-model="active"
        size="small"
        :options="[
          { label: '算法实例', value: 'instances' },
          { label: 'ROI画板', value: 'roi' },
          { label: '参数配置', value: 'params' },
        ]"
      />

      <div v-if="active === 'instances'" class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold">算法实例</div>
          <el-button type="primary" @click="openAddInstance">新增实例</el-button>
        </div>
        <el-table :data="instances" size="small" class="table-standard" height="420">
          <el-table-column prop="algorithmName" label="算法" min-width="180" />
          <el-table-column label="版本" width="140">
            <template #default="scope">
              <span class="font-mono text-xs">{{ scope.row.version }}</span>
            </template>
          </el-table-column>
          <el-table-column label="启用" width="90">
            <template #default="scope">
              <el-tag :type="scope.row.enabled ? 'success' : 'info'" size="small">{{ scope.row.enabled ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="ROI" width="90">
            <template #default="scope">
              <span class="font-mono text-xs">{{ scope.row.rois.length }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="scope">
              <div class="flex items-center gap-2">
                <el-button link type="primary" size="small" @click="activeInstanceId = scope.row.id; active = 'roi'">ROI</el-button>
                <el-button link type="primary" size="small" @click="openEditInstance(scope.row)">编辑</el-button>
                <el-button link type="primary" size="small" @click="removeInstance(scope.row)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-else-if="active === 'roi'" class="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div class="lg:col-span-2 rounded-xl border border-zinc-200 bg-white p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="text-sm font-semibold">ROI画板</div>
              <div class="mt-1 text-xs text-zinc-500">支持矩形/多边形绘制、拖拽点编辑、拖拽移动与缩放。</div>
            </div>
            <div class="flex items-center gap-2">
              <el-select v-model="activeInstanceId" placeholder="选择实例" class="w-[220px]" filterable>
                <el-option v-for="ins in instances" :key="ins.id" :label="ins.algorithmName" :value="ins.id" />
              </el-select>
              <el-button size="small" @click="newRoi('rect')" :disabled="!activeInstance || roiMode !== 'select'">新建矩形</el-button>
              <el-button size="small" @click="newRoi('polygon')" :disabled="!activeInstance || roiMode !== 'select'">新建多边形</el-button>
              <el-button v-if="roiMode !== 'select'" size="small" type="primary" @click="completeDraw">完成</el-button>
              <el-button v-if="roiMode !== 'select'" size="small" @click="cancelDraw">取消</el-button>
            </div>
          </div>

          <div class="mt-3">
            <RoiCanvasEditor
              :rois="activeInstance?.rois || []"
              :active-id="activeRoiId"
              :mode="roiMode"
              :background-url="roiBackgroundUrl"
              @update:rois="updateActiveInstanceRois"
              @update:active-id="setActiveRoi"
              @complete-draw="completeDraw"
              @cancel-draw="cancelDraw"
            />
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-white p-3">
          <div class="flex items-center justify-between gap-2">
            <div class="text-sm font-semibold">ROI列表</div>
            <div class="flex items-center gap-2">
              <el-button size="small" @click="addSampleRoi" :disabled="!activeInstance || roiMode !== 'select'">示例</el-button>
              <el-button size="small" @click="clearRois" :disabled="!activeInstance || roiMode !== 'select'">清空</el-button>
            </div>
          </div>

          <div class="mt-3 space-y-2">
            <div v-if="!activeInstance" class="text-sm text-zinc-600">暂无实例，请先添加算法实例。</div>
            <div v-else-if="activeInstance.rois.length === 0" class="text-sm text-zinc-600">暂无ROI</div>

            <div
              v-else
              v-for="r in activeInstance.rois"
              :key="r.id"
              class="rounded-lg border p-2"
              :class="r.id === activeRoiId ? 'border-blue-300 bg-blue-50' : 'border-zinc-200 bg-white'"
              @click="setActiveRoi(r.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <el-input v-model="r.name" size="small" class="w-40" @click.stop />
                <div class="flex items-center gap-2">
                  <el-switch v-model="r.enabled" size="small" @click.stop />
                  <el-tag size="small" :type="r.type === 'rect' ? 'info' : 'success'">{{ r.type === 'rect' ? '矩形' : '多边形' }}</el-tag>
                </div>
              </div>
              <div class="mt-1 flex items-center justify-between">
                <span class="font-mono text-xs text-zinc-500">{{ r.id }}</span>
                <span class="text-xs text-zinc-500">点数：{{ (r.vertices?.length || r.points) }}</span>
              </div>
            </div>
          </div>

          <div v-if="activeRoi" class="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div class="flex items-center justify-between">
              <div class="text-sm font-semibold">区域参数</div>
              <el-button link type="primary" size="small" @click="removeRoi(activeRoi.id)">删除区域</el-button>
            </div>

            <div class="mt-2 flex items-center justify-between">
              <div class="text-xs text-zinc-500">启用覆盖参数</div>
              <el-switch :model-value="Boolean(activeRoi.paramsOverride)" @change="(v:any)=>toggleRoiOverride(activeRoi, Boolean(v))" />
            </div>

            <div v-if="activeRoi.paramsOverride" class="mt-3 grid grid-cols-1 gap-3">
              <div>
                <div class="text-xs text-zinc-500">置信度阈值（覆盖）</div>
                <el-input-number v-model="activeRoi.paramsOverride.confidence" :min="0.1" :max="0.99" :step="0.01" class="mt-1 w-full" />
              </div>
              <div>
                <div class="text-xs text-zinc-500">触发次数（覆盖）</div>
                <el-input-number v-model="activeRoi.paramsOverride.triggerCount" :min="1" :max="10" class="mt-1 w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="rounded-xl border border-zinc-200 bg-white p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="text-sm font-semibold">布防时间</div>
            <div class="mt-1 text-xs text-zinc-500">设置布点生效的重复周期与时间段。</div>
          </div>
          <el-button size="small" @click="resetAllInstanceParams" :disabled="instances.length === 0">实例参数一键重置</el-button>
        </div>

        <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div class="text-xs text-zinc-500">重复周期</div>
            <el-select v-model="params.repeat" class="mt-1 w-full">
              <el-option label="每天" value="每天" />
              <el-option label="工作日" value="工作日" />
              <el-option label="周末" value="周末" />
              <el-option label="自定义" value="自定义" />
            </el-select>
          </div>
          <div class="md:col-span-2">
            <div class="flex items-center justify-between">
              <div class="text-xs text-zinc-500">时间段</div>
              <el-button size="small" @click="addSlot">新增时间段</el-button>
            </div>
            <div class="mt-2 space-y-2">
              <div v-if="!params.timeSlots.length" class="text-xs text-zinc-500">未设置</div>
              <div v-for="(s, idx) in params.timeSlots" :key="idx" class="flex items-center gap-2">
                <el-time-select v-model="s.start" start="00:00" step="00:15" end="23:45" class="w-28" />
                <span class="text-xs text-zinc-500">~</span>
                <el-time-select v-model="s.end" start="00:00" step="00:15" end="23:45" class="w-28" />
                <el-button link type="primary" size="small" @click="removeSlot(idx)">移除</el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
          说明：此处仅配置布点启停时间，实例级检测参数请在“算法实例-编辑”中配置。
        </div>
      </div>
    </div>

    <AlgorithmInstanceDialog
      v-model="instanceDialogOpen"
      :initial="editingInstance"
      :algorithms="algorithmOptions"
      :algorithm-metas="algorithmMetas"
      @saved="upsertInstance"
    />

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>
