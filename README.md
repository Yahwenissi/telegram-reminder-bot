# Telegram Reminder Bot

A Telegram bot that lets group admins create reminders in private chat; reminders are posted back to the linked group. Features timezone support, multiple reminders per event (hours+minutes or minutes), and PostgreSQL storage.

## Local setup

1. **Clone and install**
   ```bash
   git clone <your-repo-url>
   cd telegram-reminder-bot
   npm install
   ```

2. **Environment**
   - Copy `.env.example` to `.env`
   - Set `BOT_TOKEN` (from [@BotFather](https://t.me/BotFather)), `BOT_USERNAME`, and `DATABASE_URL`

3. **Database**
   - Create a PostgreSQL database and run the schema:
   ```bash
   psql "$DATABASE_URL" -f db-schema.sql
   ```

4. **Run**
   ```bash
   npm start
   ```

---

## Deploy for free (Railway is paid)

Railway no longer has a free tier. Here are **free alternatives** that keep your bot running 24/7.

### Deploy to Fly.io (recommended, free tier)

**Free:** $5/month credit that renews; enough for one app + small Postgres. **Always on**, no spin-down.

1. **Install Fly CLI**
   - **Windows (PowerShell):** `powershell -Command "irm https://fly.io/install.ps1 -useb | iex"`
   - **macOS/Linux:** `curl -L https://fly.io/install.sh | sh`
   - Restart your terminal, then run: `fly version`

2. **Sign up / log in**
   ```bash
   fly auth signup
   ```
   (Or `fly auth login` if you already have an account.)

3. **Launch the app (from the `telegram-reminder-bot` folder)**
   ```bash
   cd telegram-reminder-bot
   fly launch --no-deploy --copy-config
   ```
   - When prompted for an **app name**, accept the default or enter one (e.g. `telegram-reminder-bot`).
   - Choose a **region** (e.g. `Frankfurt` or `New York`).
   - When asked **"Would you like to set up a Postgres database?"** say **No** (we’ll add it in the dashboard for the free tier).

4. **Create a Postgres database**
   - Open [Fly.io Dashboard](https://fly.io/dashboard) → **Create app** → **Postgres**.
   - Name it (e.g. `telegram-reminder-bot-db`), choose the same region as your app, create it.
   - Open the new Postgres app → **Connect** (or **Info**) and copy the **connection string** (e.g. `postgres://postgres:xxx@xxx.flycast:5432`).

5. **Attach Postgres to your bot app and set secrets**
   - In the dashboard, open your **bot app** (the one you created with `fly launch`), then **Secrets**.
   - Set:
     - `DATABASE_URL` = the Postgres connection string you copied.
     - `BOT_TOKEN` = your Telegram bot token from BotFather.
     - `BOT_USERNAME` = your bot username without `@`.
   - Or from the terminal (replace values):
     ```bash
     fly secrets set DATABASE_URL="postgres://postgres:PASSWORD@HOST.flycast:5432" BOT_TOKEN="your_bot_token" BOT_USERNAME="YourBotUsername"
     ```

6. **Run the database schema once**
   - Using the same `DATABASE_URL`:
     ```bash
     psql "postgres://postgres:PASSWORD@HOST.flycast:5432" -f db-schema.sql
     ```
   - Or in the Fly dashboard: Postgres app → **Data** / **Connect** and run the SQL from `db-schema.sql`.

7. **Deploy**
   ```bash
   fly deploy
   ```

8. **Check that the bot is running**
   ```bash
   fly logs
   ```
   You should see the bot start and no Postgres errors. The bot runs 24/7.

### Option B: Render (free) + Neon (free Postgres)

- **Render** free web services **spin down after 15 minutes** of no traffic. Your bot doesn’t receive HTTP traffic, so it will sleep unless you add a tiny HTTP server and ping it (e.g. [UptimeRobot](https://uptimerobot.com) every 10 minutes).
- **Neon** (or [Supabase](https://supabase.com)) gives you a **free Postgres** database; use its connection string as `DATABASE_URL`.
- **Steps (high level):** Create a Neon project and get `DATABASE_URL`. In Render, **New → Web Service**, connect your GitHub repo, set **Build** to `npm install`, **Start** to `node index.js`, add env vars (`BOT_TOKEN`, `BOT_USERNAME`, `DATABASE_URL`). Run `db-schema.sql` in Neon’s SQL editor. To reduce spin-down, you can add a minimal Express server that responds to GET `/` and ping that URL every 10 min with UptimeRobot (optional).

### Option C: JustRunMy.App

- Free tier: small CPU/RAM, **always-on**, no spin-down. Supports Node.js and deploy from Git.
- Create a free Postgres elsewhere (e.g. Neon) and set `DATABASE_URL` in the app’s environment. Deploy your repo and run the schema in Neon.

---

## Deploy to Railway (paid)

1. **Push to GitHub** (see below) so Railway can connect the repo.

2. **Create a Railway project**
   - Go to [railway.app](https://railway.app) and sign in (GitHub is fine).
   - **New Project** → **Deploy from GitHub repo** → select your repo.
   - If the bot lives in a subfolder (e.g. `telegram-reminder-bot`), set **Root Directory** in the service **Settings** to that folder.

3. **Add PostgreSQL**
   - In the project: **+ New** → **Database** → **PostgreSQL**.
   - Railway will set `DATABASE_URL` automatically for your service.

4. **Configure variables**
   - Open your **service** → **Variables** and add:
     - `BOT_TOKEN` – your bot token from BotFather
     - `BOT_USERNAME` – bot username without `@`
     - (Optional) `ADMINS` – comma-separated Telegram user IDs
   - Do **not** commit `.env`; use Railway’s Variables only.

5. **Run database migrations once**
   - In **Postgres** service: **Data** or **Connect** to get the connection URL.
   - Locally run: `psql "<paste DATABASE_URL>" -f db-schema.sql`  
   - Or use Railway’s **Query** tab and paste the contents of `db-schema.sql`.

6. **Deploy**
   - The app is a **worker** (no HTTP server). Railway will use the `Procfile` (`worker: node index.js`) or the **Start Command** in **Settings** (e.g. `node index.js`).
   - If deployments use “web” by default and fail, set **Start Command** to `node index.js` in the service Settings.

7. **Check logs**
   - **Deployments** → select a deployment → **View Logs** to confirm the bot starts and connects to Postgres.

---

## Push to GitHub

1. **Create a repo on GitHub**
   - GitHub → **New repository** (e.g. `telegram-reminder-bot`). Do not add a README if this folder already has one.

2. **From your project folder** (e.g. `telegram-reminder-bot`):
   ```bash
   git init
   git add .
   git status   # ensure .env is not listed (it’s in .gitignore)
   git commit -m "Initial commit: Telegram reminder bot"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

3. **Secrets**
   - Never commit `.env`. Use `.env.example` as a template; real values go in your host’s environment (Fly.io secrets, Render/Railway Variables, etc.) or only in local `.env`.

---

## Usage

- **In a group:** An admin sends `/start` → bot replies with a link to open the bot in private chat.
- **In private chat:** User follows the link (or starts the bot), sets timezone (dropdown or `/settimezone Continent/City`), then uses **Add Event** and sends:
  `EventName | YYYY-MM-DD HH:mm | 01:30,00:15`  
  (reminders 1h30m and 15m before; you can also use plain minutes like `90,15`).
- Reminders are sent into the **linked group** at the scheduled times.

## License

ISC
