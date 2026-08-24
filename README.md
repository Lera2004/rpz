# RPZ

Система управління педагогічним навантаженням, групами, студентами та відомостями.

## Локальний запуск

1. Створіть `backend/.env` на основі `backend/.env.example`.
2. Підготуйте MySQL базу `ped` та вкажіть доступи у `.env`.
3. Запустіть backend:

```powershell
cd backend
npm install
npm start
```

4. В іншому терміналі запустіть frontend:

```powershell
cd frontend
npm install
npm run dev
```

Frontend використовує `VITE_API_URL` для адреси backend і за замовчуванням звертається до `http://localhost:3000/api`.

## Розгортання

GitHub зберігає код, але не запускає Node.js/MySQL застосунок і не є хостингом бази даних. Для роботи онлайн потрібні окремі hosting-сервіси для frontend, backend і MySQL. На backend потрібно встановити змінні `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `PORT`, `TELEGRAM_BOT_TOKEN`, `PUBLIC_API_URL`; на frontend — `VITE_API_URL`.

Файл `backend/.env` навмисно не додається до Git. Секрети потрібно створювати у налаштуваннях hosting-сервісу.

### Безкоштовне розгортання (рекомендовано)

1. Завантажте проект на GitHub.
2. Backend розмістіть на Render:
   - New > Web Service
   - оберіть GitHub repo
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - у Environment Variables задайте `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `PORT`, `TELEGRAM_BOT_TOKEN`, `PUBLIC_API_URL` (URL backend, наприклад `https://ped-backend.onrender.com`) та `APP_URL`/`BACKEND_PUBLIC_URL`.
3. Frontend розмістіть на Vercel або Netlify:
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
   - у Environment Variables задайте `VITE_API_URL=https://<backend-url>/api`
4. Базу даних створіть у Railway / PlanetScale / Clever Cloud (безкоштовний MySQL план або безкоштовний trial):
   - збережіть хост, логін, пароль, назву бази та порт
   - імпортуйте дамп MySQL або перенесіть дані із локальної бази
5. Telegram-бот запускається разом з backend, тому токен бота та `PUBLIC_API_URL` повинні бути вказані у backend-середовищі.

Файл `render.yaml` у корені проекту містить базову конфігурацію для Render. Для Vercel/Netlify також потрібен `VITE_API_URL` з URL продакшн backend.

## База даних

Поточна база працює у локальному MySQL. У репозиторії немає SQL-дампа, тому для online-розгортання потрібно створити віддалену MySQL базу та перенести дані окремим дампом.