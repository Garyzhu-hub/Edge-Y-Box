export type MenuStatus = '显示' | '隐藏'

export type SystemMenuItem = {
  id: string
  parentId: string | null
  title: string
  path: string
  icon?: string
  permission?: string
  status: MenuStatus
  order: number
}

export function makeDefaultMenus(nowMs = Date.now()): SystemMenuItem[] {
  const list: SystemMenuItem[] = [
    { id: 'M-00001', parentId: null, title: '运行看板', path: '/dashboard', permission: 'dashboard.view', status: '显示', order: 10 },
    { id: 'M-00010', parentId: null, title: 'AI预警', path: '/alarms', permission: 'alarms.records.view', status: '显示', order: 20 },
    { id: 'M-00011', parentId: 'M-00010', title: '报警记录', path: '/alarms', permission: 'alarms.records.view', status: '显示', order: 10 },
    { id: 'M-00012', parentId: 'M-00010', title: '告警工单', path: '/work-orders', permission: 'workOrders.view', status: '显示', order: 20 },
    { id: 'M-00013', parentId: 'M-00010', title: '报警设置', path: '/alarms/settings', permission: 'alarms.settings.view', status: '显示', order: 30 },

    { id: 'M-00020', parentId: null, title: '设备管理', path: '/devices/cameras', permission: 'devices.cameras.view', status: '显示', order: 30 },
    { id: 'M-00021', parentId: 'M-00020', title: '摄像头管理', path: '/devices/cameras', permission: 'devices.cameras.view', status: '显示', order: 10 },
    { id: 'M-00022', parentId: 'M-00020', title: '国标级联', path: '/devices/gb-cascade', permission: 'devices.gbCascade.view', status: '显示', order: 20 },

    { id: 'M-00030', parentId: null, title: '任务管理', path: '/tasks', permission: 'tasks.view', status: '显示', order: 40 },
    { id: 'M-00040', parentId: null, title: '算法与布点', path: '/algorithms', permission: 'algorithms.view', status: '显示', order: 50 },
    { id: 'M-00041', parentId: 'M-00040', title: '算法管理', path: '/algorithms', permission: 'algorithms.view', status: '显示', order: 10 },
    { id: 'M-00042', parentId: 'M-00040', title: '布点管理', path: '/deployments', permission: 'deployments.view', status: '显示', order: 20 },

    { id: 'M-00050', parentId: null, title: '日志中心', path: '/logs/operation', permission: 'logs.operation.view', status: '显示', order: 60 },
    { id: 'M-00051', parentId: 'M-00050', title: '操作日志', path: '/logs/operation', permission: 'logs.operation.view', status: '显示', order: 10 },
    { id: 'M-00052', parentId: 'M-00050', title: '系统日志', path: '/logs/system', permission: 'logs.system.view', status: '显示', order: 20 },
    { id: 'M-00053', parentId: 'M-00050', title: '安全日志', path: '/logs/security', permission: 'logs.security.view', status: '显示', order: 30 },
    { id: 'M-00054', parentId: 'M-00050', title: '通信日志', path: '/logs/communication', permission: 'logs.communication.view', status: '显示', order: 40 },

    { id: 'M-00060', parentId: null, title: '系统管理', path: '/system/users', permission: 'system.users.view', status: '显示', order: 70 },
    { id: 'M-00061', parentId: 'M-00060', title: '用户管理', path: '/system/users', permission: 'system.users.view', status: '显示', order: 10 },
    { id: 'M-00062', parentId: 'M-00060', title: '角色管理', path: '/system/roles', permission: 'system.roles.view', status: '显示', order: 20 },
    { id: 'M-00063', parentId: 'M-00060', title: '角色权限', path: '/system/permissions', permission: 'system.permissions.view', status: '显示', order: 30 },
    { id: 'M-00064', parentId: 'M-00060', title: '菜单管理', path: '/system/menus', permission: 'system.menus.view', status: '显示', order: 40 },
    { id: 'M-00065', parentId: 'M-00060', title: '配置管理', path: '/system/config', permission: 'system.config.view', status: '显示', order: 50 },
    { id: 'M-00066', parentId: 'M-00060', title: '系统信息', path: '/system/info', permission: 'system.info.view', status: '显示', order: 60 },
    { id: 'M-00067', parentId: 'M-00060', title: '人员管理', path: '/system/people', permission: 'system.people.view', status: '显示', order: 70 },
    { id: 'M-00068', parentId: 'M-00060', title: '云平台对接', path: '/system/cloud', permission: 'system.cloud.view', status: '显示', order: 80 },
  ]

  void nowMs
  return list
}

export function buildMenuTree(list: SystemMenuItem[]) {
  const byParent = new Map<string | null, SystemMenuItem[]>()
  for (const item of list) {
    if (!byParent.has(item.parentId)) byParent.set(item.parentId, [])
    byParent.get(item.parentId)!.push(item)
  }
  for (const [, items] of byParent) items.sort((a, b) => a.order - b.order)

  function build(parentId: string | null): Array<SystemMenuItem & { children?: any[] }> {
    const items = byParent.get(parentId) ?? []
    return items.map((x) => {
      const children = build(x.id)
      return children.length ? { ...x, children } : { ...x }
    })
  }

  return build(null)
}

