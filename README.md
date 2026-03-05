# Telegram Reminder Bot

A production-ready Telegram bot that allows group admins to create scheduled reminders in private chat and automatically post them back to their group.

Built with:

- Node.js
- Telegraf
- PostgreSQL (Neon)
- Render (hosting)
- Express (keep-alive server)
- node-cron scheduler

---

# 🚀 Features

### ✅ Admin-Only Controls
Only group admins can configure reminders.

### ✅ Private Chat Configuration
Admins configure reminders in private chat.
Reminders are automatically sent to the linked group.

### ✅ Multiple Reminders Per Event
Supports:
- Minutes: `90`
- Hours & Minutes: `01:30`
- Multiple reminders: `01:30,00:15`

### ✅ Timezone Support
Users can set timezone using:
- Inline buttons
- `/settimezone Europe/Berlin`

Stored per user in database.

### ✅ PostgreSQL Storage
All data stored in Neon PostgreSQL:
- Users
- Events
- Multiple reminders per event
- Sent tracking

No file-based storage.

### ✅ Production-Safe Scheduler
- Runs every minute
- Uses atomic UPDATE ... RETURNING
- Prevents duplicate reminders
- Handles crashes safely

### ✅ 24/7 Hosting
- Deployed on Render
- Prevent sleep via UptimeRobot
- Express keep-alive endpoint included

---

# 🗂 Project Structure
