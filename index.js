require('dotenv').config()
const express = require('express')
const app = express()

const PORT = process.env.PORT || 3000

app.get('/', (req, res) => {
    res.send('Bot running 🚀')
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

const { Telegraf } = require('telegraf')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const scheduler = require('./scheduler')
const db = require('./db')


dayjs.extend(utc)
dayjs.extend(timezone)

const token = process.env.BOT_TOKEN
if (!token) {
  console.error('Missing BOT_TOKEN. Put it in .env as BOT_TOKEN=...')
  process.exit(1)
}

// ✅ FIRST create bot
const bot = new Telegraf(token)

const ADMINS = (process.env.ADMINS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean)

// In-memory mapping from user -> selected target chat (typically a group)
const userTargetChats = new Map()

async function isAdminInCurrentChat(ctx, telegramId) {
  const inEnvAdmins = ADMINS.includes(String(telegramId))
  let isAdminByChat = false

  try {
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, telegramId)
      if (member && (member.status === 'creator' || member.status === 'administrator')) {
        isAdminByChat = true
      }
    }
  } catch (e) {
    console.error('getChatMember failed', e)
  }

  return inEnvAdmins || isAdminByChat
}

function getTargetChatId(ctx) {
  if (!ctx.chat || !ctx.from) return null

  if (ctx.chat.type === 'private') {
    const stored = userTargetChats.get(ctx.from.id)
    return stored ?? ctx.chat.id
  }

  return ctx.chat.id
}

async function getOrCreateUser(ctx) {
  const tgId = ctx.from.id
  const username = ctx.from.username || null
  const res = await db.query(
    'SELECT * FROM users WHERE telegram_id = $1',
    [tgId]
  )
  if (res.rows.length > 0) {
    const user = res.rows[0]
    // Only recompute admin status when we are actually in the group/supergroup
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      const shouldBeAdmin = await isAdminInCurrentChat(ctx, tgId)
      if (shouldBeAdmin !== user.is_admin) {
        const updated = await db.query(
          'UPDATE users SET is_admin = $1 WHERE id = $2 RETURNING *',
          [shouldBeAdmin, user.id]
        )
        return updated.rows[0]
      }
    }
    return user
  }

  let isAdmin
  if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
    // In group context, use live chat admin rights + ADMINS override
    isAdmin = await isAdminInCurrentChat(ctx, tgId)
  } else {
    // In private or other contexts, fall back to ADMINS only
    isAdmin = ADMINS.includes(String(tgId))
  }
  const insert = await db.query(
    'INSERT INTO users (telegram_id, username, is_admin) VALUES ($1, $2, $3) RETURNING *',
    [tgId, username, isAdmin]
  )
  return insert.rows[0]
}

function requireAdmin(user, ctx) {
  if (!user.is_admin) {
    ctx.reply('❌ Only admins can perform this action.')
    return false
  }
  return true
}

bot.start((ctx) => {
  const text = ctx.message?.text || ''
  const parts = text.split(' ')
  const payload = parts.length > 1 ? parts.slice(1).join(' ') : ''

  // Private chat deep link: /start group_<chatId>
  if (ctx.chat && ctx.chat.type === 'private' && payload.startsWith('group_')) {
    const rawId = payload.slice('group_'.length)
    const numericId = Number(rawId)
    if (Number.isFinite(numericId)) {
      userTargetChats.set(ctx.from.id, numericId)
      ctx.reply('✅ Linked to your group. Reminders you create here will be posted in that group.')
    } else {
      ctx.reply('❌ Could not understand the group link payload. Please try again from the group.')
    }
  }

  // If called inside a group/supergroup, direct admins to private chat
  if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
    ;(async () => {
      const user = await getOrCreateUser(ctx)
      const isAdmin = await isAdminInCurrentChat(ctx, ctx.from.id)
      if (!isAdmin) {
        return ctx.reply('👋 Hi! Only group admins can configure reminders. Please ask an admin to use me.')
      }

      const botUsername = process.env.BOT_USERNAME
      if (!botUsername) {
        return ctx.reply('To configure reminders, please DM this bot directly. (Owner: set BOT_USERNAME in .env to enable deep links.)')
      }

      const link = `https://t.me/${botUsername}?start=group_${ctx.chat.id}`
      ctx.reply(
        '👋 Hi admin! To configure reminders for this group, click this link to talk to me in private chat:\n' +
        link +
        '\nThen set timezone and create reminders there. I will only post reminders back into this group.'
      )
    })().catch(err => {
      console.error(err)
      ctx.reply('❌ Failed to prepare private chat link. Please try again.')
    })
    return
  }

  // Default private-chat start: show main menu
  ctx.reply(
    "👋 Welcome! Use the buttons below to manage events.\nReminders will be sent to your linked group (or here if none is linked).",
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '➕ Add Event', callback_data: 'ADD_EVENT' },
            { text: '📋 View Events', callback_data: 'VIEW_EVENTS' },
          ],
          [
            { text: '🗑 Delete Event', callback_data: 'DELETE_EVENT' },
            { text: '🌍 Set Timezone', callback_data: 'SET_TIMEZONE' },
          ],
        ],
      },
    }
  )
})

bot.command('createevent', (ctx) => {
  ctx.reply("Send event in this format:\nEventName | YYYY-MM-DD HH:mm | Reminder offset(s) before event (e.g. 01:30,00:10 or 90)")
})

bot.on('text', (ctx) => {
  if (!ctx.message.text.includes('|')) return

  const [name, datetime, reminderField] =
    ctx.message.text.split('|').map(t => t.trim())

  const eventTime = dayjs(datetime)

  function parseOffset(token) {
    const value = token.trim()
    if (!value) return null

    if (value.includes(':')) {
      const [hStr, mStr] = value.split(':')
      const h = Number.parseInt(hStr, 10)
      const m = Number.parseInt(mStr, 10)
      if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) return null
      return h * 60 + m
    }

    const minutes = Number.parseInt(value, 10)
    if (!Number.isFinite(minutes) || minutes < 0) return null
    return minutes
  }

  const reminderParts = reminderField.split(',').map(t => t.trim()).filter(Boolean)
  const reminderMinutesList = reminderParts.map(parseOffset)

  if (!eventTime.isValid()) {
    return ctx.reply("❌ Invalid date format.")
  }

  if (!reminderMinutesList.length || reminderMinutesList.some(n => n === null)) {
    return ctx.reply("❌ Reminder offsets must be non‑negative and in minutes (e.g. 90) or HH:MM format (e.g. 01:30), comma‑separated for multiple.")
  }

  ;(async () => {
    const user = await getOrCreateUser(ctx)
    if (!requireAdmin(user, ctx)) return

    const targetChatId = getTargetChatId(ctx)
    if (targetChatId == null) {
      return ctx.reply('❌ Could not determine which chat to schedule this reminder for. Try /start again.')
    }

    const tz = user.timezone || 'UTC'
    const eventLocal = dayjs.tz ? dayjs.tz(datetime, tz) : eventTime
    const eventUtc = eventLocal.isValid() ? eventLocal.toDate() : eventTime.toDate()

    const insertEvent = await db.query(
      'INSERT INTO events (user_id, chat_id, name, event_time) VALUES ($1, $2, $3, $4) RETURNING *',
      [user.id, targetChatId, name, eventUtc]
    )

    const eventId = insertEvent.rows[0].id

    for (const minutes of reminderMinutesList) {
      const remindAt = dayjs(eventUtc).subtract(minutes, 'minute').toDate()
      await db.query(
        'INSERT INTO event_reminders (event_id, remind_at) VALUES ($1, $2)',
        [eventId, remindAt]
      )
    }

    ctx.reply(`✅ Event "${name}" created with ${reminderMinutesList.length} reminder(s)!`)
  })().catch(err => {
    console.error(err)
    ctx.reply('❌ Failed to create event. Please try again.')
  })
})

const TIMEZONE_OPTIONS = [
  { label: 'UTC', value: 'UTC' },
  { label: 'Europe/Berlin', value: 'Europe/Berlin' },
  { label: 'Europe/London', value: 'Europe/London' },
  { label: 'Africa/Accra', value: 'Africa/Accra' },
  { label: 'Africa/Nairobi', value: 'Africa/Nairobi' },
  { label: 'Asia/Singapore', value: 'Asia/Singapore' },
  { label: 'Asia/Jakarta', value: 'Asia/Jakarta' },
  { label: 'America/New_York', value: 'America/New_York' },
  { label: 'America/Los_Angeles', value: 'America/Los_Angeles' },
]

function timezoneKeyboard() {
  const rows = []
  for (let i = 0; i < TIMEZONE_OPTIONS.length; i += 2) {
    const row = []
    for (let j = i; j < i + 2 && j < TIMEZONE_OPTIONS.length; j++) {
      const opt = TIMEZONE_OPTIONS[j]
      row.push({
        text: opt.label,
        callback_data: `SET_TZ_${opt.value}`,
      })
    }
    rows.push(row)
  }
  return { inline_keyboard: rows }
}

async function applyTimezone(ctx, tz) {
  try {
    if (!dayjs.tz) throw new Error('Timezone plugin not available')
    const test = dayjs().tz(tz)
    if (!test || !test.isValid()) {
      return ctx.reply('❌ Invalid timezone. Use IANA format like Europe/Berlin.')
    }

    const user = await getOrCreateUser(ctx)
    await db.query('UPDATE users SET timezone = $1 WHERE id = $2', [tz, user.id])
    return ctx.reply(`✅ Timezone updated to ${tz}`)
  } catch (e) {
    console.error(e)
    return ctx.reply('❌ Could not set timezone. Make sure it is a valid IANA timezone like Europe/Berlin.')
  }
}

bot.command('settimezone', (ctx) => {
  const parts = ctx.message.text.split(' ').filter(Boolean)
  if (parts.length < 2) {
    return ctx.reply(
      'Choose your timezone from the options below or send it manually like /settimezone Europe/Berlin',
      { reply_markup: timezoneKeyboard() }
    )
  }
  const tz = parts[parts.length - 1]
  ;(async () => {
    await applyTimezone(ctx, tz)
  })()
})

// Inline handlers
bot.action('ADD_EVENT', (ctx) => {
  ctx.answerCbQuery()
  ctx.reply("Send event in this format:\nEventName | YYYY-MM-DD HH:mm | Reminder offset(s) before event (e.g. 01:30,00:10 or 90; comma-separated for multiple)")
})

bot.action('VIEW_EVENTS', (ctx) => {
  ctx.answerCbQuery()
  ;(async () => {
    const user = await getOrCreateUser(ctx)
    const targetChatId = getTargetChatId(ctx)
    if (targetChatId == null) {
      return ctx.reply('❌ Could not determine which chat to show events for. Try /start again.')
    }
    const res = await db.query(
      'SELECT e.id, e.name, e.event_time FROM events e WHERE e.chat_id = $1 ORDER BY e.event_time ASC LIMIT 10',
      [targetChatId]
    )
    if (!res.rows.length) {
      return ctx.reply('No upcoming events.')
    }
    const tz = user.timezone || 'UTC'
    const lines = res.rows.map(e => {
      const dt = dayjs(e.event_time).tz ? dayjs(e.event_time).tz(tz) : dayjs(e.event_time)
      return `#${e.id} • ${e.name} • ${dt.format('YYYY-MM-DD hh:mm A')} (${tz})`
    })
    ctx.reply(lines.join('\n'))
  })().catch(err => {
    console.error(err)
    ctx.reply('❌ Failed to load events.')
  })
})

bot.action('DELETE_EVENT', (ctx) => {
  ctx.answerCbQuery()
  ;(async () => {
    const user = await getOrCreateUser(ctx)
    if (!requireAdmin(user, ctx)) return

    const targetChatId = getTargetChatId(ctx)
    if (targetChatId == null) {
      return ctx.reply('❌ Could not determine which chat to delete events from. Try /start again.')
    }

    const res = await db.query(
      'SELECT id, name FROM events WHERE chat_id = $1 ORDER BY event_time ASC LIMIT 10',
      [targetChatId]
    )
    if (!res.rows.length) {
      return ctx.reply('No events to delete.')
    }

    ctx.reply('Select an event to delete:', {
      reply_markup: {
        inline_keyboard: res.rows.map(e => [{
          text: `🗑 ${e.name} (#${e.id})`,
          callback_data: `DELETE_EVENT_${e.id}`,
        }]),
      },
    })
  })().catch(err => {
    console.error(err)
    ctx.reply('❌ Failed to load events for deletion.')
  })
})

bot.action(/DELETE_EVENT_(\d+)/, (ctx) => {
  ctx.answerCbQuery()
  const match = ctx.match
  const id = Number.parseInt(match[1], 10)
  if (!Number.isFinite(id)) return

  ;(async () => {
    const user = await getOrCreateUser(ctx)
    if (!requireAdmin(user, ctx)) return

    const targetChatId = getTargetChatId(ctx)
    if (targetChatId == null) {
      return ctx.reply('❌ Could not determine which chat to delete events from. Try /start again.')
    }

    await db.query('DELETE FROM events WHERE id = $1 AND chat_id = $2', [id, targetChatId])
    ctx.reply(`✅ Event #${id} deleted.`)
  })().catch(err => {
    console.error(err)
    ctx.reply('❌ Failed to delete event.')
  })
})

bot.action('SET_TIMEZONE', (ctx) => {
  ctx.answerCbQuery()
  ctx.reply(
    'Choose your timezone from the options below or send it manually like /settimezone Europe/Berlin',
    { reply_markup: timezoneKeyboard() }
  )
})

bot.action(/SET_TZ_(.+)/, (ctx) => {
  ctx.answerCbQuery()
  const tz = ctx.match[1]
  ;(async () => {
    await applyTimezone(ctx, tz)
  })()
})


// ✅ AFTER bot is defined, then call scheduler
scheduler(bot)

bot.launch()