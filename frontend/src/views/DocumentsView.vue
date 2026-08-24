<template>
  <section>
    <h1>Документи</h1>
    <p>Наявність педагогічного навантаження викладачів ЦК «Інженерія програмного забезпечення».</p>
    <p v-if="loading">Завантаження...</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <div v-else class="status-card">
      <div class="status-summary">
        <strong>Всього викладачів: {{ teachers.length }}</strong>
        <span class="has">Підтверджено: {{ teachersWithWorkload }}</span>
        <span class="missing">Не підтверджено: {{ teachersWithoutWorkload }}</span>
      </div>
      <table>
        <thead><tr><th>№</th><th>Викладач</th><th>Статус підтвердження</th><th>Рядків навантаження</th><th>Планові години</th><th>Дія</th></tr></thead>
        <tbody>
          <tr v-for="(teacher, index) in teachers" :key="teacher.id">
            <td>{{ index + 1 }}</td><td>{{ teacher.full_name }}</td>
            <td><span :class="['badge', teacher.has_workload ? 'badge-has' : 'badge-missing']">{{ teacher.has_workload ? 'Підтверджено' : 'Не підтверджено' }}</span></td>
            <td>{{ teacher.workload_rows }}</td><td>{{ format(teacher.planned_hours) }}</td>
            <td><button type="button" @click="openWorkload(teacher.id)">Переглянути</button></td>
          </tr>
          <tr v-if="!teachers.length"><td colspan="6">Викладачів у цій ЦК не знайдено.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'

const router = useRouter()
const teachers = ref([])
const loading = ref(true)
const error = ref('')
const format = value => Number(value || 0).toLocaleString('uk-UA', { maximumFractionDigits: 2 })
const teachersWithWorkload = computed(() => teachers.value.filter(teacher => teacher.has_workload).length)
const teachersWithoutWorkload = computed(() => teachers.value.length - teachersWithWorkload.value)
const openWorkload = id => router.push({ name: 'workload', query: { teacher_id: id } })

onMounted(async () => {
  try { teachers.value = (await api.get('/workload/status')).data } catch (e) { error.value = e.response?.data?.message || 'Не вдалося завантажити статус навантаження.' } finally { loading.value = false }
})
</script>

<style scoped>
section { max-width: 1200px; }
.status-card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; }
.status-summary { display: flex; gap: 22px; flex-wrap: wrap; margin-bottom: 18px; color: #475467; }
.has { color: #067647; }.missing { color: #b42318; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px 12px; border: 1px solid #e2e8f0; text-align: left; }
th { background: #f8fafc; }
.badge { display: inline-block; border-radius: 999px; padding: 4px 10px; font-size: 13px; font-weight: 600; }
.badge-has { background: #dcfae6; color: #067647; }.badge-missing { background: #fee4e2; color: #b42318; }
button { border: 0; border-radius: 6px; padding: 7px 11px; background: #2563eb; color: white; cursor: pointer; }
.error { color: #b42318; }
</style>