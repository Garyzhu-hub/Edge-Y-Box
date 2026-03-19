<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Algorithm } from '@/utils/algorithmsMock'

type Mode = 'export' | 'import'
type ConflictStrategy = 'update' | 'appendVersion'
type ImportIssueLevel = 'error' | 'warn'
type ImportIssue = {
  id: string
  row: number
  field: string
  code: string
  level: ImportIssueLevel
  message: string
  suggestion: string
}
type ImportReport = {
  total: number
  valid: number
  invalid: number
  duplicatesInFile: number
  conflictsWithLocal: number
  issues: ImportIssue[]
}
type ImportTask = {
  id: string
  fileName: string
  source: string
  size: number
  tsMs: number
  progress: number
  status: '上传中' | '预校验中' | '可导入' | '失败'
  message: string
  algorithms: Algorithm[]
  report: ImportReport | null
}
type AlgorithmBundle = {
  schema: 'edge.algorithms.bundle.v1' | 'edge.algorithms.bundle.v2'
  exportedAtMs: number
  exportedBy: string
  source: string
  count: number
  checksum: string
  manifest?: Array<{
    algorithmId: string
    name: string
    version: string
    modelFormat: string
    packageName: string
    packageSource: string
  }>
  items: Algorithm[]
}

const props = defineProps<{ modelValue: boolean; mode: Mode; algorithms: Algorithm[] }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'import', payload: { algorithms: Algorithm[]; merge: boolean; source: string; conflictStrategy: ConflictStrategy }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const state = reactive({
  text: '',
  merge: true,
  conflictStrategy: 'update' as ConflictStrategy,
  source: '未知来源',
  count: 0,
  duplicate: 0,
  conflict: 0,
  invalid: 0,
})

const fileInputRef = ref<HTMLInputElement | null>(null)
const importTasks = ref<ImportTask[]>([])
const selectedTaskId = ref('')
const reportOpen = ref(false)
const previewReport = ref<ImportReport | null>(null)
const timers = new Map<string, number>()

const title = computed(() => (props.mode === 'export' ? '导出算法' : '导入算法'))
const activeTask = computed(() => importTasks.value.find((x) => x.id === selectedTaskId.value) || importTasks.value[0] || null)

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    state.merge = true
    state.conflictStrategy = 'update'
    state.source = '未知来源'
    state.count = 0
    state.duplicate = 0
    state.conflict = 0
    state.invalid = 0
    if (props.mode === 'export') state.text = JSON.stringify(makeBundle(props.algorithms), null, 2)
    else state.text = ''
    importTasks.value = []
    selectedTaskId.value = ''
  }
)

function hashText(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

function makeBundle(items: Algorithm[]): AlgorithmBundle {
  const payload = JSON.stringify(items)
  return {
    schema: 'edge.algorithms.bundle.v2',
    exportedAtMs: Date.now(),
    exportedBy: 'admin',
    source: 'Edge Y-box',
    count: items.length,
    checksum: hashText(payload),
    manifest: items.map((x) => ({
      algorithmId: x.id,
      name: x.name,
      version: x.currentVersion,
      modelFormat: x.modelFormat || '',
      packageName: x.packageName || '',
      packageSource: x.packageSource || '',
    })),
    items,
  }
}

function parseImportPayloadFromText(text: string, defaultSource = 'text-input') {
  const parsed = JSON.parse(text)
  if (Array.isArray(parsed)) return { list: parsed as any[], source: defaultSource === 'text-input' ? 'legacy-array' : defaultSource }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).items)) {
    const bundle = parsed as AlgorithmBundle
    if (!['edge.algorithms.bundle.v1', 'edge.algorithms.bundle.v2'].includes(bundle.schema)) throw new Error('schema-invalid')
    const checksum = hashText(JSON.stringify(bundle.items))
    if (bundle.checksum && checksum !== bundle.checksum) throw new Error('checksum-invalid')
    return { list: bundle.items as any[], source: bundle.source || defaultSource }
  }
  throw new Error('payload-invalid')
}

function precheckImportList(list: any[]) {
  const issues: ImportIssue[] = []
  const valid: Algorithm[] = []
  const existingIds = new Set(props.algorithms.map((x) => x.id))
  const seen = new Set<string>()
  let conflictsWithLocal = 0
  let duplicatesInFile = 0

  for (let i = 0; i < list.length; i++) {
    const row = i + 1
    const item = list[i]
    if (!item || typeof item !== 'object') {
      issues.push({
        id: `issue_${row}_shape`,
        row,
        field: 'item',
        code: 'ITEM_INVALID',
        level: 'error',
        message: '记录不是对象',
        suggestion: '删除无效记录或修正为对象结构',
      })
      continue
    }
    const id = String(item.id || '').trim()
    const name = String(item.name || '').trim()
    if (!id) {
      issues.push({
        id: `issue_${row}_id`,
        row,
        field: 'id',
        code: 'ID_REQUIRED',
        level: 'error',
        message: '算法ID缺失',
        suggestion: '补充唯一算法ID',
      })
      continue
    }
    if (!name) {
      issues.push({
        id: `issue_${row}_name`,
        row,
        field: 'name',
        code: 'NAME_REQUIRED',
        level: 'error',
        message: '算法名称缺失',
        suggestion: '补充算法名称',
      })
      continue
    }
    if (seen.has(id)) {
      duplicatesInFile += 1
      issues.push({
        id: `issue_${row}_dup`,
        row,
        field: 'id',
        code: 'ID_DUPLICATE_IN_FILE',
        level: 'error',
        message: `算法ID重复：${id}`,
        suggestion: '保持同一导入包内ID唯一',
      })
      continue
    }
    seen.add(id)
    if (existingIds.has(id)) {
      conflictsWithLocal += 1
      issues.push({
        id: `issue_${row}_conflict`,
        row,
        field: 'id',
        code: 'ID_CONFLICT_WITH_LOCAL',
        level: 'warn',
        message: `算法ID已存在：${id}`,
        suggestion: '合并模式会更新该算法，覆盖模式会整体替换',
      })
    }
    valid.push(item as Algorithm)
  }

  const invalid = Math.max(0, list.length - valid.length)
  return {
    valid,
    report: {
      total: list.length,
      valid: valid.length,
      invalid,
      duplicatesInFile,
      conflictsWithLocal,
      issues,
    } as ImportReport,
  }
}

function parsePreview() {
  try {
    const { list, source } = parseImportPayloadFromText(state.text)
    const result = precheckImportList(list)
    state.source = source
    state.count = result.report.total
    state.duplicate = result.report.duplicatesInFile
    state.conflict = result.report.conflictsWithLocal
    state.invalid = result.report.invalid
  } catch {
    state.count = 0
    state.duplicate = 0
    state.conflict = 0
    state.invalid = 0
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(state.text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动全选复制')
  }
}

function exportFileName() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `edge-algorithms-${y}${m}${day}-${hh}${mm}.json`
}

function onDownloadFile() {
  if (!state.text.trim()) {
    ElMessage.warning('没有可导出的内容')
    return
  }
  const blob = new Blob([state.text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFileName()
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  ElMessage.success('已下载导出文件')
}

function openFilePicker() {
  if (!fileInputRef.value) return
  fileInputRef.value.value = ''
  fileInputRef.value.click()
}

function taskTagType(status: ImportTask['status']) {
  if (status === '可导入') return 'success'
  if (status === '失败') return 'danger'
  return 'warning'
}

function upsertTask(task: ImportTask) {
  const idx = importTasks.value.findIndex((x) => x.id === task.id)
  if (idx >= 0) importTasks.value[idx] = { ...task }
  else importTasks.value = [task, ...importTasks.value].slice(0, 30)
}

async function onPickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const name = (file.name || '').toLowerCase()
  if (!name.endsWith('.json')) {
    ElMessage.warning('仅支持导入 .json 文件')
    return
  }
  const taskId = `imp_${Date.now()}_${Math.floor(Math.random() * 1e5)}`
  const task: ImportTask = {
    id: taskId,
    fileName: file.name,
    source: file.name,
    size: file.size || 0,
    tsMs: Date.now(),
    progress: 0,
    status: '上传中',
    message: '上传中',
    algorithms: [],
    report: null,
  }
  selectedTaskId.value = taskId
  upsertTask(task)
  const timer = window.setInterval(() => {
    const t = importTasks.value.find((x) => x.id === taskId)
    if (!t || t.status !== '上传中') return
    t.progress = Math.min(94, t.progress + 9)
    t.message = '上传中'
    upsertTask(t)
  }, 110)
  timers.set(taskId, timer)

  try {
    const text = await file.text()
    state.text = text
    parsePreview()
    const current = importTasks.value.find((x) => x.id === taskId)
    if (!current) return
    current.status = '预校验中'
    current.progress = 97
    current.message = '预校验中'
    upsertTask(current)

    const { list, source } = parseImportPayloadFromText(text, file.name)
    const result = precheckImportList(list)
    current.source = source
    current.algorithms = result.valid
    current.report = result.report
    current.progress = 100
    current.status = result.report.invalid > 0 ? '失败' : '可导入'
    current.message = result.report.invalid > 0 ? `预校验失败：${result.report.invalid} 条错误` : '预校验通过'
    upsertTask(current)
    if (current.status === '可导入') ElMessage.success('文件上传并预校验通过')
    else ElMessage.warning('预校验存在错误，请查看报告')
  } catch (e: any) {
    const current = importTasks.value.find((x) => x.id === taskId)
    if (current) {
      current.progress = 100
      current.status = '失败'
      current.message = '文件解析失败'
      upsertTask(current)
    }
    const msg = String(e?.message || '')
    if (msg === 'schema-invalid') {
      ElMessage.error('算法包版本不兼容')
      return
    }
    if (msg === 'checksum-invalid') {
      ElMessage.error('算法包校验失败，文件可能已损坏')
      return
    }
    if (msg === 'payload-invalid') {
      ElMessage.error('导入内容必须是算法包或算法数组')
      return
    }
    ElMessage.error('读取文件失败')
  } finally {
    if (timers.has(taskId)) {
      window.clearInterval(timers.get(taskId))
      timers.delete(taskId)
    }
  }
}

function showTaskReport(task: ImportTask) {
  previewReport.value = task.report
  reportOpen.value = true
}

function onImport() {
  if (activeTask.value && activeTask.value.report) {
    const task = activeTask.value
    if (task.status !== '可导入') {
      ElMessage.error('当前任务未通过预校验，无法导入')
      return
    }
    emit('import', { algorithms: task.algorithms, merge: state.merge, source: task.source, conflictStrategy: state.conflictStrategy })
    open.value = false
    ElMessage.success('导入完成（演示）')
    return
  }
  try {
    const { list, source } = parseImportPayloadFromText(state.text)
    const result = precheckImportList(list)
    if (result.report.invalid > 0) {
      ElMessage.error(`预校验失败：${result.report.invalid} 条错误`)
      return
    }
    emit('import', { algorithms: result.valid, merge: state.merge, source, conflictStrategy: state.conflictStrategy })
    open.value = false
    ElMessage.success('导入完成（演示）')
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (msg === 'schema-invalid') {
      ElMessage.error('算法包版本不兼容')
      return
    }
    if (msg === 'checksum-invalid') {
      ElMessage.error('算法包校验失败，文件可能已损坏')
      return
    }
    if (msg === 'payload-invalid') {
      ElMessage.error('导入内容必须是算法包或算法数组')
      return
    }
    ElMessage.error('JSON解析失败')
  }
}

onBeforeUnmount(() => {
  for (const t of timers.values()) window.clearInterval(t)
  timers.clear()
})
</script>

<template>
  <el-dialog v-model="open" :title="title" width="980" append-to-body>
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="text-xs text-zinc-500">
        <template v-if="mode === 'export'">导出为“算法包”JSON，包含清单与完整性校验，可用于迁移与审计（演示）。</template>
        <template v-else>支持文件上传任务、预校验报告和导入执行，兼容算法包JSON与旧版数组JSON（演示）。</template>
      </div>
      <div class="flex items-center gap-2">
        <el-switch v-if="mode === 'import'" v-model="state.merge" active-text="合并" inactive-text="覆盖" />
        <el-radio-group v-if="mode === 'import' && state.merge && state.conflict" v-model="state.conflictStrategy" size="small">
          <el-radio-button label="update">更新算法</el-radio-button>
          <el-radio-button label="appendVersion">追加为新版本</el-radio-button>
        </el-radio-group>
        <el-button v-if="mode === 'import'" type="primary" @click="openFilePicker">上传算法包</el-button>
        <el-button v-if="mode === 'export'" @click="copy">复制JSON</el-button>
        <el-button v-if="mode === 'export'" type="primary" @click="onDownloadFile">下载JSON文件</el-button>
      </div>
    </div>
    <input ref="fileInputRef" type="file" accept=".json,application/json" class="hidden" @change="onPickFile">

    <div v-if="mode === 'import'" class="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <el-card class="lg:col-span-7">
        <div class="text-xs text-zinc-500">支持粘贴 JSON；当有上传任务时，导入将使用当前选中的任务。</div>
        <el-input v-model="state.text" type="textarea" :rows="14" placeholder="粘贴JSON..." class="mt-2" @blur="parsePreview" />
        <div class="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
          <div>来源：{{ state.source }}</div>
          <div class="mt-1">检测到 {{ state.count }} 条，重复ID {{ state.duplicate }}，本地冲突 {{ state.conflict }}，错误 {{ state.invalid }}</div>
        </div>
      </el-card>

      <el-card class="lg:col-span-5">
        <div class="text-sm font-semibold">上传任务清单</div>
        <el-table :data="importTasks" size="small" class="mt-2 table-standard" max-height="390">
          <el-table-column label="文件" min-width="150">
            <template #default="scope">
              <button class="cursor-pointer truncate text-left text-xs text-primary" @click="selectedTaskId = scope.row.id">
                {{ scope.row.fileName }}
              </button>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="88">
            <template #default="scope">
              <el-tag :type="taskTagType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="进度" width="68">
            <template #default="scope">
              <span class="text-xs">{{ scope.row.progress }}%</span>
            </template>
          </el-table-column>
          <el-table-column label="报告" width="68" fixed="right">
            <template #default="scope">
              <el-button link type="primary" size="small" :disabled="!scope.row.report" @click="showTaskReport(scope.row)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="activeTask?.report" class="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
          <div>当前任务：{{ activeTask.fileName }}</div>
          <div class="mt-1">通过 {{ activeTask.report.valid }} / {{ activeTask.report.total }}，错误 {{ activeTask.report.invalid }}</div>
        </div>
      </el-card>
    </div>

    <el-input v-else v-model="state.text" type="textarea" :rows="18" placeholder="导出内容..." />

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">关闭</el-button>
        <el-button v-if="mode === 'import'" type="primary" @click="onImport">导入</el-button>
      </div>
    </template>
  </el-dialog>

  <el-dialog v-model="reportOpen" title="预校验报告" width="920" append-to-body>
    <div v-if="previewReport" class="space-y-3">
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        总数 {{ previewReport.total }}，通过 {{ previewReport.valid }}，错误 {{ previewReport.invalid }}，重复ID {{ previewReport.duplicatesInFile }}，本地冲突 {{ previewReport.conflictsWithLocal }}
      </div>
      <el-table :data="previewReport.issues" size="small" class="table-standard" max-height="420">
        <el-table-column label="行号" width="70" prop="row" />
        <el-table-column label="级别" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.level === 'error' ? 'danger' : 'warning'" size="small">{{ scope.row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="字段" width="110" prop="field" />
        <el-table-column label="编码" width="170" prop="code" />
        <el-table-column label="问题" min-width="180" prop="message" />
        <el-table-column label="建议" min-width="200" prop="suggestion" />
      </el-table>
    </div>
    <div v-else class="text-sm text-zinc-500">暂无报告</div>
    <template #footer>
      <el-button @click="reportOpen = false">关闭</el-button>
    </template>
  </el-dialog>
</template>
