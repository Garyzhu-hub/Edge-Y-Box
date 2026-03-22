import { defaultProjectUserPermissionIds, permissionCatalog } from '@/config/permissionCatalog'

export type RoleStatus = '启用' | '禁用'

export type SystemRole = {
  id: string
  name: string
  description: string
  status: RoleStatus
  permissionIds: string[]
  createdAtMs: number
  updatedAtMs: number
}

function mulberry32(seed: number) {
  let s = seed | 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeDefaultRoles(nowMs = Date.now()): SystemRole[] {
  const all = permissionCatalog.map((p) => p.id)
  const base: SystemRole[] = [
    {
      id: 'R-00001',
      name: '超级管理员',
      description: '系统内置角色（演示），拥有全部权限。',
      status: '启用',
      permissionIds: ['*', ...all],
      createdAtMs: nowMs - 30 * 24 * 60 * 60 * 1000,
      updatedAtMs: nowMs - 2 * 24 * 60 * 60 * 1000,
    },
    {
      id: 'R-00002',
      name: '项目人员',
      description: '系统内置角色（演示），具备日常查看权限。',
      status: '启用',
      permissionIds: defaultProjectUserPermissionIds(),
      createdAtMs: nowMs - 28 * 24 * 60 * 60 * 1000,
      updatedAtMs: nowMs - 3 * 24 * 60 * 60 * 1000,
    },
  ]

  const rand = mulberry32(20260311)
  const customNames = ['巡检督导', '运维人员', '只读审计']
  const custom = customNames.map((name, i): SystemRole => {
    const createdAtMs = nowMs - Math.floor((5 + rand() * 20) * 24 * 60 * 60 * 1000)
    const updatedAtMs = createdAtMs + Math.floor(rand() * 5 * 24 * 60 * 60 * 1000)
    const permissionIds = all.filter(() => rand() > 0.5).slice(0, 10)
    return {
      id: `R-${String(10000 + i).slice(1)}`,
      name,
      description: '自定义角色（演示）',
      status: rand() > 0.2 ? '启用' : '禁用',
      permissionIds,
      createdAtMs,
      updatedAtMs,
    }
  })

  return [...base, ...custom].sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}

