import { createRouter, createWebHistory } from 'vue-router'

import DashboardView from '../views/DashboardView.vue'
import TeachersView from '../views/TeachersView.vue'
import GroupsView from '../views/GroupsView.vue'
import PlansView from '../views/PlansView.vue'
import WorkloadView from '../views/WorkloadView.vue'
import DocumentsView from '../views/DocumentsView.vue'
import StatementsView from '../views/StatementsView.vue'
import StudentDistributionView from '../views/StudentDistributionView.vue'
import EducationProcessView from '../views/EducationProcessView.vue'
import ScheduleView from '../views/ScheduleView.vue'
import TasksView from '../views/TasksView.vue'
import LoginView from '../views/LoginView.vue'
import UsersView from '../views/UsersView.vue'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView
  },
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView
  },
  {
    path: '/teachers',
    name: 'teachers',
    component: TeachersView
  },
  {
    path: '/groups',
    name: 'groups',
    component: GroupsView
  },
  {
    path: '/plans',
    name: 'plans',
    component: PlansView
  },
  {
    path: '/workload',
    name: 'workload',
    component: WorkloadView
  },
  {
    path: '/documents',
    name: 'documents',
    component: DocumentsView
  },
  {
    path: '/statements',
    name: 'statements',
    component: StatementsView
  },
  {
    path: '/student-distribution',
    name: 'student-distribution',
    component: StudentDistributionView
  },
  {
    path: '/education-process',
    name: 'education-process',
    component: EducationProcessView
  },
  {
    path: '/schedule',
    name: 'schedule',
    component: ScheduleView
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: TasksView
  },
  {
    path: '/users',
    name: 'users',
    component: UsersView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('ped_token')
  const isPublicRoute = to.path === '/login'

  if (!token && !isPublicRoute) {
    next('/login')
    return
  }

  if (token && isPublicRoute) {
    next('/')
    return
  }

  next()
})

export default router