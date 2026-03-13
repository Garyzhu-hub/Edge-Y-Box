import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { SystemRole } from '@/utils/rolesMock'

export type UserRole = 'super_admin' | 'project_user'

const ROLE_KEY = 'edge_ybox_role'
const ROLES_KEY = 'edge_roles_v1'

function loadRolesFromStorage(): SystemRole[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ROLES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as SystemRole[]
  } catch {
    return []
  }
}

function normalizePermissions(list: string[]) {
  const set = new Set(list)
  if (set.has('*')) return ['*']
  return Array.from(set)
}

export const useAuthStore = defineStore('auth', () => {
  const role = ref<UserRole>('project_user')
  const username = ref('admin')

  const permissions = computed<string[]>(() => {
    if (role.value === 'super_admin') return ['*']

    const roles = loadRolesFromStorage()
    const projectRole = roles.find((r) => r.id === 'R-00002' || r.name === '项目人员')
    const configured = projectRole?.permissionIds ? normalizePermissions(projectRole.permissionIds) : []
    if (configured.length) return configured

    return [
      'dashboard.view',
      'alarms.records.view',
      'alarms.settings.view',
      'workOrders.view',
      'devices.cameras.view',
      'devices.nvrs.view',
      'devices.gbCascade.view',
      'tasks.view',
      'tasks.create',
      'algorithms.view',
      'deployments.view',
      'logs.operation.view',
      'logs.system.view',
      'logs.security.view',
      'logs.communication.view',
      'system.cloud.view',
    ]
  })

  function hasPermission(permissionId: string) {
    if (role.value === 'super_admin') return true
    if (permissions.value.includes('*')) return true
    return permissions.value.includes(permissionId)
  }

  function setRole(next: UserRole) {
    role.value = next
    localStorage.setItem(ROLE_KEY, next)
  }

  function loadFromStorage() {
    const saved = localStorage.getItem(ROLE_KEY)
    if (saved === 'super_admin' || saved === 'project_user') role.value = saved
  }

  return { role, username, permissions, hasPermission, setRole, loadFromStorage }
})
