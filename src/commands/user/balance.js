const db = require('../../database/database');
const { safeDelete, formatDate, fmtPts } = require('../../utils/helpers');
const { mainKb } = require('./menu');

async function showBalance(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const user = await db.getUser(userId);
  const txs = await db.getTransactions(userId, 5);
  let txText = '';
  if (txs.length) {
    txText = '\n\n📊 *Recent:*\n' + txs.map(t => `${t.points>0?'🟢 +':'🔴 '}${fmtPts(t.points)} — ${t.description}`).join('\n');
  }
  const msg = await ctx.reply(
    `💰 *Your Balance*${user?.is_vip?' 👑':''}\n\n━━━━━━━━━━━━━━━━━\n💰 Balance: *${fmtPts(user?.points)} pts*\n📈 Total Earned: *${fmtPts(user?.total_earned)} pts*\n📤 Total Withdrawn: *${fmtPts(user?.total_withdrawn)} pts*\n👥 Total Referrals: *${user?.total_referrals||0}*\n📅 Joined: ${formatDate(user?.joined_at)}\n━━━━━━━━━━━━━━━━━${txText}`,
    { parse_mode:'Markdown', reply_markup:{ remove_keyboard:true, inline_keyboard:[
      [{ text:'📊 Full History', callback_data:'bal_history' }],
      [{ text:'🔙 Back', callback_data:'back_main' }]
    ]}}
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showHistory(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const txs = await db.getTransactions(userId, 20);
  let text = `📊 *Point History* (last 20)\n\n━━━━━━━━━━━━━━━━━\n`;
  if (!txs.length) text += '_No transactions yet._';
  else text += txs.map(t => `${t.points>0?'🟢 +':'🔴 '}${fmtPts(t.points)} — ${t.description}\n_${formatDate(t.created_at)}_`).join('\n\n');
  const msg = await ctx.reply(text, { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{ text:'🔙 Back', callback_data:'show_balance' }]] }});
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}
module.exports = { showBalance, showHistory };
