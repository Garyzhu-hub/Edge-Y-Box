<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '@/stores/app'
import type { Algorithm, AlgorithmRollbackRecord, AlgorithmVersion } from '@/utils/algorithmsMock'

const props = defineProps<{
  modelValue: boolean
  algorithm: Algorithm | null
  versions: AlgorithmVersion[]
  rollbackRecords?: AlgorithmRollbackRecord[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'rollback', payload: { version: string; reason: string }): void
  (e: 'upload-version', payload: { version: string; notes: string; setAsCurrent: boolean; fileName: string; modelFormat: string }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

function tagTypeForVersion(v: AlgorithmVersion) {
  return v.isCurrent ? 'success' : 'info'
}

const uploadOpen = ref(false)
const uploadForm = reactive({
  version: '',
  notes: '',
  setAsCurrent: true,
  modelFormat: 'ONNX',
  fileName: '',
})
const uploadFileRef = ref<HTMLInputElement | null>(null)

function resetUpload() {
  uploadForm.version = ''
  uploadForm.notes = ''
  uploadForm.setAsCurrent = true
  uploadForm.modelFormat = props.algorithm?.modelFormat || 'ONNX'
  uploadForm.fileName = ''
  if (uploadFileRef.value) uploadFileRef.value.value = ''
}

function openUpload() {
  if (!props.algorithm) return
  resetUpload()
  uploadOpen.value = true
}

function guessFormat(fileName: string) {
  const n = (fileName || '').toLowerCase()
  if (n.endsWith('.onnx')) return 'ONNX'
  if (n.endsWith('.engine') || n.endsWith('.trt')) return 'TensorRT'
  if (n.includes('yolo') || n.endsWith('.pt')) return 'YOLO'
  return props.algorithm?.modelFormat || '其他'
}

function onPickUploadFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadForm.fileName = file.name
  uploadForm.modelFormat = guessFormat(file.name)
}

async function submitUpload() {
  if (!props.algorithm) return
  const v = String(uploadForm.version || '').trim()
  if (!v) {
    ElMessage.error('请填写版本号')
    return
  }
  if (props.versions.some((x) => x.version === v)) {
    ElMessage.error('该版本号已存在')
    return
  }
  if (!uploadForm.fileName.trim()) {
    ElMessage.error('请选择算法包文件')
    return
  }
  await new Promise((r) => setTimeout(r, 300))
  emit('upload-version', {
    version: v,
    notes: String(uploadForm.notes || '').trim(),
    setAsCurrent: Boolean(uploadForm.setAsCurrent),
    fileName: uploadForm.fileName,
    modelFormat: uploadForm.modelFormat,
  })
  uploadOpen.value = false
  ElMessage.success('已上传新版本（演示）')
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

  const reasonResult = await ElMessageBox.prompt('请输入回滚原因：', '版本回滚（2/3）', {
    confirmButtonText: '下一步',
    cancelButtonText: '取消',
    inputPlaceholder: '例如：线上误报升高，回退至稳定版本',
  }).catch(() => ({ value: '', action: 'cancel' as const }))
  if (reasonResult.action !== 'confirm') return
  const reason = String(reasonResult.value || '').trim()
  if (!reason) {
    ElMessage.error('请填写回滚原因')
    return
  }

  const { value, action } = await ElMessageBox.prompt(
    `请输入目标版本号（${v.version}）以确认回滚：`,
    '版本回滚（3/3）',
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
  emit('rollback', { version: v.version, reason })
  ElMessage.success('回滚已提交')
}
</script>

<template>
  <el-dialog v-model="open" title="版本管理" width="920" destroy-on-close>
    <div v-if="algorithm" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold">{{ algorithm.name }}</span>
            <span class="font-mono text-xs text-zinc-500">{{ algorithm.id }}</span>
            <span class="text-xs text-zinc-400">｜</span>
            <span class="text-xs text-zinc-600">当前版本：</span>
            <span class="font-mono text-xs">{{ algorithm.currentVersion }}</span>
          </div>
          <el-button type="primary" @click="openUpload">上传新版本</el-button>
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
            <el-button link type="primary" size="small" :disabled="scope.row.isCurrent" @click="rollbackTo(scope.row)">回滚到此版本</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="rounded-xl border border-zinc-200 bg-white p-3">
        <div class="text-sm font-semibold">回滚记录</div>
        <div v-if="!(rollbackRecords || []).length" class="mt-2 text-xs text-zinc-500">暂无回滚记录</div>
        <el-table v-else :data="rollbackRecords" size="small" class="mt-2 table-standard" max-height="220">
          <el-table-column label="时间" width="160">
            <template #default="scope">
              <span class="text-xs text-zinc-600">{{ formatDateTime(scope.row.tsMs) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="版本变更" width="190">
            <template #default="scope">
              <span class="font-mono text-xs">{{ scope.row.fromVersion }} → {{ scope.row.toVersion }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" min-width="220" />
          <el-table-column prop="operator" label="操作人" width="100" />
        </el-table>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">说明：当前为前端演示回滚流程，后续可接入后端版本仓库与节点同步进度。</div>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择算法</div>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="uploadOpen" :title="`上传新版本｜${algorithm?.name || ''}`" width="720" destroy-on-close append-to-body>
    <div v-if="algorithm" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        上传将把算法包追加为一个新版本（演示）。版本号需手动填写；可选择“上传后设为当前版本”。\n
      </div>
      <el-form label-width="96">
        <el-form-item label="版本号">
          <el-input v-model="uploadForm.version" placeholder="例如：v1.2.3" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="uploadForm.notes" type="textarea" :rows="2" placeholder="可选：本次变更说明" />
        </el-form-item>
        <el-form-item label="算法包文件">
          <div class="w-full space-y-2">
            <input ref="uploadFileRef" type="file" class="w-full" @change="onPickUploadFile">
            <div class="text-xs text-zinc-500">已选择：<span class="font-mono">{{ uploadForm.fileName || '—' }}</span></div>
          </div>
        </el-form-item>
        <el-form-item label="模型格式">
          <el-select v-model="uploadForm.modelFormat" class="w-full">
            <el-option label="YOLO" value="YOLO" />
            <el-option label="ONNX" value="ONNX" />
            <el-option label="TensorRT" value="TensorRT" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="设为当前">
          <el-switch v-model="uploadForm.setAsCurrent" />
        </el-form-item>
      </el-form>
    </div>
    <div v-else class="text-sm text-zinc-600">未选择算法</div>
    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="uploadOpen = false">取消</el-button>
        <el-button type="primary" @click="submitUpload">上传</el-button>
      </div>
    </template>
  </el-dialog>
</template>
