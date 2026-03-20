<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import AlgorithmInstanceDialog from '@/components/deployments/AlgorithmInstanceDialog.vue'
import RoiCanvasEditor from '@/components/deployments/RoiCanvasEditor.vue'
import {
  defaultInstanceParams,
  defaultInstanceSchedule,
  makeCameraOptions,
  type AlgorithmInstance,
  type Deployment,
  type DeploymentStatus,
  type DeploymentRunStatus,
  type RoiShape,
  type InstanceSchedule,
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

const instances = ref<AlgorithmInstance[]>([])
const activeInstanceId = ref('')
const deploymentRois = ref<RoiShape[]>([])

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
    instances.value = []
    deploymentRois.value = []
    activeInstanceId.value = ''
    return
  }

  form.name = props.initial.name
  form.cameraId = props.initial.cameraId
  form.enabled = props.initial.status === '已启用'
  instances.value = props.initial.instances.map((x) => ({
    ...x,
    algorithmName: algorithmOptions.value.find((a) => a.id === x.algorithmId)?.label || x.algorithmName,
    roiIds: Array.isArray((x as any).roiIds) ? (x as any).roiIds.map((id: any) => String(id || '')).filter(Boolean) : [],
    params: x.params ? { ...x.params } : defaultInstanceParams(),
    schedule: x.schedule ? { ...x.schedule } : defaultInstanceSchedule(),
  }))
  deploymentRois.value = Array.isArray((props.initial as any).rois)
    ? ((props.initial as any).rois as any[]).map((r: any, idx: number) => ({
        id: String(r.id || makeRoiId()),
        name: String(r.name || `ROI-${idx + 1}`),
        type: r.type === 'rect' ? 'rect' : 'polygon',
        enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
        vertices: Array.isArray(r.vertices) ? r.vertices : [],
        points: Array.isArray(r.vertices) ? r.vertices.length : Number(r.points || 0),
      }))
    : []
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
  editingInstance.value = { ...ins, roiIds: [...(ins.roiIds || [])], params: { ...ins.params }, schedule: { ...ins.schedule } }
  instanceDialogOpen.value = true
}

function upsertInstance(ins: AlgorithmInstance) {
  const idx = instances.value.findIndex((x) => x.id === ins.id)
  if (idx >= 0) instances.value[idx] = ins
  else instances.value.push(ins)
  activeInstanceId.value = ins.id
}

function normalizeSlot(s: TimeSlot) {
  const start = String(s.start || '').slice(0, 5)
  const end = String(s.end || '').slice(0, 5)
  return { start, end }
}

function normalizeSchedule(s: InstanceSchedule): InstanceSchedule {
  const repeat = s.repeat || '每天'
  const mode = s.mode === 'interval' ? 'interval' : 'fixed_time'
  const timePoints = Array.isArray(s.timePoints) ? s.timePoints.map((x) => String(x || '').slice(0, 5)).filter(Boolean) : []
  const intervalMin = Number(s.intervalMin || 5)
  const intervalSlot = normalizeSlot(s.intervalSlot || { start: '09:00', end: '18:00' })
  return {
    mode,
    repeat,
    timePoints: timePoints.length ? timePoints : ['09:00'],
    intervalMin: Math.min(120, Math.max(1, intervalMin)),
    intervalSlot: intervalSlot.start < intervalSlot.end ? intervalSlot : { start: '09:00', end: '18:00' },
  }
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

async function resetAllInstanceSchedules() {
  const confirmed = await ElMessageBox.confirm('确认将该布点下所有算法实例调度重置为默认值？', '调度重置', {
    type: 'warning',
    confirmButtonText: '重置',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  instances.value = instances.value.map((x) => ({ ...x, schedule: defaultInstanceSchedule() }))
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
  const isRect = Math.random() < 0.35
  const next: RoiShape = {
    id: makeRoiId(),
    name: `ROI-${deploymentRois.value.length + 1}`,
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
  deploymentRois.value = [...deploymentRois.value, next]
  const ins = activeInstance.value
  if (ins && !(ins.roiIds || []).includes(next.id)) {
    updateActiveInstance({ roiIds: [...(ins.roiIds || []), next.id] })
  }
}

function ensureActiveRoi() {
  const rois = deploymentRois.value
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
  const rois = deploymentRois.value
  return rois.find((r) => r.id === activeRoiId.value) || null
})

function setActiveRoi(id: string) {
  activeRoiId.value = id
  roiMode.value = 'select'
}

function updateActiveInstanceRois(next: RoiShape[]) {
  deploymentRois.value = next
}

function newRoi(type: 'rect' | 'polygon') {
  const id = makeRoiId()
  const next: RoiShape = {
    id,
    name: `ROI-${(deploymentRois.value?.length || 0) + 1}`,
    type,
    enabled: true,
    points: 0,
    vertices: [],
  }
  updateActiveInstanceRois([...(deploymentRois.value || []), next])
  activeRoiId.value = id
  roiMode.value = type === 'rect' ? 'draw_rect' : 'draw_polygon'

  // 若已选中算法规则，默认勾选该 ROI（可在规则中取消）
  const cur = activeInstance.value
  if (cur) {
    updateActiveInstance({ roiIds: Array.from(new Set([...(cur.roiIds || []), id])) })
  }
}

function cancelDraw() {
  roiMode.value = 'select'
  if (activeRoi.value && (!activeRoi.value.vertices || activeRoi.value.vertices.length < 3)) {
    const rois = (deploymentRois.value || []).filter((r) => r.id !== activeRoiId.value)
    updateActiveInstanceRois(rois)
    // 同步把所有实例里引用该 ROI 的 id 移除
    instances.value = instances.value.map((ins) => ({ ...ins, roiIds: (ins.roiIds || []).filter((id) => id !== activeRoiId.value) }))
    activeRoiId.value = rois[0]?.id || ''
  }
}

function completeDraw() {
  roiMode.value = 'select'
}

function removeRoi(id: string) {
  const rois = (deploymentRois.value || []).filter((r) => r.id !== id)
  updateActiveInstanceRois(rois)
  instances.value = instances.value.map((ins) => ({ ...ins, roiIds: (ins.roiIds || []).filter((x) => x !== id) }))
  if (activeRoiId.value === id) activeRoiId.value = rois[0]?.id || ''
  roiMode.value = 'select'
}

async function clearRois() {
  const confirmed = await ElMessageBox.confirm('确认清空当前布点的全部 ROI 区域？', '清空ROI', {
    type: 'warning',
    confirmButtonText: '清空',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  deploymentRois.value = []
  instances.value = instances.value.map((ins) => ({ ...ins, roiIds: [] }))
  activeRoiId.value = ''
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
      rois: deploymentRois.value.map((r) => ({
        ...r,
        points: Array.isArray(r.vertices) ? r.vertices.length : r.points,
        enabled: typeof (r as any).enabled === 'boolean' ? (r as any).enabled : true,
      })),
      instances: instances.value.map((x) => ({
        ...x,
        roiIds: (x.roiIds || []).filter(Boolean),
        params: { ...x.params },
        schedule: normalizeSchedule(x.schedule),
      })),
      params: props.initial?.params || { repeat: '每天', timeSlots: [{ start: '00:00', end: '23:59' }] },
      updatedAtMs: Date.now(),
    })
    open.value = false
    ElMessage.success('已保存布点（占位）')
  } finally {
    saving.value = false
  }
}

function updateActiveInstance(next: Partial<AlgorithmInstance>) {
  if (!activeInstance.value) return
  const idx = instances.value.findIndex((x) => x.id === activeInstance.value?.id)
  if (idx < 0) return
  instances.value[idx] = { ...instances.value[idx], ...next }
}

function scheduleSummary(s: InstanceSchedule) {
  const ns = normalizeSchedule(s)
  if (ns.mode === 'fixed_time') return `${ns.repeat} ${ns.timePoints.join('，')}`
  return `${ns.repeat} ${ns.intervalSlot.start}~${ns.intervalSlot.end} 每${ns.intervalMin}分钟`
}

const roiOptions = computed(() => deploymentRois.value.map((r) => ({ id: r.id, label: r.name })))
</script>

<template>
  <el-dialog v-model="open" :title="title" width="1080" destroy-on-close class="deployment-edit-dialog" top="4vh">
    <div class="max-h-[min(78vh,820px)] overflow-y-auto pr-1">
      <div class="space-y-6">
        <!-- 分区：基础信息 -->
        <section class="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 shadow-sm">
          <div class="border-l-4 border-blue-600 pl-3">
            <div class="text-base font-semibold text-zinc-900">基础信息</div>
            <p class="mt-1 text-xs leading-relaxed text-zinc-500">布点名称与绑定的摄像头；与下方检测区域、算法规则相互独立，可随时修改。</p>
          </div>
          <el-form ref="formRef" :model="form" :rules="rules" label-width="92" class="mt-4">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <el-form-item label="布点名称" prop="name" class="md:col-span-2">
                <el-input v-model="form.name" placeholder="例如：北门出入口-3 安全帽布点" />
              </el-form-item>
              <el-form-item label="启用">
                <el-switch v-model="form.enabled" />
              </el-form-item>
              <el-form-item label="摄像头" prop="cameraId" class="md:col-span-3">
                <el-select v-model="form.cameraId" placeholder="选择摄像头" filterable class="max-w-xl">
                  <el-option v-for="c in cameraOptions" :key="c.id" :label="c.label" :value="c.id" />
                </el-select>
              </el-form-item>
            </div>
          </el-form>
        </section>

        <!-- 分区：检测区域（仅 ROI，与算法无关） -->
        <section class="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div class="border-l-4 border-emerald-600 pl-3">
            <div class="text-base font-semibold text-zinc-900">检测区域（ROI）</div>
            <p class="mt-1 text-xs leading-relaxed text-zinc-500">
              在此画布上绘制或命名检测区域；<span class="font-medium text-zinc-700">无需先添加算法</span>。同一区域可被多条算法规则复用，请在下方「算法规则」中为每条规则勾选生效区域。
            </p>
          </div>

          <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div class="lg:col-span-2 rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs font-medium text-zinc-600">画布</span>
                <div class="flex flex-wrap items-center gap-2">
                  <el-button size="small" @click="newRoi('rect')" :disabled="roiMode !== 'select'">新建矩形</el-button>
                  <el-button size="small" @click="newRoi('polygon')" :disabled="roiMode !== 'select'">新建多边形</el-button>
                  <el-button v-if="roiMode !== 'select'" size="small" type="primary" @click="completeDraw">完成</el-button>
                  <el-button v-if="roiMode !== 'select'" size="small" @click="cancelDraw">取消</el-button>
                </div>
              </div>
              <div class="mt-3">
                <RoiCanvasEditor
                  :rois="deploymentRois"
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

            <div class="rounded-lg border border-zinc-100 bg-white p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-zinc-600">区域列表</span>
                <div class="flex items-center gap-2">
                  <el-button size="small" @click="addSampleRoi" :disabled="roiMode !== 'select'">示例</el-button>
                  <el-button size="small" @click="clearRois" :disabled="roiMode !== 'select'">清空</el-button>
                </div>
              </div>
              <div class="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                <div v-if="deploymentRois.length === 0" class="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center text-xs text-zinc-500">
                  暂无区域，请使用「新建矩形 / 多边形」在画布上绘制。
                </div>
                <div
                  v-else
                  v-for="r in deploymentRois"
                  :key="r.id"
                  class="rounded-lg border p-2 transition-colors"
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
                    <el-button link type="danger" size="small" @click.stop="removeRoi(r.id)">删除</el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 分区：算法规则（列表 + 当前规则详情） -->
        <section class="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-3">
            <div class="border-l-4 border-violet-600 pl-3">
              <div class="text-base font-semibold text-zinc-900">算法规则</div>
              <p class="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500">
                每条规则对应一个算法及其调度、参数。先在左侧新增规则并选择算法；再于右侧为<span class="font-medium text-zinc-700">当前选中规则</span>勾选上方已绘制的 ROI、设置运行时间与检测参数。
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span class="text-xs text-zinc-500">共 {{ instances.length }} 条</span>
              <el-button type="primary" size="small" @click="openAddInstance">新增规则</el-button>
            </div>
          </div>

          <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div class="lg:col-span-5">
              <div class="text-xs font-medium text-zinc-600">规则列表</div>
              <el-table
                :data="instances"
                size="small"
                class="table-standard mt-2"
                :height="360"
                highlight-current-row
                empty-text="暂无规则，请点击「新增规则」"
                @current-change="(row:any)=> row && (activeInstanceId = row.id)"
              >
                <el-table-column label="算法 / 摘要" min-width="200">
                  <template #default="scope">
                    <div class="min-w-0 py-1">
                      <div class="truncate text-sm font-semibold text-zinc-900">{{ scope.row.algorithmName }}</div>
                      <div class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                        <span class="font-mono">{{ scope.row.version || 'follow' }}</span>
                        <span>·</span>
                        <span>ROI {{ (scope.row.roiIds || []).length }} 个</span>
                      </div>
                      <div class="mt-1 text-xs text-zinc-400">{{ scheduleSummary(scope.row.schedule) }}</div>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="启用" width="72" align="center">
                  <template #default="scope">
                    <el-switch v-model="scope.row.enabled" />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="108" fixed="right" align="right">
                  <template #default="scope">
                    <el-button link type="primary" size="small" @click.stop="openEditInstance(scope.row)">算法</el-button>
                    <el-button link type="danger" size="small" @click.stop="removeInstance(scope.row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <div class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                <span>批量重置（预览）</span>
                <div class="flex gap-2">
                  <el-button size="small" @click="resetAllInstanceParams" :disabled="instances.length === 0">参数</el-button>
                  <el-button size="small" @click="resetAllInstanceSchedules" :disabled="instances.length === 0">调度</el-button>
                </div>
              </div>
            </div>

            <div class="lg:col-span-7 space-y-4">
              <div v-if="!activeInstance" class="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                请先在左侧表格中选中一条规则，或点击「新增规则」。
              </div>

              <template v-else>
                <div class="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3">
                  <div class="text-xs font-semibold text-zinc-700">当前规则：{{ activeInstance.algorithmName }}</div>
                  <div class="mt-1 font-mono text-xs text-zinc-500">{{ activeInstance.id }}</div>
                </div>

                <div class="rounded-lg border border-zinc-100 p-3">
                  <div class="text-sm font-semibold text-zinc-800">生效区域与运行时间</div>
                  <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-1">
                    <div>
                      <div class="text-xs text-zinc-500">生效 ROI</div>
                      <el-select v-model="activeInstance.roiIds" multiple filterable class="mt-1 w-full" placeholder="勾选本规则要检测的区域">
                        <el-option v-for="o in roiOptions" :key="o.id" :label="o.label" :value="o.id" />
                      </el-select>
                    </div>
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <div class="text-xs text-zinc-500">调度模式</div>
                        <el-select v-model="activeInstance.schedule.mode" class="mt-1 w-full">
                          <el-option label="固定时间点" value="fixed_time" />
                          <el-option label="按频次" value="interval" />
                        </el-select>
                      </div>
                      <div>
                        <div class="text-xs text-zinc-500">重复周期</div>
                        <el-select v-model="activeInstance.schedule.repeat" class="mt-1 w-full">
                          <el-option label="每天" value="每天" />
                          <el-option label="工作日" value="工作日" />
                          <el-option label="周末" value="周末" />
                          <el-option label="自定义" value="自定义" />
                        </el-select>
                      </div>
                    </div>
                    <div v-if="activeInstance.schedule.mode === 'fixed_time'">
                      <div class="flex items-center justify-between">
                        <div class="text-xs text-zinc-500">时间点</div>
                        <el-button
                          size="small"
                          @click="activeInstance.schedule.timePoints.push('09:00')"
                          :disabled="activeInstance.schedule.timePoints.length >= 6"
                        >
                          新增
                        </el-button>
                      </div>
                      <div class="mt-2 space-y-2">
                        <div v-for="(t, idx) in activeInstance.schedule.timePoints" :key="idx" class="flex items-center gap-2">
                          <el-time-select v-model="activeInstance.schedule.timePoints[idx]" start="00:00" step="00:15" end="23:45" class="w-28" />
                          <el-button link type="primary" size="small" @click="activeInstance.schedule.timePoints.splice(idx, 1)">移除</el-button>
                        </div>
                      </div>
                    </div>
                    <div v-else>
                      <div class="text-xs text-zinc-500">频次（分钟）</div>
                      <el-input-number v-model="activeInstance.schedule.intervalMin" :min="1" :max="120" class="mt-1 w-full max-w-xs" />
                      <div class="mt-2 text-xs text-zinc-500">时间窗</div>
                      <div class="mt-1 flex flex-wrap items-center gap-2">
                        <el-time-select v-model="activeInstance.schedule.intervalSlot.start" start="00:00" step="00:15" end="23:45" class="w-28" />
                        <span class="text-xs text-zinc-500">~</span>
                        <el-time-select v-model="activeInstance.schedule.intervalSlot.end" start="00:00" step="00:15" end="23:45" class="w-28" />
                      </div>
                    </div>
                  </div>
                </div>

                <div class="rounded-lg border border-zinc-100 p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-semibold text-zinc-800">检测参数</div>
                    <el-button size="small" @click="updateActiveInstance({ params: defaultInstanceParams() })">一键重置</el-button>
                  </div>
                  <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div class="text-xs text-zinc-500">置信度阈值</div>
                      <el-input-number v-model="activeInstance.params.confidence" :min="0.1" :max="0.99" :step="0.01" class="mt-1 w-full" />
                    </div>
                    <div>
                      <div class="text-xs text-zinc-500">触发次数</div>
                      <el-input-number v-model="activeInstance.params.triggerCount" :min="1" :max="10" class="mt-1 w-full" />
                    </div>
                    <div>
                      <div class="text-xs text-zinc-500">冷却时间(秒)</div>
                      <el-input-number v-model="activeInstance.params.cooldownSec" :min="0" :max="600" class="mt-1 w-full" />
                    </div>
                    <div>
                      <div class="text-xs text-zinc-500">检测灵敏度(0-100)</div>
                      <el-input-number v-model="activeInstance.params.sensitivity" :min="0" :max="100" class="mt-1 w-full" />
                    </div>
                    <div class="md:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div class="rounded-lg border border-zinc-100 bg-zinc-50 p-2">
                        <div class="text-xs text-zinc-500">联动抓拍</div>
                        <div class="mt-1"><el-switch v-model="activeInstance.params.linkSnapshot" /></div>
                      </div>
                      <div class="rounded-lg border border-zinc-100 bg-zinc-50 p-2">
                        <div class="text-xs text-zinc-500">报警弹屏</div>
                        <div class="mt-1"><el-switch v-model="activeInstance.params.popup" /></div>
                      </div>
                      <div class="rounded-lg border border-zinc-100 bg-zinc-50 p-2">
                        <div class="text-xs text-zinc-500">报警声音</div>
                        <div class="mt-1"><el-switch v-model="activeInstance.params.sound" /></div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </section>
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
