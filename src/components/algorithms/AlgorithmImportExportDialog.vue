<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Algorithm } from '@/utils/algorithmsMock'

type Mode = 'export' | 'import'

const props = defineProps<{ modelValue: boolean; mode: Mode; algorithms: Algorithm[] }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'import', payload: { algorithms: Algorithm[]; merge: boolean }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const state = reactive({
  text: '',
  merge: true,
})

const title = computed(() => (props.mode === 'export' ? '导出算法' : '导入算法'))

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    state.merge = true
    state.text = props.mode === 'export' ? JSON.stringify(props.algorithms, null, 2) : ''
  }
)

async function copy() {
  try {
    await navigator.clipboard.writeText(state.text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动全选复制')
  }
}

function onImport() {
  try {
    const parsed = JSON.parse(state.text)
    if (!Array.isArray(parsed)) {
      ElMessage.warning('导入内容必须为算法数组JSON')
      return
    }
    const list = parsed as Algorithm[]
    if (!list.every((x) => x && typeof x.id === 'string' && typeof x.name === 'string')) {
      ElMessage.warning('算法数据格式不合法')
      return
    }
    emit('import', { algorithms: list, merge: state.merge })
    open.value = false
    ElMessage.success('导入完成（演示）')
  } catch {
    ElMessage.error('JSON解析失败')
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="920" append-to-body>
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="text-xs text-zinc-500">
        <template v-if="mode === 'export'">用于备份/迁移（演示）。</template>
        <template v-else>粘贴算法数组JSON，支持合并或覆盖（演示）。</template>
      </div>
      <div class="flex items-center gap-2">
        <el-switch v-if="mode === 'import'" v-model="state.merge" active-text="合并" inactive-text="覆盖" />
        <el-button v-if="mode === 'export'" @click="copy">复制JSON</el-button>
      </div>
    </div>
    <el-input v-model="state.text" type="textarea" :rows="18" placeholder="粘贴JSON..." />

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">关闭</el-button>
        <el-button v-if="mode === 'import'" type="primary" @click="onImport">导入</el-button>
      </div>
    </template>
  </el-dialog>
</template>

