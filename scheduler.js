const cron = require('node-cron')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const db = require('./db')

dayjs.extend(utc)
dayjs.extend(timezone)

module.exports = function (bot) {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date()

      // Lock rows to prevent double sending
      const res = await db.query(
        `
        UPDATE event_reminders r
        SET sent = TRUE
        FROM events e
        LEFT JOIN users u ON e.user_id = u.id
        WHERE r.event_id = e.id
          AND r.sent = FALSE
          AND r.remind_at <= $1
        RETURNING r.id as reminder_id,
                  r.remind_at,
                  e.name,
                  e.event_time,
                  e.chat_id,
                  u.timezone
        `,
        [now]
      )

      for (const row of res.rows) {
        const tz = row.timezone || 'UTC'
        const eventTimeLocal = dayjs(row.event_time).tz(tz)

        try {
          await bot.telegram.sendMessage(
            row.chat_id,
            `⏰ Reminder!\nEvent: ${row.name}\nTime: ${eventTimeLocal.format('YYYY-MM-DD hh:mm A')} (${tz})`
          )
        } catch (e) {
          console.error('Failed to send reminder', e)
        }
      }
    } catch (err) {
      console.error('Scheduler error', err)
    }
  })
}