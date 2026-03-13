<script setup lang="ts">
import type { SnapshotTask, TaskRun } from '@/utils/tasksMock'
import { formatDateTime } from '@/stores/app'

function dayLabel(k: string) {
  if (k === 'mon') return '周一'
  if (k === 'tue') return '周二'
  if (k === 'wed') return '周三'
  if (k === 'thu') return '周四'
  if (k === 'fri') return '周五'
  if (k === 'sat') return '周六'
  return '周日'
}

function formatSlots(slots: { start: string; end: string }[]) {
  if (!slots?.length) return '—'
  return slots.map((s) => `${s.start}~${s.end}`).join('，')
}

const props = defineProps<{
  modelValue: boolean
  task: SnapshotTask | null
  runs: TaskRun[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'openDeviceRun', payload: { run: TaskRun }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

function statusType(status: TaskRun['status']) {
  if (status === '成功') return 'success'
  if (status === '失败') return 'danger'
  return 'warning'
}

const summary = computed(() => {
  const ok = props.runs.reduce((a, r) => a + r.okCount, 0)
  const fail = props.runs.reduce((a, r) => a + r.failCount, 0)
  return { ok, fail }
})

const latest = computed(() => props.runs[0] || null)
</script>

<template>
  <el-dialog v-model="open" title="任务详情" width="980" destroy-on-close>
    <div v-if="task" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">{{ task.name }}</span>
          <span class="font-mono text-xs text-zinc-500">{{ task.id }}</span>
          <el-tag :type="task.status === '已启用' ? 'success' : 'info'" size="small">{{ task.status }}</el-tag>
          <el-tag :type="task.syncStatus === '已同步' ? 'success' : task.syncStatus === '待同步' ? 'warning' : 'danger'" size="small">
            {{ task.syncStatus }}
          </el-tag>
        </div>
        <div class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div class="rounded-lg border border-zinc-200 bg-white p-3">
            <div class="text-xs text-zinc-500">分组</div>
            <div class="mt-1 text-sm font-semibold">{{ task.groupLabel }}</div>
          </div>
          <div class="rounded-lg border border-zinc-200 bg-white p-3">
            <div class="text-xs text-zinc-500">设备数</div>
            <div class="mt-1 text-sm font-semibold">{{ task.deviceCount }}</div>
          </div>
          <div class="rounded-lg border border-zinc-200 bg-white p-3">
            <div class="text-xs text-zinc-500">周期</div>
            <div class="mt-1 text-sm font-semibold">每 {{ task.intervalMin }} 分钟</div>
          </div>
          <div class="rounded-lg border border-zinc-200 bg-white p-3">
            <div class="text-xs text-zinc-500">更新时间</div>
            <div class="mt-1 text-sm font-semibold">{{ formatDateTime(task.updatedAtMs) }}</div>
          </div>
        </div>
      </div>

      <el-tabs>
        <el-tab-pane label="执行记录">
          <div class="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div class="text-xs text-zinc-500">累计成功/失败</div>
              <div class="mt-1 text-sm font-semibold">{{ summary.ok }} / {{ summary.fail }}</div>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div class="text-xs text-zinc-500">最近一次</div>
              <div class="mt-1 text-sm font-semibold">{{ latest ? formatDateTime(latest.startedAtMs) : '—' }}</div>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div class="text-xs text-zinc-500">最近状态</div>
              <div class="mt-1">
                <el-tag v-if="latest" :type="statusType(latest.status)" size="small">{{ latest.status }}</el-tag>
                <span v-else class="text-sm">—</span>
              </div>
            </div>
          </div>

          <el-table :data="runs" size="small" class="table-standard" height="460">
            <el-table-column prop="id" label="执行ID" min-width="160">
              <template #default="scope">
                <span class="font-mono text-xs">{{ scope.row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column label="开始时间" width="160">
              <template #default="scope">
                <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.startedAtMs) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="110">
              <template #default="scope">
                <span class="font-mono text-xs">{{ Math.round(scope.row.durationMs / 1000) }}s</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="scope">
                <el-tag :type="statusType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="成功/失败" width="110">
              <template #default="scope">
                <span class="font-mono text-xs">{{ scope.row.okCount }}/{{ scope.row.failCount }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="operator" label="触发者" width="120" />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="scope">
                <el-button link type="primary" size="small" @click="emit('openDeviceRun', { run: scope.row })">
                  设备记录
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="配置">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div class="text-xs text-zinc-500">同步方式</div>
              <div class="mt-1 text-sm font-semibold">{{ task.syncMode }}</div>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div class="text-xs text-zinc-500">计划类型</div>
              <div class="mt-1 text-sm font-semibold">{{ task.planType }}</div>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:col-span-2">
              <div class="text-xs text-zinc-500">设备选择</div>
              <div class="mt-1 text-sm font-semibold">{{ task.deviceCount }} 台</div>
              <div v-if="task.deviceIds?.length" class="mt-2 flex flex-wrap gap-2">
                <el-tag v-for="id in task.deviceIds.slice(0, 10)" :key="id" size="small">{{ id }}</el-tag>
                <span v-if="task.deviceIds.length > 10" class="text-xs text-zinc-500">…</span>
              </div>
            </div>
          </div>

          <div class="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div class="text-xs text-zinc-500">执行时间段</div>
            <div v-if="task.planType === '周计划'" class="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <div v-for="k in ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']" :key="k" class="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <span class="text-sm font-semibold">{{ dayLabel(k) }}</span>
                <span class="text-xs text-zinc-600">{{ formatSlots((task.weekPlan as any)?.[k] || []) }}</span>
              </div>
            </div>
            <div v-else class="mt-2 space-y-2">
              <div v-if="!task.holidayPlan?.length" class="text-sm text-zinc-600">—</div>
              <div v-for="d in task.holidayPlan" :key="d.date" class="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <span class="text-sm font-semibold">{{ d.date }}</span>
                <span class="text-xs text-zinc-600">{{ formatSlots(d.slots || []) }}</span>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择任务</div>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
    </template>
  </el-dialog>
</template>
