import { markRaw } from 'vue'
import type { Component } from 'vue'
import {
  Activity,
  Bell,
  Camera,
  Cloud,
  Cpu,
  Gauge,
  Info,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  MenuSquare,
  Network,
  Settings,
  Shield,
  Users,
  UserRound,
  Video,
  Wrench,
} from 'lucide-vue-next'

export type NavItem = {
  key: string
  label: string
  to?: string
  icon?: Component
  permission?: string
  children?: NavItem[]
}

export const navItems: NavItem[] = [
  {
    key: 'dashboard',
    label: '运行看板',
    to: '/dashboard',
    icon: markRaw(LayoutDashboard),
    permission: 'dashboard.view',
  },
  {
    key: 'alarms',
    label: 'AI预警',
    icon: markRaw(Bell),
    children: [
      {
        key: 'alarms.records',
        label: '报警记录',
        to: '/alarms',
        icon: markRaw(Activity),
        permission: 'alarms.records.view',
      },
      {
        key: 'workOrders',
        label: '告警工单',
        to: '/work-orders',
        icon: markRaw(ListChecks),
        permission: 'workOrders.view',
      },
      {
        key: 'alarms.settings',
        label: '报警设置',
        to: '/alarms/settings',
        icon: markRaw(Settings),
        permission: 'alarms.settings.view',
      },
    ],
  },
  {
    key: 'devices',
    label: '设备管理',
    icon: markRaw(Camera),
    children: [
      {
        key: 'devices.cameras',
        label: '摄像头管理',
        to: '/devices/cameras',
        icon: markRaw(Camera),
        permission: 'devices.cameras.view',
      },
      {
        key: 'devices.nvrs',
        label: 'NVR管理',
        to: '/devices/nvrs',
        icon: markRaw(Video),
        permission: 'devices.nvrs.view',
      },
      {
        key: 'devices.gbCascade',
        label: '国标级联',
        to: '/devices/gb-cascade',
        icon: markRaw(Network),
        permission: 'devices.gbCascade.view',
      },
    ],
  },
  {
    key: 'tasks',
    label: '任务管理',
    to: '/tasks',
    icon: markRaw(Gauge),
    permission: 'tasks.view',
  },
  {
    key: 'algo',
    label: '算法管理',
    icon: markRaw(Cpu),
    children: [
      {
        key: 'algorithms',
        label: '算法列表',
        to: '/algorithms',
        icon: markRaw(Cpu),
        permission: 'algorithms.view',
      },
      {
        key: 'deployments',
        label: '布点管理',
        to: '/deployments',
        icon: markRaw(Wrench),
        permission: 'deployments.view',
      },
    ],
  },
  {
    key: 'logs',
    label: '日志中心',
    icon: markRaw(ScrollText),
    children: [
      {
        key: 'logs.operation',
        label: '操作日志',
        to: '/logs/operation',
        icon: markRaw(MenuSquare),
        permission: 'logs.operation.view',
      },
      {
        key: 'logs.system',
        label: '系统日志',
        to: '/logs/system',
        icon: markRaw(Cloud),
        permission: 'logs.system.view',
      },
      {
        key: 'logs.security',
        label: '安全日志',
        to: '/logs/security',
        icon: markRaw(Shield),
        permission: 'logs.security.view',
      },
      {
        key: 'logs.communication',
        label: '通信日志',
        to: '/logs/communication',
        icon: markRaw(Network),
        permission: 'logs.communication.view',
      },
    ],
  },
  {
    key: 'system',
    label: '系统管理',
    icon: markRaw(KeyRound),
    children: [
      {
        key: 'system.users',
        label: '用户管理',
        to: '/system/users',
        icon: markRaw(Users),
        permission: 'system.users.view',
      },
      {
        key: 'system.roles',
        label: '角色管理',
        to: '/system/roles',
        icon: markRaw(UserRound),
        permission: 'system.roles.view',
      },
      {
        key: 'system.menus',
        label: '菜单管理',
        to: '/system/menus',
        icon: markRaw(MenuSquare),
        permission: 'system.menus.view',
      },
      {
        key: 'system.config',
        label: '配置管理',
        to: '/system/config',
        icon: markRaw(Settings),
        permission: 'system.config.view',
      },
      {
        key: 'system.info',
        label: '系统信息',
        to: '/system/info',
        icon: markRaw(Info),
        permission: 'system.info.view',
      },
      {
        key: 'system.people',
        label: '人员管理',
        to: '/system/people',
        icon: markRaw(Users),
        permission: 'system.people.view',
      },
      {
        key: 'system.cloud',
        label: '云平台对接',
        to: '/system/cloud',
        icon: markRaw(Cloud),
        permission: 'system.cloud.view',
      },
    ],
  },
]
