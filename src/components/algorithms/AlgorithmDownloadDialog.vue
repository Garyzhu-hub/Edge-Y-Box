<script setup lang="ts">
import { computed, reactive } from 'vue'
import { ElMessage } from 'element-plus'

export type DownloadServer = {
  id: string
  name: string
  baseUrl: string
}

export type DownloadRecord = {
  id: string
  taskId: string
  tsMs: number
  serverName: string
  url: string
  name: string
  modelFormat: string
  progress: number
  status: '下载中' | '成功' | '失败'
  message: string
  retryCount: number
}

const props = defineProps<{ modelValue: boolean; history: DownloadRecord[] }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'download', payload: { server: DownloadServer; url: string; name: string; modelFormat: string }): void
  (e: 'retry', recordId: string): void
  (e: 'clear-history'): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const servers: DownloadServer[] = [
  { id: 'srv_1', name: '算法服务器A', baseUrl: 'https://algo.example.com' },
  { id: 'srv_2', name: '算法服务器B', baseUrl: 'https://mirror.example.com' },
]

const form = reactive({
  serverId: servers[0]?.id ?? '',
  url: '',
  name: '',
  modelFormat: 'ONNX',
})

const selectedServer = computed(() => servers.find((s) => s.id === form.serverId) ?? servers[0])

function guessNameFromUrl(url: string) {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop() || ''
    return decodeURIComponent(last)
  } catch {
    const last = url.split('/').filter(Boolean).pop() || ''
    return last
  }
}

function onPrefillName() {
  const next = guessNameFromUrl(form.url.trim())
  if (next) form.name = next
}

function onDownload() {
  const server = selectedServer.value
  if (!server) return
  const url = form.url.trim()
  if (!url) {
    ElMessage.warning('请输入算法包URL')
    return
  }
  const name = form.name.trim() || guessNameFromUrl(url) || 'remote-package'
  emit('download', { server, url, name, modelFormat: form.modelFormat })
}

function onClearHistory() {
  emit('clear-history')
  ElMessage.success('已清空下载记录（演示）')
}

function onRetry(record: DownloadRecord) {
  emit('retry', record.id)
}
</script>

<template>
  <el-dialog v-model="open" title="远程下载" width="920" append-to-body>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <el-card class="lg:col-span-7">
        <div class="text-sm font-semibold">下载配置</div>
        <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div class="text-xs text-zinc-500">服务器</div>
            <el-select v-model="form.serverId" class="mt-1 w-full">
              <el-option v-for="s in servers" :key="s.id" :label="`${s.name}（${s.baseUrl}）`" :value="s.id" />
            </el-select>
          </div>
          <div>
            <div class="text-xs text-zinc-500">模型格式</div>
            <el-select v-model="form.modelFormat" class="mt-1 w-full">
              <el-option label="YOLO" value="YOLO" />
              <el-option label="ONNX" value="ONNX" />
              <el-option label="TensorRT" value="TensorRT" />
              <el-option label="其他" value="其他" />
            </el-select>
          </div>
          <div class="md:col-span-2">
            <div class="text-xs text-zinc-500">算法包URL</div>
            <el-input v-model="form.url" class="mt-1" placeholder="https://.../helmet-detector_v1.0.0.onnx" clearable />
          </div>
          <div class="md:col-span-2">
            <div class="flex items-center justify-between">
              <div class="text-xs text-zinc-500">算法名称</div>
              <el-button link type="primary" size="small" @click="onPrefillName">从URL生成</el-button>
            </div>
            <el-input v-model="form.name" class="mt-1" placeholder="可不填，将从URL推断" clearable />
          </div>
        </div>

        <div class="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
          说明：远程下载为前端演示；实际下载、校验与落盘应由后端完成。
        </div>
      </el-card>

      <el-card class="lg:col-span-5">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold">下载记录</div>
            <div class="mt-1 text-xs text-zinc-500">最多保留最近 20 条。</div>
          </div>
          <el-button size="small" @click="onClearHistory">清空</el-button>
        </div>

        <div class="mt-3">
          <el-table :data="history" size="small" height="360" class="table-standard">
            <el-table-column label="时间" width="120">
              <template #default="scope">
                <span class="text-xs text-zinc-600">{{ new Date(scope.row.tsMs).toLocaleString() }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="serverName" label="服务器" min-width="120" />
            <el-table-column label="算法包" min-width="170">
              <template #default="scope">
                <div class="truncate text-xs" :title="scope.row.name">{{ scope.row.name }}</div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="scope">
                <el-tag :type="scope.row.status === '成功' ? 'success' : scope.row.status === '失败' ? 'danger' : 'warning'" size="small">
                  {{ scope.row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="进度" width="100">
              <template #default="scope">
                <span class="text-xs">{{ scope.row.progress }}%</span>
              </template>
            </el-table-column>
            <el-table-column label="结果" min-width="150">
              <template #default="scope">
                <div class="text-xs text-zinc-600">{{ scope.row.message }}</div>
              </template>
            </el-table-column>
            <el-table-column label="重试" width="80" fixed="right">
              <template #default="scope">
                <el-button link type="primary" size="small" :disabled="scope.row.status === '下载中'" @click="onRetry(scope.row)">
                  重试
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-card>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">关闭</el-button>
        <el-button type="primary" @click="onDownload">开始下载</el-button>
      </div>
    </template>
  </el-dialog>
</template>
