<script setup lang="ts">
export type WorkOrderStatus = '异常' | '已恢复' | '已关闭' | '误报关闭'

defineProps<{ status: WorkOrderStatus }>()

function tagType(status: WorkOrderStatus) {
  if (status === '异常') return 'danger'
  if (status === '已恢复') return 'success'
  if (status === '误报关闭') return 'warning'
  return 'info'
}
</script>

<template>
  <el-tag :type="tagType(status)" size="small">{{ status }}</el-tag>
</template>

