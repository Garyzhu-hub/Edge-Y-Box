<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import { useTheme } from '@/composables/useTheme'

const { isDark } = useTheme()
</script>

<template>
  <el-config-provider :dark="isDark">
    <router-view />
  </el-config-provider>
</template>
