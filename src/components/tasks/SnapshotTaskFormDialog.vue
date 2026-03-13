<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Camera } from '@/components/devices/CameraFormDialog.vue'
import type { TreeNode } from '@/utils/devicesCamerasMock'
import {
  makeDefaultWeekPlan,
  type HolidayPlanItem,
  type RunStatus,
  type SnapshotTask,
  type SnapshotTaskStatus,
  type SyncStatus,
  type TaskPlanType,
  type TaskSyncMode,
  type TimeSlot,
  type WeekPlan,
} from '@/utils/tasksMock'

type GroupOption = { id: string; label: string }

const props = defineProps<{
  modelValue: boolean
  initial: SnapshotTask | null
  groups: GroupOption[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved', task: SnapshotTask): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

type FormModel = {
  name: string
  groupId: string
  deviceIds: string[]
  intervalMin: number
  planType: TaskPlanType
  weekPlan: WeekPlan
  holidayPlan: HolidayPlanItem[]
  enabled: boolean
}

const form = reactive<FormModel>({
  name: '',
  groupId: '',
  deviceIds: [],
  intervalMin: 3,
  planType: '周计划',
  weekPlan: makeDefaultWeekPlan(),
  holidayPlan: [],
  enabled: true,
})

const title = computed(() => (props.initial ? '编辑抓图任务' : '新增抓图任务'))
const saving = ref(false)

const formRef = ref()
const rules = {
  name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
  groupId: [{ required: true, message: '请选择分组', trigger: 'change' }],
}

function resetFromInitial() {
  const g0 = props.groups[0]?.id || ''
  if (!props.initial) {
    form.name = ''
    form.groupId = g0
    form.deviceIds = []
    form.intervalMin = 3
    form.planType = '周计划'
    form.weekPlan = makeDefaultWeekPlan()
    form.holidayPlan = []
    form.enabled = true
    return
  }

  form.name = props.initial.name
  form.groupId = props.initial.groupId
  form.deviceIds = Array.isArray(props.initial.deviceIds) ? [...props.initial.deviceIds] : []
  form.intervalMin = props.initial.intervalMin
  form.planType = props.initial.planType || '周计划'
  form.weekPlan = props.initial.weekPlan ? { ...props.initial.weekPlan } : makeDefaultWeekPlan()
  form.holidayPlan = Array.isArray(props.initial.holidayPlan) ? [...props.initial.holidayPlan] : []
  form.enabled = props.initial.status === '已启用'

  if (!form.deviceIds.length && props.initial.deviceCount > 0) {
    const fallback = cameraOptions.value.slice(0, Math.min(props.initial.deviceCount, cameraOptions.value.length)).map((c) => c.id)
    form.deviceIds = fallback
  }
}

watch(
  () => open.value,
  (v) => {
    if (!v) return
    allCameras.value = loadCameras()
    resetFromInitial()
  }
)

function makeId() {
  const n = Math.floor(10000 + Math.random() * 90000)
  return `TASK-SNAP-${n}`
}

async function onSave() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return

  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 350))
    const id = props.initial?.id || makeId()
    const groupLabel = props.groups.find((g) => g.id === form.groupId)?.label || '—'
    const status: SnapshotTaskStatus = form.enabled ? '已启用' : '已停用'
    const syncStatus: SyncStatus = props.initial?.syncStatus || '待同步'
    const lastRunStatus: RunStatus = props.initial?.lastRunStatus || '成功'
    const lastRunAtMs = props.initial?.lastRunAtMs || Date.now() - 15 * 60 * 1000

    if (!form.deviceIds.length) {
      ElMessage.warning('请至少选择1个设备')
      return
    }

    const syncMode: TaskSyncMode = props.initial?.syncMode || '本地创建'
    const normalizedWeek = normalizeWeekPlan(form.weekPlan)
    const normalizedHoliday = normalizeHolidayPlan(form.holidayPlan)

    emit('saved', {
      id,
      name: form.name,
      groupId: form.groupId,
      groupLabel,
      deviceIds: [...form.deviceIds],
      deviceCount: form.deviceIds.length,
      intervalMin: Number(form.intervalMin) || 1,
      planType: form.planType,
      weekPlan: normalizedWeek,
      holidayPlan: normalizedHoliday,
      syncMode,
      status,
      syncStatus,
      updatedAtMs: Date.now(),
      lastRunAtMs,
      lastRunStatus,
    })
    open.value = false
    ElMessage.success('已保存（占位）')
  } finally {
    saving.value = false
  }
}

const CAMERAS_KEY = 'edge_cameras_v1'
const GROUPS_KEY = 'edge_camera_groups_v1'

function loadCameras(): Camera[] {
  try {
    const raw = window.localStorage.getItem(CAMERAS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Camera[]) : []
  } catch {
    return []
  }
}

function loadGroupTree(): TreeNode[] {
  try {
    const raw = window.localStorage.getItem(GROUPS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as TreeNode[]) : []
  } catch {
    return []
  }
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const hit = findNode(n.children, id)
      if (hit) return hit
    }
  }
  return null
}

function collectDescendantIds(node: TreeNode, into: Set<string>) {
  into.add(node.id)
  for (const c of node.children ?? []) collectDescendantIds(c, into)
}

const allCameras = ref<Camera[]>([])

const groupFilterIds = computed<Set<string> | null>(() => {
  if (!form.groupId || form.groupId === 'all') return null
  const tree = loadGroupTree()
  if (!tree.length) return new Set([form.groupId])
  const root = findNode(tree, form.groupId)
  if (!root) return new Set([form.groupId])
  const ids = new Set<string>()
  collectDescendantIds(root, ids)
  return ids
})

const cameraOptions = computed(() => {
  const ids = groupFilterIds.value
  const base = ids ? allCameras.value.filter((c) => ids.has(c.groupId)) : allCameras.value
  return base
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, label: `${c.name}（${c.ip}）`, groupId: c.groupId }))
})

function selectAllInGroup() {
  form.deviceIds = cameraOptions.value.map((c) => c.id)
}

function clearSelected() {
  form.deviceIds = []
}

function addWeekSlot(day: keyof WeekPlan) {
  const list = form.weekPlan[day]
  if (list.length >= 8) {
    ElMessage.warning('每天最多设置8个时间段')
    return
  }
  list.push({ start: '09:00', end: '18:00' })
}

function removeWeekSlot(day: keyof WeekPlan, idx: number) {
  form.weekPlan[day].splice(idx, 1)
}

function addHolidayDate() {
  const date = new Date().toISOString().slice(0, 10)
  if (form.holidayPlan.some((x) => x.date === date)) {
    ElMessage.warning('该日期已存在')
    return
  }
  form.holidayPlan.unshift({ date, slots: [{ start: '09:00', end: '18:00' }] })
}

function removeHolidayDate(idx: number) {
  form.holidayPlan.splice(idx, 1)
}

function addHolidaySlot(item: HolidayPlanItem) {
  if (item.slots.length >= 8) {
    ElMessage.warning('每个日期最多设置8个时间段')
    return
  }
  item.slots.push({ start: '09:00', end: '18:00' })
}

function removeHolidaySlot(item: HolidayPlanItem, idx: number) {
  item.slots.splice(idx, 1)
}

function normalizeSlots(slots: TimeSlot[]) {
  return slots
    .map((s) => ({ start: String(s.start || '').slice(0, 5), end: String(s.end || '').slice(0, 5) }))
    .filter((s) => s.start && s.end)
    .filter((s) => s.start < s.end)
}

function normalizeWeekPlan(plan: WeekPlan): WeekPlan {
  return {
    mon: normalizeSlots(plan.mon),
    tue: normalizeSlots(plan.tue),
    wed: normalizeSlots(plan.wed),
    thu: normalizeSlots(plan.thu),
    fri: normalizeSlots(plan.fri),
    sat: normalizeSlots(plan.sat),
    sun: normalizeSlots(plan.sun),
  }
}

function normalizeHolidayPlan(plan: HolidayPlanItem[]) {
  return plan
    .map((p) => ({ date: p.date, slots: normalizeSlots(p.slots) }))
    .filter((p) => p.date && p.slots.length)
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="720" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="92">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <el-form-item label="任务名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：夜间巡检抓图" />
        </el-form-item>

        <el-form-item label="分组" prop="groupId">
          <el-select v-model="form.groupId" placeholder="选择分组" filterable>
            <el-option v-for="g in groups" :key="g.id" :label="g.label" :value="g.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="周期(分钟)">
          <el-input-number v-model="form.intervalMin" :min="1" :max="60" class="w-full" />
        </el-form-item>

        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <el-form-item label="设备选择" class="md:col-span-2">
          <div class="w-full space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <el-button size="small" @click="selectAllInGroup">按分组全选</el-button>
              <el-button size="small" @click="clearSelected">清空</el-button>
              <span class="text-xs text-zinc-500">已选 {{ form.deviceIds.length }} 台</span>
            </div>
            <el-select
              v-model="form.deviceIds"
              multiple
              filterable
              clearable
              collapse-tags
              collapse-tags-tooltip
              placeholder="选择摄像头（支持多选）"
              class="w-full"
            >
              <el-option v-for="c in cameraOptions" :key="c.id" :label="c.label" :value="c.id" />
            </el-select>
          </div>
        </el-form-item>

        <el-form-item label="执行计划" class="md:col-span-2">
          <div class="w-full">
            <el-radio-group v-model="form.planType">
              <el-radio-button label="周计划" />
              <el-radio-button label="假日计划" />
            </el-radio-group>

            <div v-if="form.planType === '周计划'" class="mt-3 space-y-2">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-semibold">周一</div>
                    <el-button size="small" @click="addWeekSlot('mon')">新增</el-button>
                  </div>
                  <div v-if="!form.weekPlan.mon.length" class="mt-2 text-xs text-zinc-500">未设置</div>
                  <div v-for="(s, idx) in form.weekPlan.mon" :key="`mon-${idx}`" class="mt-2 flex items-center gap-2">
                    <el-time-select v-model="s.start" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <span class="text-xs text-zinc-500">~</span>
                    <el-time-select v-model="s.end" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <el-button link type="primary" size="small" @click="removeWeekSlot('mon', idx)">移除</el-button>
                  </div>
                </div>

                <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-semibold">周二</div>
                    <el-button size="small" @click="addWeekSlot('tue')">新增</el-button>
                  </div>
                  <div v-if="!form.weekPlan.tue.length" class="mt-2 text-xs text-zinc-500">未设置</div>
                  <div v-for="(s, idx) in form.weekPlan.tue" :key="`tue-${idx}`" class="mt-2 flex items-center gap-2">
                    <el-time-select v-model="s.start" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <span class="text-xs text-zinc-500">~</span>
                    <el-time-select v-model="s.end" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <el-button link type="primary" size="small" @click="removeWeekSlot('tue', idx)">移除</el-button>
                  </div>
                </div>

                <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-semibold">周三</div>
                    <el-button size="small" @click="addWeekSlot('wed')">新增</el-button>
                  </div>
                  <div v-if="!form.weekPlan.wed.length" class="mt-2 text-xs text-zinc-500">未设置</div>
                  <div v-for="(s, idx) in form.weekPlan.wed" :key="`wed-${idx}`" class="mt-2 flex items-center gap-2">
                    <el-time-select v-model="s.start" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <span class="text-xs text-zinc-500">~</span>
                    <el-time-select v-model="s.end" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <el-button link type="primary" size="small" @click="removeWeekSlot('wed', idx)">移除</el-button>
                  </div>
                </div>

                <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-semibold">周四</div>
                    <el-button size="small" @click="addWeekSlot('thu')">新增</el-button>
                  </div>
                  <div v-if="!form.weekPlan.thu.length" class="mt-2 text-xs text-zinc-500">未设置</div>
                  <div v-for="(s, idx) in form.weekPlan.thu" :key="`thu-${idx}`" class="mt-2 flex items-center gap-2">
                    <el-time-select v-model="s.start" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <span class="text-xs text-zinc-500">~</span>
                    <el-time-select v-model="s.end" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <el-button link type="primary" size="small" @click="removeWeekSlot('thu', idx)">移除</el-button>
                  </div>
                </div>

                <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-semibold">周五</div>
                    <el-button size="small" @click="addWeekSlot('fri')">新增</el-button>
                  </div>
                  <div v-if="!form.weekPlan.fri.length" class="mt-2 text-xs text-zinc-500">未设置</div>
                  <div v-for="(s, idx) in form.weekPlan.fri" :key="`fri-${idx}`" class="mt-2 flex items-center gap-2">
                    <el-time-select v-model="s.start" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <span class="text-xs text-zinc-500">~</span>
                    <el-time-select v-model="s.end" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <el-button link type="primary" size="small" @click="removeWeekSlot('fri', idx)">移除</el-button>
                  </div>
                </div>

                <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-semibold">周六</div>
                    <el-button size="small" @click="addWeekSlot('sat')">新增</el-button>
                  </div>
                  <div v-if="!form.weekPlan.sat.length" class="mt-2 text-xs text-zinc-500">未设置</div>
                  <div v-for="(s, idx) in form.weekPlan.sat" :key="`sat-${idx}`" class="mt-2 flex items-center gap-2">
                    <el-time-select v-model="s.start" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <span class="text-xs text-zinc-500">~</span>
                    <el-time-select v-model="s.end" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <el-button link type="primary" size="small" @click="removeWeekSlot('sat', idx)">移除</el-button>
                  </div>
                </div>

                <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-semibold">周日</div>
                    <el-button size="small" @click="addWeekSlot('sun')">新增</el-button>
                  </div>
                  <div v-if="!form.weekPlan.sun.length" class="mt-2 text-xs text-zinc-500">未设置</div>
                  <div v-for="(s, idx) in form.weekPlan.sun" :key="`sun-${idx}`" class="mt-2 flex items-center gap-2">
                    <el-time-select v-model="s.start" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <span class="text-xs text-zinc-500">~</span>
                    <el-time-select v-model="s.end" start="00:00" step="00:15" end="23:45" class="w-28" />
                    <el-button link type="primary" size="small" @click="removeWeekSlot('sun', idx)">移除</el-button>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="mt-3 space-y-2">
              <div class="flex items-center justify-between">
                <div class="text-xs text-zinc-500">假日计划按指定日期生效，每个日期最多8个时间段。</div>
                <el-button size="small" @click="addHolidayDate">新增日期</el-button>
              </div>
              <div v-if="!form.holidayPlan.length" class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500">
                未设置假日计划
              </div>
              <div v-for="(d, idx) in form.holidayPlan" :key="d.date" class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold">{{ d.date }}</span>
                    <el-button size="small" @click="addHolidaySlot(d)">新增时间段</el-button>
                  </div>
                  <el-button link type="primary" size="small" @click="removeHolidayDate(idx)">移除日期</el-button>
                </div>
                <div v-for="(s, sidx) in d.slots" :key="`${d.date}-${sidx}`" class="mt-2 flex items-center gap-2">
                  <el-time-select v-model="s.start" start="00:00" step="00:15" end="23:45" class="w-28" />
                  <span class="text-xs text-zinc-500">~</span>
                  <el-time-select v-model="s.end" start="00:00" step="00:15" end="23:45" class="w-28" />
                  <el-button link type="primary" size="small" @click="removeHolidaySlot(d, sidx)">移除</el-button>
                </div>
              </div>
            </div>
          </div>
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>
