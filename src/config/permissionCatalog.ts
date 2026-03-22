/** 单条权限（通常为按钮/操作级） */
export type PermissionLeaf = { id: string; label: string }

/** 小功能模块（如「用户管理」） */
export type PermissionSubmodule = {
  key: string
  label: string
  actions: PermissionLeaf[]
}

/** 大功能模块（如「系统管理」） */
export type PermissionModule = {
  key: string
  label: string
  children: PermissionSubmodule[]
}

/** 权限树：大模块 → 小模块 → 操作 */
export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: 'dashboard',
    label: '运行看板',
    children: [
      {
        key: 'dashboard',
        label: '运行看板',
        actions: [{ id: 'dashboard.view', label: '查看' }],
      },
    ],
  },
  {
    key: 'alarms',
    label: 'AI预警',
    children: [
      {
        key: 'alarms.records',
        label: '报警记录',
        actions: [
          { id: 'alarms.records.view', label: '查看' },
          { id: 'alarms.records.delete', label: '删除' },
        ],
      },
      {
        key: 'workOrders',
        label: '告警工单',
        actions: [
          { id: 'workOrders.view', label: '查看' },
          { id: 'workOrders.edit', label: '处理' },
        ],
      },
      {
        key: 'alarms.settings',
        label: '报警设置',
        actions: [
          { id: 'alarms.settings.view', label: '查看' },
          { id: 'alarms.settings.edit', label: '编辑' },
        ],
      },
    ],
  },
  {
    key: 'devices',
    label: '设备管理',
    children: [
      {
        key: 'devices.cameras',
        label: '摄像头管理',
        actions: [
          { id: 'devices.cameras.view', label: '查看' },
          { id: 'devices.cameras.create', label: '新增' },
          { id: 'devices.cameras.edit', label: '编辑' },
          { id: 'devices.cameras.delete', label: '删除' },
        ],
      },
      {
        key: 'devices.nvrs',
        label: 'NVR管理',
        actions: [
          { id: 'devices.nvrs.view', label: '查看' },
          { id: 'devices.nvrs.create', label: '新增' },
          { id: 'devices.nvrs.edit', label: '编辑' },
          { id: 'devices.nvrs.delete', label: '删除' },
        ],
      },
      {
        key: 'devices.gbCascade',
        label: '国标级联',
        actions: [
          { id: 'devices.gbCascade.view', label: '查看' },
          { id: 'devices.gbCascade.edit', label: '编辑' },
        ],
      },
    ],
  },
  {
    key: 'tasks',
    label: '任务管理',
    children: [
      {
        key: 'tasks',
        label: '抓图任务',
        actions: [
          { id: 'tasks.view', label: '查看' },
          { id: 'tasks.create', label: '新增' },
          { id: 'tasks.edit', label: '编辑' },
          { id: 'tasks.delete', label: '删除' },
        ],
      },
    ],
  },
  {
    key: 'algo',
    label: '算法管理',
    children: [
      {
        key: 'algorithms',
        label: '算法列表',
        actions: [
          { id: 'algorithms.view', label: '查看' },
          { id: 'algorithms.create', label: '新增' },
          { id: 'algorithms.edit', label: '编辑' },
          { id: 'algorithms.delete', label: '删除' },
        ],
      },
      {
        key: 'deployments',
        label: '布点管理',
        actions: [
          { id: 'deployments.view', label: '查看' },
          { id: 'deployments.create', label: '新增' },
          { id: 'deployments.edit', label: '编辑' },
          { id: 'deployments.delete', label: '删除' },
        ],
      },
    ],
  },
  {
    key: 'logs',
    label: '日志中心',
    children: [
      {
        key: 'logs.operation',
        label: '操作日志',
        actions: [
          { id: 'logs.operation.view', label: '查看' },
          { id: 'logs.operation.export', label: '导出' },
        ],
      },
      {
        key: 'logs.system',
        label: '系统日志',
        actions: [
          { id: 'logs.system.view', label: '查看' },
          { id: 'logs.system.export', label: '导出' },
        ],
      },
      {
        key: 'logs.security',
        label: '安全日志',
        actions: [
          { id: 'logs.security.view', label: '查看' },
          { id: 'logs.security.export', label: '导出' },
        ],
      },
      {
        key: 'logs.communication',
        label: '通信日志',
        actions: [
          { id: 'logs.communication.view', label: '查看' },
          { id: 'logs.communication.export', label: '导出' },
        ],
      },
    ],
  },
  {
    key: 'system',
    label: '系统管理',
    children: [
      {
        key: 'system.users',
        label: '用户管理',
        actions: [
          { id: 'system.users.view', label: '查看' },
          { id: 'system.users.create', label: '新增' },
          { id: 'system.users.edit', label: '编辑' },
          { id: 'system.users.delete', label: '删除' },
        ],
      },
      {
        key: 'system.roles',
        label: '角色管理',
        actions: [
          { id: 'system.roles.view', label: '查看' },
          { id: 'system.roles.create', label: '新增' },
          { id: 'system.roles.edit', label: '编辑' },
          { id: 'system.roles.delete', label: '删除' },
        ],
      },
      {
        key: 'system.menus',
        label: '菜单管理',
        actions: [
          { id: 'system.menus.view', label: '查看' },
          { id: 'system.menus.create', label: '新增' },
          { id: 'system.menus.edit', label: '编辑' },
          { id: 'system.menus.delete', label: '删除' },
        ],
      },
      {
        key: 'system.config',
        label: '配置管理',
        actions: [
          { id: 'system.config.view', label: '查看' },
          { id: 'system.config.edit', label: '编辑' },
        ],
      },
      {
        key: 'system.info',
        label: '系统信息',
        actions: [{ id: 'system.info.view', label: '查看' }],
      },
      {
        key: 'system.people',
        label: '人员管理',
        actions: [
          { id: 'system.people.view', label: '查看' },
          { id: 'system.people.create', label: '新增' },
          { id: 'system.people.edit', label: '编辑' },
          { id: 'system.people.delete', label: '删除' },
        ],
      },
      {
        key: 'system.cloud',
        label: '云平台对接',
        actions: [
          { id: 'system.cloud.view', label: '查看' },
          { id: 'system.cloud.edit', label: '编辑' },
        ],
      },
    ],
  },
]

export type PermissionCatalogItem = {
  id: string
  /** 展示用：小模块名-操作，如「用户管理-新增」 */
  label: string
  /** 大功能模块名称 */
  module: string
  /** 小功能模块名称 */
  submodule: string
  /** 与 module 相同，兼容旧代码中 group 字段 */
  group: string
}

function flattenModules(): PermissionCatalogItem[] {
  const out: PermissionCatalogItem[] = []
  for (const mod of PERMISSION_MODULES) {
    for (const sub of mod.children) {
      for (const a of sub.actions) {
        out.push({
          id: a.id,
          label: `${sub.label}-${a.label}`,
          module: mod.label,
          submodule: sub.label,
          group: mod.label,
        })
      }
    }
  }
  return out
}

/** 扁平权限清单（角色存储、筛选、统计条数） */
export const permissionCatalog: PermissionCatalogItem[] = flattenModules()

/** 全部权限 ID（不含 *） */
export const allPermissionIds: string[] = permissionCatalog.map((p) => p.id)

/** 「项目人员」演示默认：非系统模块的「查看」+ 抓图任务新增 */
export function defaultProjectUserPermissionIds(): string[] {
  const ids = permissionCatalog
    .map((p) => p.id)
    .filter((id) => !id.startsWith('system.') && (id.endsWith('.view') || id === 'tasks.create'))
  return Array.from(new Set(ids))
}
