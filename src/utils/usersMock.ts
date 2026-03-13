export type UserStatus = '启用' | '禁用'
export type SystemUserRole = 'super_admin' | 'project_user'

export type SystemUser = {
  id: string
  username: string
  displayName: string
  role: SystemUserRole
  status: UserStatus
  lastLoginMs: number
  createdAtMs: number
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

export function makeMockUsers(params: { seed?: number; nowMs?: number; count?: number }): SystemUser[] {
  const seed = params.seed ?? 20260311
  const nowMs = params.nowMs ?? Date.now()
  const count = params.count ?? 12
  const rand = mulberry32(seed)

  const names = ['张伟', '王芳', '李娜', '刘强', '陈杰', '杨洋', '周敏', '吴磊', '郑爽', '孙涛', '何静', '高飞']
  const roles: SystemUserRole[] = ['project_user', 'project_user', 'project_user', 'super_admin']
  const users: SystemUser[] = Array.from({ length: count }).map((_, i) => {
    const role = roles[Math.floor(rand() * roles.length)]
    const status: UserStatus = rand() > 0.15 ? '启用' : '禁用'
    const createdAtMs = nowMs - Math.floor((7 + rand() * 60) * 24 * 60 * 60 * 1000)
    const lastLoginMs = status === '禁用' ? createdAtMs : nowMs - Math.floor(rand() * 14 * 24 * 60 * 60 * 1000)
    const username = i === 0 ? 'admin' : `user_${String(1000 + i).padStart(4, '0')}`
    const displayName = i === 0 ? '超级管理员' : names[i % names.length]
    return {
      id: `U-${String(10000 + i).padStart(5, '0')}`,
      username,
      displayName,
      role: i === 0 ? 'super_admin' : role,
      status: i === 0 ? '启用' : status,
      lastLoginMs,
      createdAtMs,
    }
  })

  return users.sort((a, b) => b.createdAtMs - a.createdAtMs)
}

