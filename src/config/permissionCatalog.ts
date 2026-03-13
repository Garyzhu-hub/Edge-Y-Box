export type PermissionCatalogItem = {
  id: string
  label: string
  group: string
}

export const permissionCatalog: PermissionCatalogItem[] = [
  { id: 'dashboard.view', label: '运行看板-查看', group: '运行看板' },

  { id: 'alarms.records.view', label: '报警记录-查看', group: 'AI预警' },
  { id: 'alarms.settings.view', label: '报警设置-查看', group: 'AI预警' },
  { id: 'workOrders.view', label: '告警工单-查看', group: 'AI预警' },

  { id: 'devices.cameras.view', label: '摄像头管理-查看', group: '设备管理' },
  { id: 'devices.nvrs.view', label: 'NVR管理-查看', group: '设备管理' },
  { id: 'devices.gbCascade.view', label: '国标级联-查看', group: '设备管理' },

  { id: 'tasks.view', label: '任务管理-查看', group: '任务管理' },
  { id: 'tasks.create', label: '任务管理-本地创建', group: '任务管理' },

  { id: 'algorithms.view', label: '算法管理-查看', group: '算法与布点' },
  { id: 'deployments.view', label: '布点管理-查看', group: '算法与布点' },

  { id: 'logs.operation.view', label: '操作日志-查看', group: '日志中心' },
  { id: 'logs.system.view', label: '系统日志-查看', group: '日志中心' },
  { id: 'logs.security.view', label: '安全日志-查看', group: '日志中心' },
  { id: 'logs.communication.view', label: '通信日志-查看', group: '日志中心' },

  { id: 'system.users.view', label: '用户管理-查看', group: '系统管理' },
  { id: 'system.roles.view', label: '角色管理-查看', group: '系统管理' },
  { id: 'system.permissions.view', label: '角色权限-查看', group: '系统管理' },
  { id: 'system.menus.view', label: '菜单管理-查看', group: '系统管理' },
  { id: 'system.config.view', label: '配置管理-查看', group: '系统管理' },
  { id: 'system.info.view', label: '系统信息-查看', group: '系统管理' },
  { id: 'system.people.view', label: '人员管理-查看', group: '系统管理' },
  { id: 'system.cloud.view', label: '云平台对接-查看', group: '系统管理' },
]
