<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { defaultInstanceParams, defaultInstanceSchedule, type AlgorithmInstance } from '@/utils/deploymentsMock'

type Option = { id: string; label: string }
type AlgorithmMeta = {
  id: string
  currentVersion?: string
  versionHistory?: Array<{ version: string }>
}

const props = defineProps<{
  modelValue: boolean
  initial: AlgorithmInstance | null
  algorithms: Option[]
  algorithmMetas?: AlgorithmMeta[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved', instance: AlgorithmInstance): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

type FormModel = {
  algorithmId: string
  versionOverride: string
  follow: boolean
  enabled: boolean
}

const form = reactive<FormModel>({
  algorithmId: '',
  versionOverride: '',
  follow: true,
  enabled: true,
})

const formRef = ref()
const saving = ref(false)
const title = computed(() => (props.initial ? '编辑算法实例' : '新增算法实例'))

const rules = {
  algorithmId: [{ required: true, message: '请选择算法', trigger: 'change' }],
  versionOverride: [
    {
      validator: (_: any, value: any, cb: any) => {
        if (form.follow) return cb()
        if (String(value || '').trim()) return cb()
        cb(new Error('请选择/输入覆盖版本'))
      },
      trigger: 'blur',
    },
  ],
}

const metaById = computed(() => {
  const list = Array.isArray(props.algorithmMetas) ? props.algorithmMetas : []
  return new Map(list.map((x) => [x.id, x]))
})

const currentVersion = computed(() => {
  const m = metaById.value.get(form.algorithmId)
  return String(m?.currentVersion || '')
})

const historyOptions = computed(() => {
  const m = metaById.value.get(form.algorithmId)
  const versions = (m?.versionHistory || []).map((x) => String(x.version || '')).filter(Boolean)
  return Array.from(new Set(versions))
})

function resetFromInitial() {
  if (!props.initial) {
    form.algorithmId = props.algorithms[0]?.id || ''
    form.follow = true
    form.versionOverride = ''
    form.enabled = true
    return
  }
  form.algorithmId = props.initial.algorithmId
  const pinned = String(props.initial.version || '').trim()
  form.follow = !pinned
  form.versionOverride = pinned
  form.enabled = props.initial.enabled
}

watch(
  () => open.value,
  (v) => {
    if (!v) return
    resetFromInitial()
  }
)

function makeId() {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `INS-${String(n).padStart(4, '0')}`
}

async function onSave() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return

  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 240))
    const alg = props.algorithms.find((a) => a.id === form.algorithmId)
    const pinned = form.follow ? '' : String(form.versionOverride || '').trim()
    emit('saved', {
      id: props.initial?.id || makeId(),
      algorithmId: form.algorithmId,
      algorithmName: alg ? alg.label : '—',
      version: pinned,
      enabled: form.enabled,
      roiIds: props.initial?.roiIds ? [...props.initial.roiIds] : [],
      params: props.initial?.params ? { ...props.initial.params } : defaultInstanceParams(),
      schedule: props.initial?.schedule ? { ...props.initial.schedule } : defaultInstanceSchedule(),
    })
    open.value = false
    ElMessage.success('已保存算法实例（占位）')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="560" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="92">
      <el-form-item label="算法" prop="algorithmId">
        <el-select v-model="form.algorithmId" placeholder="选择算法" filterable>
          <el-option v-for="a in algorithms" :key="a.id" :label="a.label" :value="a.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="版本模式">
        <el-radio-group v-model="form.follow">
          <el-radio :label="true">跟随当前版本</el-radio>
          <el-radio :label="false">覆盖版本</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="form.follow" label="生效版本">
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs">{{ currentVersion || '—' }}</span>
          <el-tag size="small" type="info">盒子全局生效</el-tag>
        </div>
      </el-form-item>
      <el-form-item v-else label="覆盖版本" prop="versionOverride">
        <el-select
          v-model="form.versionOverride"
          placeholder="选择历史版本或输入"
          filterable
          allow-create
          default-first-option
          class="w-full"
        >
          <el-option v-for="v in historyOptions" :key="v" :label="v" :value="v" />
        </el-select>
      </el-form-item>
      <el-form-item label="启用">
        <el-switch v-model="form.enabled" />
      </el-form-item>

      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        检测参数、ROI 选择与调度请在「编辑布点」主界面中配置，此处仅维护算法与版本，避免重复入口。
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
