<script setup lang="ts">
import IntegrationCard from '@/components/system/IntegrationCard.vue'
import SecretInput from '@/components/system/SecretInput.vue'

type StatusType = 'success' | 'warning' | 'danger' | 'info'

export type SmsConfig = {
  enabled: boolean
  provider: string
  endpoint: string
  signName: string
  templateId: string
  secretConfigured: boolean
}

const props = defineProps<{
  model: SmsConfig
  statusText: string
  statusType: StatusType
  testing: boolean
  secretValue: string
}>()

const emit = defineEmits<{
  (e: 'update:model', v: SmsConfig): void
  (e: 'update:secretValue', v: string): void
  (e: 'test'): void
}>()

const local = reactive<SmsConfig>({ ...props.model })

watch(
  () => props.model,
  (v) => {
    Object.assign(local, v)
  },
  { deep: true }
)

watch(
  () => local,
  () => emit('update:model', { ...local }),
  { deep: true }
)

const secret = computed({
  get: () => props.secretValue,
  set: (v: string) => emit('update:secretValue', v),
})
</script>

<template>
  <IntegrationCard
    title="短信"
    :enabled="local.enabled"
    :status-text="statusText"
    :status-type="statusType"
    :testing="testing"
    @update:enabled="(v) => (local.enabled = v)"
    @test="emit('test')"
  >
    <el-form label-width="92">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <el-form-item label="服务商">
          <el-input v-model="local.provider" placeholder="MockSMS" />
        </el-form-item>
        <el-form-item label="Endpoint">
          <el-input v-model="local.endpoint" placeholder="https://sms.example.com" />
        </el-form-item>
        <el-form-item label="签名">
          <el-input v-model="local.signName" placeholder="EdgeYBox" />
        </el-form-item>
        <el-form-item label="模板ID">
          <el-input v-model="local.templateId" placeholder="TPL_001" />
        </el-form-item>
        <el-form-item label="API Key" class="md:col-span-2">
          <SecretInput v-model="secret" :configured="local.secretConfigured" />
        </el-form-item>
      </div>
      <div class="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        API Key 不回显；仅在你重新输入时更新；为空表示不修改。
      </div>
    </el-form>
  </IntegrationCard>
</template>
