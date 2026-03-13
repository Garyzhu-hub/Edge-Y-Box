<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { formatDateTime } from '@/stores/app'

type AlarmItem = {
  id: string
  camera: string
  type: string
  level: '一般' | '警告' | '严重' | '紧急'
  timeMs: number
  workOrderId?: string
}

type WorkOrderItem = {
  id: string
  camera: string
  type: string
  level: '一般' | '警告' | '严重' | '紧急'
  status: '异常' | '已恢复' | '已关闭' | '误报关闭'
  timeMs: number
}

const router = useRouter()
const tab = ref<'alarms' | 'workOrders'>('alarms')

const now = Date.now()

const recentAlarms = computed<AlarmItem[]>(() => {
  return [
    {
      id: 'patrol-20260305-02-0010273',
      camera: '东门岗亭-1',
      type: '离岗',
      level: '警告',
      timeMs: now - 12 * 60 * 1000,
      workOrderId: 'WO-10021',
    },
    {
      id: 'patrol-20260305-02-0010284',
      camera: '地库B2-5',
      type: '违停占道',
      level: '严重',
      timeMs: now - 28 * 60 * 1000,
      workOrderId: 'WO-10018',
    },
    {
      id: 'patrol-20260305-02-0010291',
      camera: '1号楼大堂-2',
      type: '公共区域卫生',
      level: '一般',
      timeMs: now - 46 * 60 * 1000,
    },
  ]
})

const openWorkOrders = computed<WorkOrderItem[]>(() => {
  return [
    {
      id: 'WO-10021',
      camera: '东门岗亭-1',
      type: '离岗',
      level: '警告',
      status: '异常',
      timeMs: now - 45 * 60 * 1000,
    },
    {
      id: 'WO-10018',
      camera: '地库B2-5',
      type: '违停占道',
      level: '严重',
      status: '异常',
      timeMs: now - 2 * 60 * 60 * 1000,
    },
  ]
})

function goWorkOrder(id: string) {
  router.push(`/work-orders/${encodeURIComponent(id)}`)
}
</script>

<template>
  <el-card class="h-full">
    <div class="flex items-center justify-between">
      <div class="text-sm font-semibold">最近异常</div>
      <el-tag type="info">Tabs</el-tag>
    </div>

    <div class="mt-3">
      <el-tabs v-model="tab" class="!min-h-[240px]">
        <el-tab-pane label="最近预警" name="alarms">
          <el-table :data="recentAlarms" size="small" height="220">
            <el-table-column prop="camera" label="摄像头" min-width="110" />
            <el-table-column prop="type" label="类型" width="98" />
            <el-table-column label="时间" width="150">
              <template #default="scope">
                <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.timeMs) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="工单" width="92">
              <template #default="scope">
                <el-button
                  v-if="scope.row.workOrderId"
                  link
                  type="primary"
                  size="small"
                  @click="goWorkOrder(scope.row.workOrderId)"
                >
                  {{ scope.row.workOrderId }}
                </el-button>
                <span v-else class="text-xs text-zinc-400">—</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="未恢复工单" name="workOrders">
          <el-table :data="openWorkOrders" size="small" height="220">
            <el-table-column prop="id" label="工单编号" width="110">
              <template #default="scope">
                <el-button link type="primary" size="small" @click="goWorkOrder(scope.row.id)">
                  {{ scope.row.id }}
                </el-button>
              </template>
            </el-table-column>
            <el-table-column prop="camera" label="摄像头" min-width="110" />
            <el-table-column prop="type" label="类型" width="98" />
            <el-table-column prop="status" label="状态" width="82">
              <template #default="scope">
                <el-tag type="danger" size="small">{{ scope.row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-card>
</template>

