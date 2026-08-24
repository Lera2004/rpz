<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api.js'

const router = useRouter()
const form = ref({
  login: '',
  password: ''
})
const error = ref('')
const submitting = ref(false)

const submit = async () => {
  if (!form.value.login.trim() || !form.value.password.trim()) {
    error.value = 'Введіть логін і пароль.'
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const response = await api.post('/auth/login', {
      login: form.value.login.trim(),
      password: form.value.password.trim()
    })

    localStorage.setItem('ped_token', response.data.token)
    localStorage.setItem('ped_user', JSON.stringify(response.data.user))
    window.dispatchEvent(new Event('auth-changed'))

    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.message || 'Не вдалося увійти.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="login-title">Педагогічне навантаження</div>
        <div class="login-subtitle">Вхід до системи</div>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <form class="login-form" @submit.prevent="submit">
        <label>
          <span>Логін</span>
          <input v-model="form.login" type="text" placeholder="Введіть логін" />
        </label>

        <label>
          <span>Пароль</span>
          <input v-model="form.password" type="password" placeholder="Введіть пароль" />
        </label>

        <button type="submit" class="primary-button" :disabled="submitting">
          {{ submitting ? 'Вхід...' : 'Увійти' }}
        </button>
      </form>

      <div class="demo-box">
        <div class="demo-label">Тестовий доступ:</div>
        <div>Логін: <strong>admin</strong></div>
        <div>Пароль: <strong>Admin123!</strong></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.22), transparent 30%),
    linear-gradient(135deg, #f8fbff 0%, #eef4ff 46%, #f5f3ff 100%);
  padding: 24px;
}

.login-card {
  width: min(440px, 100%);
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 26px;
  padding: 32px 28px 24px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(10px);
}

.login-header {
  text-align: center;
  margin-bottom: 22px;
}

.login-title {
  font-size: 1.8rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.03em;
}

.login-subtitle {
  margin-top: 6px;
  color: #64748b;
  font-size: 0.95rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-form label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
}

.login-form input {
  border: 1px solid #dbe3f0;
  background: #f8fafc;
  padding: 12px 14px;
  border-radius: 12px;
  font: inherit;
  color: #0f172a;
  transition: 0.2s ease;
}

.login-form input:focus {
  outline: none;
  border-color: #60a5fa;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
}

.primary-button {
  appearance: none;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: white;
  font: inherit;
  font-weight: 700;
  padding: 13px 16px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.24);
}

.primary-button:hover {
  transform: translateY(-1px);
}

.error-message {
  background: #fff1f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 11px 12px;
  margin-bottom: 18px;
  font-size: 0.92rem;
}

.demo-box {
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f8fafc, #eef2ff);
  border: 1px solid #e2e8f0;
  color: #475569;
  line-height: 1.7;
  font-size: 0.92rem;
}

.demo-label {
  font-weight: 700;
  margin-bottom: 4px;
  color: #334155;
}
</style>
