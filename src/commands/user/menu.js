const { Markup } = require('telegraf');
const db = require('../../database/database');
const { safeDelete } = require('../../utils/helpers');

function mainKb() {
  return Markup.keyboard([
    ['💰 Balance', '👥 Refer & Earn'],
    ['🎁 Withdraw']
  ]).resize().persistent();
}

async function showMain(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const user = await db.getUser(userId);
  const vip = user?.is_vip ? ' 👑' : '';
  const msg = await ctx.reply(
    `🏠 *Main Menu*${vip}\n\n💰 Balance: *${parseFloat(user?.points||0).toFixed(0)} pts*\n\n📌 Choose an option:`,
    { parse_mode: 'Markdown', ...mainKb() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}
module.exports = { mainKb, showMain };
