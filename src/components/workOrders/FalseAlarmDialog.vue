<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FalseAlarmReason } from '@/utils/workOrdersStore'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', payload: { reason: FalseAlarmReason; note: string }): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const reasons: { label: FalseAlarmReason; desc: string }[] = [
  { label: '算法错误', desc: '模型误检或泛化不足' },
  { label: '画框范围错误', desc: 'ROI或检测框范围不合理' },
  { label: '摄像头角度问题', desc: '视角遮挡/反光/抖动导致误报' },
  { label: '算法配置有误', desc: '阈值、触发次数、冷却时间等配置不当' },
  { label: '异常为恢复', desc: '现场已恢复，但系统仍判异常' },
  { label: '未交付', desc: '场景未交付或未验收' },
  { label: '无需监控该场景', desc: '该场景无需监控或已变更' },
  { label: '未达到异常时限', desc: '未满足持续异常阈值' },
]

const selected = ref<FalseAlarmReason>('算法错误')
const note = ref('')

watch(
  () => open.value,
  (v) => {
    if (!v) return
    selected.value = '算法错误'
    note.value = ''
  }
)

function onConfirm() {
  emit('confirm', { reason: selected.value, note: note.value.trim() })
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" title="误告原因" width="720" append-to-body>
    <div class="space-y-3">
      <div class="text-xs text-zinc-500">选择原因后将关闭工单并标记为“误报关闭”。</div>
      <el-radio-group v-model="selected" class="w-full">
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label
            v-for="r in reasons"
            :key="r.label"
            class="flex cursor-pointer items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 hover:border-zinc-300"
          >
            <el-radio :label="r.label">{{ r.label }}</el-radio>
            <span class="text-xs text-zinc-500">{{ r.desc }}</span>
          </label>
        </div>
      </el-radio-group>
      <div>
        <div class="text-xs text-zinc-500">备注（可选）</div>
        <el-input v-model="note" class="mt-1" type="textarea" :rows="3" placeholder="例如：阈值过低，ROI覆盖过大" />
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" @click="onConfirm">确定</el-button>
      </div>
    </template>
  </el-dialog>
</template>

