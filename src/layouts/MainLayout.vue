<script setup lang="ts">
import SideNav from '@/components/layout/SideNav.vue'
import TopBar from '@/components/layout/TopBar.vue'
import AlarmCenterOverlay from '@/components/alarms/AlarmCenterOverlay.vue'
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-zinc-50 text-zinc-900">
    <div class="flex h-full">
      <SideNav />
      <div class="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main class="min-h-0 flex-1 overflow-auto px-4 py-4">
          <router-view />
        </main>
      </div>
    </div>
    <AlarmCenterOverlay />
  </div>
</template>
