<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { defaultInstanceParams, type AlgorithmInstance, type InstanceParams } from '@/utils/deploymentsMock'

type Option = { id: string; label: string }

const props = defineProps<{
  modelValue: boolean
  initial: AlgorithmInstance | null
  algorithms: Option[]
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
  version: string
  enabled: boolean
  params: InstanceParams
}

const form = reactive<FormModel>({
  algorithmId: '',
  version: 'v1.0.0',
  enabled: true,
  params: defaultInstanceParams(),
})

const formRef = ref()
const saving = ref(false)
const title = computed(() => (props.initial ? '编辑算法实例' : '新增算法实例'))

const rules = {
  algorithmId: [{ required: true, message: '请选择算法', trigger: 'change' }],
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
}

function resetFromInitial() {
  if (!props.initial) {
    form.algorithmId = props.algorithms[0]?.id || ''
    form.version = 'v1.0.0'
    form.enabled = true
    form.params = defaultInstanceParams()
    loadPresetIfAny(form.algorithmId)
    return
  }
  form.algorithmId = props.initial.algorithmId
  form.version = props.initial.version
  form.enabled = props.initial.enabled
  form.params = props.initial.params ? { ...props.initial.params } : defaultInstanceParams()
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

const PRESET_KEY = 'edge_algorithm_param_presets_v1'

function loadPresets(): Record<string, InstanceParams> {
  try {
    const raw = window.localStorage.getItem(PRESET_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, InstanceParams>) : {}
  } catch {
    return {}
  }
}

function savePresets(next: Record<string, InstanceParams>) {
  try {
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(next))
  } catch {
    return
  }
}

function loadPresetIfAny(algorithmId: string) {
  if (!algorithmId) return
  const presets = loadPresets()
  const hit = presets[algorithmId]
  if (hit) form.params = { ...defaultInstanceParams(), ...hit }
}

async function resetParams() {
  const confirmed = await ElMessageBox.confirm('确认将该实例的检测参数重置为默认值？', '参数重置', {
    type: 'warning',
    confirmButtonText: '重置',
    cancelButtonText: '取消',
  })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return
  form.params = defaultInstanceParams()
}

watch(
  () => form.algorithmId,
  (id) => {
    if (!open.value) return
    loadPresetIfAny(id)
  }
)

async function onSave() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return

  saving.value = true
  try {
    await new Promise((r) => setTimeout(r, 240))
    const alg = props.algorithms.find((a) => a.id === form.algorithmId)
    const presets = loadPresets()
    presets[form.algorithmId] = { ...form.params }
    savePresets(presets)
    emit('saved', {
      id: props.initial?.id || makeId(),
      algorithmId: form.algorithmId,
      algorithmName: alg ? alg.label : '—',
      version: form.version,
      enabled: form.enabled,
      rois: props.initial?.rois || [],
      params: { ...form.params },
    })
    open.value = false
    ElMessage.success('已保存算法实例（占位）')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="640" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="92">
      <el-form-item label="算法" prop="algorithmId">
        <el-select v-model="form.algorithmId" placeholder="选择算法" filterable>
          <el-option v-for="a in algorithms" :key="a.id" :label="a.label" :value="a.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="版本" prop="version">
        <el-input v-model="form.version" placeholder="例如：v1.2.3" />
      </el-form-item>
      <el-form-item label="启用">
        <el-switch v-model="form.enabled" />
      </el-form-item>

      <div class="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold">检测参数</div>
          <el-button size="small" @click="resetParams">一键重置</el-button>
        </div>
        <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div class="text-xs text-zinc-500">置信度阈值</div>
            <el-input-number v-model="form.params.confidence" :min="0.1" :max="0.99" :step="0.01" class="mt-1 w-full" />
          </div>
          <div>
            <div class="text-xs text-zinc-500">触发次数</div>
            <el-input-number v-model="form.params.triggerCount" :min="1" :max="10" class="mt-1 w-full" />
          </div>
          <div>
            <div class="text-xs text-zinc-500">冷却时间(秒)</div>
            <el-input-number v-model="form.params.cooldownSec" :min="0" :max="600" class="mt-1 w-full" />
          </div>
          <div>
            <div class="text-xs text-zinc-500">检测灵敏度(0-100)</div>
            <el-input-number v-model="form.params.sensitivity" :min="0" :max="100" class="mt-1 w-full" />
          </div>
          <div class="md:col-span-2 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div class="rounded-lg border border-zinc-200 bg-white p-2">
              <div class="text-xs text-zinc-500">联动抓拍</div>
              <div class="mt-1"><el-switch v-model="form.params.linkSnapshot" /></div>
            </div>
            <div class="rounded-lg border border-zinc-200 bg-white p-2">
              <div class="text-xs text-zinc-500">报警弹屏</div>
              <div class="mt-1"><el-switch v-model="form.params.popup" /></div>
            </div>
            <div class="rounded-lg border border-zinc-200 bg-white p-2">
              <div class="text-xs text-zinc-500">报警声音</div>
              <div class="mt-1"><el-switch v-model="form.params.sound" /></div>
            </div>
          </div>
        </div>
        <div class="mt-2 text-xs text-zinc-500">同一算法会自动记忆上次保存的参数（本地存储）。</div>
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
