import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import DashboardPage from '@/views/DashboardPage.vue'
import AlarmRecordsPage from '@/views/AlarmRecordsPage.vue'
import WorkOrdersPage from '@/views/WorkOrdersPage.vue'
import WorkOrderDetailPage from '@/views/WorkOrderDetailPage.vue'
import DevicesCamerasPage from '@/views/DevicesCamerasPage.vue'
import DevicesGbCascadePage from '@/views/DevicesGbCascadePage.vue'
import DevicesNvrsPage from '@/views/DevicesNvrsPage.vue'
import TasksPage from '@/views/TasksPage.vue'
import AlgorithmsPage from '@/views/AlgorithmsPage.vue'
import DeploymentsPage from '@/views/DeploymentsPage.vue'
import OperationLogsPage from '@/views/logs/OperationLogsPage.vue'
import SystemLogsPage from '@/views/logs/SystemLogsPage.vue'
import SecurityLogsPage from '@/views/logs/SecurityLogsPage.vue'
import CommunicationLogsPage from '@/views/logs/CommunicationLogsPage.vue'
import SystemCloudPage from '@/views/SystemCloudPage.vue'
import AlarmSettingsPage from '@/views/AlarmSettingsPage.vue'
import SystemUsersPage from '@/views/SystemUsersPage.vue'
import SystemRolesPage from '@/views/SystemRolesPage.vue'
import SystemPermissionsPage from '@/views/SystemPermissionsPage.vue'
import SystemMenusPage from '@/views/SystemMenusPage.vue'
import SystemConfigPage from '@/views/SystemConfigPage.vue'
import SystemInfoPage from '@/views/SystemInfoPage.vue'
import SystemPeoplePage from '@/views/SystemPeoplePage.vue'
import ForbiddenPage from '@/views/ForbiddenPage.vue'
import NotFoundPage from '@/views/NotFoundPage.vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/403',
      name: 'forbidden',
      component: ForbiddenPage,
      meta: { title: '无权限' },
    },
    {
      path: '/',
      component: MainLayout,
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: DashboardPage,
          meta: { title: '运行看板', permission: 'dashboard.view' },
        },
        {
          path: 'alarms',
          name: 'alarms.records',
          component: AlarmRecordsPage,
          meta: { title: '报警记录', permission: 'alarms.records.view' },
        },
        {
          path: 'work-orders',
          name: 'workOrders.list',
          component: WorkOrdersPage,
          meta: { title: '告警工单', permission: 'workOrders.view' },
        },
        {
          path: 'work-orders/:workOrderId',
          name: 'workOrders.detail',
          component: WorkOrderDetailPage,
          meta: { title: '工单详情', permission: 'workOrders.view' },
        },
        {
          path: 'alarms/settings',
          name: 'alarms.settings',
          component: AlarmSettingsPage,
          meta: { title: '报警设置', permission: 'alarms.settings.view' },
        },
        {
          path: 'devices/cameras',
          name: 'devices.cameras',
          component: DevicesCamerasPage,
          meta: { title: '摄像头管理', permission: 'devices.cameras.view' },
        },
        {
          path: 'devices/nvrs',
          name: 'devices.nvrs',
          component: DevicesNvrsPage,
          meta: { title: 'NVR管理', permission: 'devices.nvrs.view' },
        },
        {
          path: 'devices/gb-cascade',
          name: 'devices.gbCascade',
          component: DevicesGbCascadePage,
          meta: { title: '国标级联', permission: 'devices.gbCascade.view' },
        },
        {
          path: 'tasks',
          name: 'tasks',
          component: TasksPage,
          meta: { title: '任务管理', permission: 'tasks.view' },
        },
        {
          path: 'algorithms',
          name: 'algorithms',
          component: AlgorithmsPage,
          meta: { title: '算法管理', permission: 'algorithms.view' },
        },
        {
          path: 'deployments',
          name: 'deployments',
          component: DeploymentsPage,
          meta: { title: '布点管理', permission: 'deployments.view' },
        },
        {
          path: 'logs/operation',
          name: 'logs.operation',
          component: OperationLogsPage,
          meta: { title: '操作日志', permission: 'logs.operation.view' },
        },
        {
          path: 'logs/system',
          name: 'logs.system',
          component: SystemLogsPage,
          meta: { title: '系统日志', permission: 'logs.system.view' },
        },
        {
          path: 'logs/security',
          name: 'logs.security',
          component: SecurityLogsPage,
          meta: { title: '安全日志', permission: 'logs.security.view' },
        },
        {
          path: 'logs/communication',
          name: 'logs.communication',
          component: CommunicationLogsPage,
          meta: { title: '通信日志', permission: 'logs.communication.view' },
        },
        {
          path: 'system/users',
          name: 'system.users',
          component: SystemUsersPage,
          meta: { title: '用户管理', permission: 'system.users.view' },
        },
        {
          path: 'system/roles',
          name: 'system.roles',
          component: SystemRolesPage,
          meta: { title: '角色管理', permission: 'system.roles.view' },
        },
        {
          path: 'system/permissions',
          name: 'system.permissions',
          component: SystemPermissionsPage,
          meta: { title: '角色权限', permission: 'system.permissions.view' },
        },
        {
          path: 'system/menus',
          name: 'system.menus',
          component: SystemMenusPage,
          meta: { title: '菜单管理', permission: 'system.menus.view' },
        },
        {
          path: 'system/config',
          name: 'system.config',
          component: SystemConfigPage,
          meta: { title: '配置管理', permission: 'system.config.view' },
        },
        {
          path: 'system/info',
          name: 'system.info',
          component: SystemInfoPage,
          meta: { title: '系统信息', permission: 'system.info.view' },
        },
        {
          path: 'system/people',
          name: 'system.people',
          component: SystemPeoplePage,
          meta: { title: '人员管理', permission: 'system.people.view' },
        },
        {
          path: 'system/cloud',
          name: 'system.cloud',
          component: SystemCloudPage,
          meta: { title: '云平台对接', permission: 'system.cloud.view' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'notFound',
      component: NotFoundPage,
      meta: { title: '页面不存在' },
    },
  ],
})

router.beforeEach((to) => {
  const app = useAppStore()
  app.syncFromRoute(to)

  const auth = useAuthStore()
  auth.loadFromStorage()
  const permission = typeof to.meta.permission === 'string' ? to.meta.permission : null
  if (permission && !auth.hasPermission(permission)) {
    return { name: 'forbidden', replace: true }
  }
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : null
  if (title) document.title = `${title} - Edge Y-box`
})

export default router
