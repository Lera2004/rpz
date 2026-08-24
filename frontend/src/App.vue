<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('ped_user') || 'null')
  } catch {
    return null
  }
}

const authState = ref({
  token: localStorage.getItem('ped_token') || '',
  user: getCurrentUser()
})

const syncAuthState = () => {
  authState.value = {
    token: localStorage.getItem('ped_token') || '',
    user: getCurrentUser()
  }
}

const isAuthenticated = computed(() => Boolean(authState.value.token))
const currentUser = computed(() => authState.value.user)

const role = computed(() => currentUser.value?.role || 'teacher')

const navigation = computed(() => {
  const common = [
    { to: '/', label: 'Головна' },
    { to: '/tasks', label: 'Завдання' },
    { to: '/workload', label: 'Педагогічне навантаження' },
    { to: '/documents', label: 'Документи' },
    { to: '/statements', label: 'Відомості' }
  ]

  if (role.value === 'admin') {
    return [
      ...common,
      { to: '/teachers', label: 'Викладачі' },
      { to: '/groups', label: 'Групи' },
      { to: '/plans', label: 'Навчальні плани' },
      { to: '/schedule', label: 'Розклад' },
      { to: '/education-process', label: 'Графік освітнього процесу' },
      { to: '/student-distribution', label: 'Розподіл студентів' },
      { to: '/users', label: 'Користувачі' }
    ]
  }

  if (role.value === 'chair') {
    return [
      ...common,
      { to: '/teachers', label: 'Викладачі' },
      { to: '/groups', label: 'Групи' },
      { to: '/plans', label: 'Навчальні плани' },
      { to: '/schedule', label: 'Розклад' },
      { to: '/education-process', label: 'Графік освітнього процесу' },
      { to: '/student-distribution', label: 'Розподіл студентів' },
      { to: '/users', label: 'Користувачі' }
    ]
  }

  return [
    ...common,
    { to: '/tasks', label: 'Мої завдання' }
  ]
})

const handleAuthChange = () => {
  syncAuthState()
}

onMounted(() => {
  window.addEventListener('storage', handleAuthChange)
  window.addEventListener('auth-changed', handleAuthChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleAuthChange)
  window.removeEventListener('auth-changed', handleAuthChange)
})

const logout = () => {
  localStorage.removeItem('ped_token')
  localStorage.removeItem('ped_user')
  syncAuthState()
  window.dispatchEvent(new Event('auth-changed'))
  router.push('/login')
}

// compute academic year for sidebar footer
const academicYear = (() => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1..12
  if (month >= 9) return `${year}–${year + 1}`
  return `${year - 1}–${year}`
})()
</script>

<template>
  <div class="app-shell">
    <template v-if="isAuthenticated">
      <header class="header">
        <div class="brand-wrap">
          <div class="brand-mark">P</div>
          <div>
            <div class="brand-title">Педагогічне навантаження</div>
            <div class="brand-subtitle">Система управління</div>
          </div>
        </div>

        <div class="header-actions">
          <button class="icon-button" title="Повідомлення">🔔</button>
          <button class="icon-button" title="Профіль">👤</button>
          <div class="user-chip">
            <span class="user-role">{{ currentUser?.role_label || 'Користувач' }}</span>
            <strong>{{ currentUser?.full_name || 'Користувач' }}</strong>
          </div>
          <button class="logout-button" type="button" @click="logout">Вийти</button>
        </div>
      </header>

      <div class="layout">
        <aside class="sidebar">
          <nav class="sidebar-nav">
            <RouterLink v-for="item in navigation" :key="item.to" :to="item.to">
              {{ item.label }}
            </RouterLink>
          </nav>
        </aside>

        <main class="content">
          <RouterView />
        </main>
      </div>
    </template>

    <RouterView v-else />
  </div>
</template>