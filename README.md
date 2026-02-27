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

## Deploy to Railway

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
   - Never commit `.env`. Use `.env.example` as a template; real values go in Railway Variables (or locally in `.env` only).

---

## Usage

- **In a group:** An admin sends `/start` → bot replies with a link to open the bot in private chat.
- **In private chat:** User follows the link (or starts the bot), sets timezone (dropdown or `/settimezone Continent/City`), then uses **Add Event** and sends:
  `EventName | YYYY-MM-DD HH:mm | 01:30,00:15`  
  (reminders 1h30m and 15m before; you can also use plain minutes like `90,15`).
- Reminders are sent into the **linked group** at the scheduled times.

## License

ISC
