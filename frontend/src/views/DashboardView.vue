<template>
  <section class="dashboard">
    <div class="hero">
      <div><p class="eyebrow">Панель керування</p><h1>Головна</h1><p>Керуйте навчальними планами та контролюйте педагогічне навантаження в одному місці.</p></div>
      <div class="hero-mark">PED<span>·</span></div>
    </div>
    <p v-if="error" class="error">{{ error }}</p><div v-if="loading" class="loading">Завантаження статистики…</div>
    <template v-else>
      <div class="stats-grid">
        <article class="stat-card blue"><span class="icon">◉</span><div><small>Викладачі</small><strong>{{ stats.teachers }}</strong><em>у системі</em></div></article>
        <article class="stat-card purple"><span class="icon">▦</span><div><small>Студентські групи</small><strong>{{ stats.groups }}</strong><em>активних груп</em></div></article>
        <article class="stat-card orange"><span class="icon">▤</span><div><small>Елементи плану</small><strong>{{ stats.planItems }}</strong><em>дисциплін і практик</em></div></article>
        <article class="stat-card green"><span class="icon">✓</span><div><small>Підтверджено</small><strong>{{ stats.confirmed }}</strong><em>із {{ stats.commissionTeachers }} викладачів ЦК</em></div></article>
      </div>
      <div class="content-grid">
        <article class="panel readiness"><div class="panel-heading"><div><p class="eyebrow">Контроль готовності</p><h2>Навантаження ЦК</h2></div><strong>{{ confirmationPercent }}%</strong></div><div class="progress"><span :style="{ width: `${confirmationPercent}%` }"></span></div><p class="muted">{{ stats.confirmed }} викладачів підтвердили навантаження. {{ stats.commissionTeachers - stats.confirmed }} ще очікують перевірки голови ЦК.</p><button class="text-button" @click="go('/documents')">Переглянути статуси →</button></article>
        <article class="panel actions"><p class="eyebrow">Швидкий доступ</p><h2>Що потрібно зробити?</h2><button @click="go('/plans')"><span>＋</span><div><b>Перевірити робочі плани</b><small>Дисципліни, години та викладачі</small></div><i>→</i></button><button @click="go('/workload')"><span>◌</span><div><b>Відкрити навантаження</b><small>Редагування та підтвердження</small></div><i>→</i></button><button @click="go('/student-distribution')"><span>⇄</span><div><b>Розподілити студентів</b><small>Курсові, дипломи та комісії</small></div><i>→</i></button></article>
      </div>
      <article class="panel overview"><div class="panel-heading"><div><p class="eyebrow">Стан системи</p><h2>Все під контролем</h2></div><span class="live"><b></b> Система працює</span></div><div class="checks"><div><span class="check">✓</span><div><b>Імпорт даних</b><small>{{ stats.planItems ? 'Навчальний план завантажено' : 'Потрібно імпортувати план' }}</small></div></div><div><span class="check">✓</span><div><b>Викладачі</b><small>{{ stats.teachers }} записів доступно для роботи</small></div></div><div><span class="check">✓</span><div><b>Розподіли</b><small>Можна редагувати в окремому розділі</small></div></div></div></article>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'

const router = useRouter(); const loading = ref(true); const error = ref('')
const stats = reactive({ teachers: 0, groups: 0, planItems: 0, confirmed: 0, commissionTeachers: 0 })
const confirmationPercent = computed(() => stats.commissionTeachers ? Math.round(stats.confirmed / stats.commissionTeachers * 100) : 0)
const go = path => router.push(path)
onMounted(async () => {
  try {
    const [teachers, groups, plans, status] = await Promise.all([api.get('/teachers'), api.get('/groups'), api.get('/plans'), api.get('/workload/status')])
    stats.teachers = teachers.data.length; stats.groups = groups.data.length
    stats.planItems = Array.isArray(plans.data) ? plans.data.reduce((total, plan) => total + (plan.items?.length || 0), 0) : 0
    stats.commissionTeachers = status.data.length; stats.confirmed = status.data.filter(teacher => teacher.has_workload).length
  } catch (e) { error.value = e.response?.data?.message || 'Не вдалося завантажити статистику.' } finally { loading.value = false }
})
</script>

<style scoped>
.dashboard{max-width:1240px;margin:0 auto}.hero{display:flex;justify-content:space-between;align-items:center;padding:30px 34px;border-radius:20px;color:#fff;background:linear-gradient(125deg,#172554,#2563eb 58%,#38bdf8);box-shadow:0 14px 35px #1d4ed833}.hero h1{margin:2px 0 8px;font-size:34px}.hero p:not(.eyebrow){margin:0;color:#dbeafe}.eyebrow{margin:0 0 7px;color:#64748b;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hero .eyebrow{color:#bfdbfe}.hero-mark{font-size:54px;font-weight:900;letter-spacing:-.08em}.hero-mark span{color:#67e8f9}.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:22px 0}.stat-card{display:flex;gap:15px;align-items:center;padding:20px;border:1px solid #e5e7eb;border-radius:15px;background:#fff}.stat-card .icon{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;font-size:22px;font-weight:800}.stat-card small,.stat-card strong,.stat-card em{display:block}.stat-card small{color:#64748b}.stat-card strong{margin:2px 0;font-size:28px}.stat-card em{color:#94a3b8;font-size:11px;font-style:normal}.blue .icon{background:#dbeafe;color:#2563eb}.purple .icon{background:#ede9fe;color:#7c3aed}.orange .icon{background:#ffedd5;color:#ea580c}.green .icon{background:#dcfce7;color:#16a34a}.content-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px}.panel{padding:24px;border:1px solid #e5e7eb;border-radius:16px;background:#fff}.panel h2{margin:0;font-size:20px;color:#172033}.panel-heading{display:flex;justify-content:space-between;align-items:flex-start}.panel-heading>strong{color:#2563eb;font-size:30px}.progress{height:10px;margin:25px 0 14px;overflow:hidden;border-radius:99px;background:#e2e8f0}.progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#2563eb,#22c55e);transition:width .5s}.muted{color:#64748b;line-height:1.5}.text-button{padding:0;border:0;color:#2563eb;background:none;font-weight:700;cursor:pointer}.actions button{display:flex;align-items:center;width:100%;gap:12px;padding:13px 0;border:0;border-bottom:1px solid #eef2f6;color:#172033;background:none;text-align:left;cursor:pointer}.actions button:last-child{border-bottom:0}.actions button>span{display:grid;place-items:center;width:31px;height:31px;border-radius:9px;color:#2563eb;background:#eff6ff;font-size:20px}.actions button div{flex:1}.actions b,.actions small{display:block}.actions small{margin-top:3px;color:#94a3b8}.actions i{color:#94a3b8;font-size:18px}.overview{margin-top:18px}.live{color:#15803d;font-size:13px}.live b{display:inline-block;width:8px;height:8px;margin-right:5px;border-radius:50%;background:#22c55e}.checks{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin-top:22px}.checks>div{display:flex;gap:10px;align-items:flex-start}.check{color:#16a34a;font-weight:900}.checks b,.checks small{display:block}.checks small{margin-top:4px;color:#94a3b8;font-size:12px}.loading,.error{margin-top:20px}.error{color:#b42318}@media(max-width:850px){.stats-grid{grid-template-columns:repeat(2,1fr)}.content-grid,.checks{grid-template-columns:1fr}.hero-mark{display:none}}@media(max-width:500px){.stats-grid{grid-template-columns:1fr}.hero{padding:24px}}
</style>
