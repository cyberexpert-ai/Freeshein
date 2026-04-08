require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cfg = require('./config');
const db = require('./database/database');
const logger = require('./utils/logger');
const { authMiddleware, checkChannels, joinKeyboard } = require('./middlewares/auth');
const { showMain, mainKb } = require('./commands/user/menu');
const { showPanel } = require('./commands/admin/index');
const { handleCallback } = require('./handlers/callbackHandler');
const { handleMessage } = require('./handlers/messageHandler');
const { creditReferral } = require('./commands/user/refer');

app.get('/', (req, res) => res.status(200).send(`✅ ${cfg.BOT_NAME} Running`));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));

const bot = new Telegraf(cfg.BOT_TOKEN);
bot.catch((err, ctx) => logger.error(`Bot error: ${err.message}`));
bot.use(authMiddleware);

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const payload = ctx.startPayload || '';
  const referCode = payload.startsWith('ref_') ? payload.replace('ref_', '') : null;

  if (userId === cfg.ADMIN_ID) {
    try { await ctx.deleteMessage(); } catch(e) {}
    return showPanel(ctx);
  }

  const user = await db.getUser(userId);
  try { await ctx.deleteMessage(); } catch(e) {}

  // Store pending refer code
  if (referCode) await db.setPendingRefer(userId, referCode);

  // Check channels
  const { allJoined, notJoined } = await checkChannels(ctx);
  if (!allJoined) {
    const msg = await ctx.reply(
      `${cfg.BRAND_EMOJI} *Welcome to ${cfg.BOT_NAME}!*\n\n🎁 Earn free vouchers by referring friends!\n\n📢 Please join our channels to continue:`,
      { parse_mode: 'Markdown', reply_markup: joinKeyboard(notJoined) }
    );
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  await db.setChannelVerified(userId, true);

  // Credit referral if pending
  if (referCode && !user?.referred_by) {
    const referrer = await db.getUserByCode(referCode);
    if (referrer && referrer.telegram_id !== userId) {
      await creditReferral(ctx, referrer.telegram_id, userId);
    }
  } else if (user?.pending_refer_code && !user?.referred_by) {
    const referrer = await db.getUserByCode(user.pending_refer_code);
    if (referrer && referrer.telegram_id !== userId) {
      await creditReferral(ctx, referrer.telegram_id, userId);
    }
  }

  const isNew = !user?.is_channel_verified;
  const text = isNew
    ? `🎉 *Welcome to ${cfg.BOT_NAME}!*\n\n${cfg.BRAND_EMOJI} Earn free vouchers!\n\n👥 Refer friends → Earn points → Get vouchers!\n\n📌 Use menu below:`
    : `🏠 *Welcome back!*\n\n💰 Use the menu below:`;

  const msg = await ctx.reply(text, { parse_mode: 'Markdown', ...mainKb() });
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
});

bot.command('admin', async (ctx) => {
  if (ctx.from.id !== cfg.ADMIN_ID) return;
  try { await ctx.deleteMessage(); } catch(e) {}
  return showPanel(ctx);
});

bot.on('callback_query', handleCallback);
bot.on(['message', 'photo', 'voice', 'document'], handleMessage);

// Cron: auto-unblock every minute
cron.schedule('* * * * *', async () => {
  try {
    await db.query("UPDATE users SET is_temp_blocked=false,block_reason=null,block_until=null WHERE is_temp_blocked=true AND block_until<NOW()");
  } catch(e) {}
});

async function launch() {
  try {
    await db.initDatabase();
    logger.info('✅ DB initialized');
    const PORT = process.env.PORT || 3000;
    if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
      const path = `/bot${cfg.BOT_TOKEN}`;
      const url = `${process.env.WEBHOOK_URL}${path}`;
      app.use(bot.webhookCallback(path));
      await bot.telegram.setWebhook(url);
      logger.info(`✅ Webhook: ${url}`);
      app.listen(PORT, () => logger.info(`🚀 Port ${PORT}`));
    } else {
      await bot.telegram.deleteWebhook();
      app.listen(PORT, () => logger.info(`🚀 Port ${PORT}`));
      await bot.launch();
      logger.info('🤖 Polling');
    }
    try {
      await bot.telegram.sendMessage(cfg.ADMIN_ID, `✅ *${cfg.BOT_NAME} Started!*\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { parse_mode: 'Markdown' });
    } catch(e) {}
  } catch(err) {
    logger.error('Launch: ' + err.message);
    process.exit(1);
  }
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
launch();
