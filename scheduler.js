const cron = require('node-cron')
const fs = require('fs')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const db = require('./db')

dayjs.extend(utc)
dayjs.extend(timezone)

module.exports = function(bot) {
  cron.schedule('* * * * *', () => {
    ;(async () => {
      const now = new Date()
      const res = await db.query(
        `SELECT r.id as reminder_id, r.remind_at, e.id as event_id, e.name, e.event_time, e.chat_id, u.timezone
         FROM event_reminders r
         JOIN events e ON r.event_id = e.id
         LEFT JOIN users u ON e.user_id = u.id
         WHERE r.sent = FALSE AND r.remind_at <= $1
         ORDER BY r.remind_at ASC
         LIMIT 50`,
        [now]
      )

      for (const row of res.rows) {
        const tz = row.timezone || 'UTC'
        const eventTimeLocal = dayjs(row.event_time).tz ? dayjs(row.event_time).tz(tz) : dayjs(row.event_time)
        try {
          await bot.telegram.sendMessage(
            row.chat_id,
            `⏰ Reminder!\nEvent: ${row.name}\nTime: ${eventTimeLocal.format('YYYY-MM-DD hh:mm A')} (${tz})`
          )
          await db.query('UPDATE event_reminders SET sent = TRUE WHERE id = $1', [row.reminder_id])
        } catch (e) {
          console.error('Failed to send reminder', e)
        }
      }
    })().catch(err => {
      console.error('Scheduler error', err)
    })
  })
}
