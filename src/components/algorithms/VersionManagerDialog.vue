<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import type { Algorithm, AlgorithmVersion } from '@/utils/algorithmsMock'

const props = defineProps<{
  modelValue: boolean
  algorithm: Algorithm | null
  versions: AlgorithmVersion[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'rollback', payload: { version: string }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

function tagTypeForVersion(v: AlgorithmVersion) {
  return v.isCurrent ? 'success' : 'info'
}

async function rollbackTo(v: AlgorithmVersion) {
  if (!props.algorithm) return
  if (v.isCurrent) return

  const confirmed1 = await ElMessageBox.confirm(
    `回滚将把算法版本切换到 ${v.version}，并可能影响在线推理结果。是否继续？`,
    '版本回滚（1/2）',
    {
      type: 'warning',
      confirmButtonText: '继续',
      cancelButtonText: '取消',
    }
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed1) return

  const { value, action } = await ElMessageBox.prompt(
    `请输入目标版本号（${v.version}）以确认回滚：`,
    '版本回滚（2/2）',
    {
      confirmButtonText: '确认回滚',
      cancelButtonText: '取消',
      inputPlaceholder: v.version,
    }
  ).catch(() => ({ value: '', action: 'cancel' as const }))

  if (action !== 'confirm') return
  if (String(value).trim() !== v.version) {
    ElMessage.error('版本号不匹配，已取消回滚')
    return
  }

  await new Promise((r) => setTimeout(r, 400))
  emit('rollback', { version: v.version })
  ElMessage.success('回滚已提交（占位）')
}
</script>

<template>
  <el-dialog v-model="open" title="版本管理" width="920" destroy-on-close>
    <div v-if="algorithm" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">{{ algorithm.name }}</span>
          <span class="font-mono text-xs text-zinc-500">{{ algorithm.id }}</span>
          <span class="text-xs text-zinc-400">｜</span>
          <span class="text-xs text-zinc-600">当前版本：</span>
          <span class="font-mono text-xs">{{ algorithm.currentVersion }}</span>
        </div>
      </div>

      <el-table :data="versions" size="small" class="table-standard" height="520">
        <el-table-column label="版本" width="140">
          <template #default="scope">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs">{{ scope.row.version }}</span>
              <el-tag :type="tagTypeForVersion(scope.row)" size="small">{{ scope.row.isCurrent ? '当前' : '历史' }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="160">
          <template #default="scope">
            <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.releasedAtMs) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="notes" label="说明" min-width="260" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" :disabled="scope.row.isCurrent" @click="rollbackTo(scope.row)">
              回滚到此版本
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        版本回滚为占位：后续可接入算法包仓库、灰度发布、回滚影响分析与节点同步进度。
      </div>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择算法</div>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

