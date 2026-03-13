<script setup lang="ts">
import type { DeviceRun, SnapshotTask, TaskRun } from '@/utils/tasksMock'
import { formatDateTime } from '@/stores/app'

const props = defineProps<{
  modelValue: boolean
  task: SnapshotTask | null
  run: TaskRun | null
  devices: DeviceRun[]
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

function statusType(status: DeviceRun['status']) {
  if (status === '成功') return 'success'
  if (status === '失败') return 'danger'
  return 'warning'
}

function syncType(r: DeviceRun) {
  if (r.synced) return 'success'
  return r.syncResult === '失败' ? 'danger' : 'info'
}
</script>

<template>
  <el-dialog v-model="open" title="设备执行记录" width="980" destroy-on-close>
    <div v-if="task && run" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">{{ task.name }}</span>
          <span class="font-mono text-xs text-zinc-500">{{ task.id }}</span>
          <span class="text-xs text-zinc-400">｜</span>
          <span class="font-mono text-xs text-zinc-500">{{ run.id }}</span>
          <span class="text-xs text-zinc-400">｜</span>
          <span class="text-xs text-zinc-600">{{ formatDateTime(run.startedAtMs) }}</span>
        </div>
      </div>

      <el-table :data="devices" size="small" class="table-standard" height="520">
        <el-table-column prop="deviceLabel" label="设备" min-width="200" />
        <el-table-column prop="deviceIp" label="IP" width="140" />
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="statusType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="抓图时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.capturedAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="抓图" width="140">
          <template #default="scope">
            <el-image
              :src="scope.row.snapshotUrl"
              fit="cover"
              class="h-[44px] w-[88px] rounded-md bg-zinc-50"
              :preview-src-list="[scope.row.snapshotUrl]"
            />
          </template>
        </el-table-column>
        <el-table-column label="是否同步" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.synced ? 'success' : 'info'" size="small">{{ scope.row.synced ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="同步结果" width="120">
          <template #default="scope">
            <el-tag :type="syncType(scope.row)" size="small">{{ scope.row.syncResult }}</el-tag>
            <span class="ml-2 font-mono text-xs text-zinc-500">{{ scope.row.resultCode }}</span>
          </template>
        </el-table-column>
        <el-table-column label="同步说明" min-width="200">
          <template #default="scope">
            <span class="text-xs" :class="scope.row.synced ? 'text-zinc-600' : 'text-rose-600'">{{ scope.row.syncMessage || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="失败原因" min-width="220">
          <template #default="scope">
            <span v-if="scope.row.error" class="text-xs text-rose-600">{{ scope.row.error }}</span>
            <span v-else class="text-xs text-zinc-400">—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择执行记录</div>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
    </template>
  </el-dialog>
</template>
