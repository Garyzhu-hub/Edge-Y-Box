<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import SecretInput from '@/components/system/SecretInput.vue'
import type { ConfigItem, ConfigValueType } from '@/utils/configMock'

type SavePayload = {
  id: string
  value?: string
  secretUpdated?: boolean
}

const props = defineProps<{ modelValue: boolean; item: ConfigItem | null }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', payload: SavePayload): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive({
  value: '',
  secret: '',
})

const type = computed<ConfigValueType>(() => props.item?.type ?? 'text')
const isSecret = computed(() => type.value === 'secret')
const isBoolean = computed(() => type.value === 'boolean')
const isJson = computed(() => type.value === 'json')

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    form.value = props.item?.value ?? ''
    form.secret = ''
  }
)

const title = computed(() => `编辑配置：${props.item?.label || ''}`)

function validateValue(next: string) {
  const t = type.value
  if (t === 'number') {
    const n = Number(next)
    if (Number.isNaN(n)) return '数值类型必须为合法数字'
  }
  if (t === 'boolean') {
    if (!(next === 'true' || next === 'false')) return '布尔类型必须为 true/false'
  }
  if (t === 'json') {
    try {
      JSON.parse(next)
    } catch {
      return 'JSON 格式不合法'
    }
  }
  return ''
}

function onSave() {
  if (!props.item) return

  if (isSecret.value) {
    const trimmed = form.secret.trim()
    if (!trimmed) {
      emit('save', { id: props.item.id, secretUpdated: false })
      open.value = false
      return
    }
    emit('save', { id: props.item.id, secretUpdated: true })
    open.value = false
    return
  }

  const next = String(form.value)
  const err = validateValue(next)
  if (err) {
    ElMessage.error(err)
    return
  }
  emit('save', { id: props.item.id, value: next })
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="680" append-to-body>
    <div v-if="item" class="space-y-3">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div class="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">分组</div>
          <div class="mt-1 text-sm font-semibold">{{ item.group }}</div>
        </div>
        <div class="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <div class="text-xs text-zinc-500">配置 Key</div>
          <div class="mt-1 truncate font-mono text-xs">{{ item.key }}</div>
        </div>
      </div>

      <div>
        <div class="text-xs text-zinc-500">值</div>
        <div class="mt-2">
          <SecretInput
            v-if="isSecret"
            v-model="form.secret"
            :configured="Boolean(item.secretConfigured)"
            placeholder="不回显；留空表示不修改"
          />

          <el-input
            v-else-if="!isJson && !isBoolean"
            v-model="form.value"
            :type="type === 'number' ? 'number' : 'text'"
            clearable
          />

          <el-select v-else-if="isBoolean" v-model="form.value" class="w-full">
            <el-option label="true" value="true" />
            <el-option label="false" value="false" />
          </el-select>

          <el-input v-else v-model="form.value" type="textarea" :rows="8" placeholder="请输入 JSON" />
        </div>

        <div v-if="isSecret" class="mt-2 text-xs text-zinc-500">
          密钥字段不回显；不改则不提交。
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" @click="onSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

