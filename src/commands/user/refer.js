const db = require('../../database/database');
const cfg = require('../../config');
const { safeDelete, formatDate, fmtPts, getUserName } = require('../../utils/helpers');

async function showRefer(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const user = await db.getUser(userId);
  const ppr = await db.getSetting('points_per_refer') || '50';
  const link = `https://t.me/${cfg.BOT_USERNAME}?start=ref_${user.refer_code}`;
  const msg = await ctx.reply(
    `👥 *Refer & Earn*\n\n━━━━━━━━━━━━━━━━━\n💰 Earn *${ppr} points* per referral!\n\n🔗 *Your Link:*\n\`${link}\`\n\n📊 *Stats:*\n👥 Referrals: *${user.total_referrals}*\n💰 Earned: *${fmtPts(user.total_earned)} pts*\n━━━━━━━━━━━━━━━━━\n\n*How it works:*\n1️⃣ Share your link\n2️⃣ Friend joins via link\n3️⃣ Friend joins both channels\n4️⃣ Friend completes device verification ✅\n5️⃣ You get *${ppr} pts* instantly!\n\n⚠️ Same device/IP = no credit`,
    { parse_mode:'Markdown', reply_markup:{ remove_keyboard:true, inline_keyboard:[
      [{ text:'📋 Copy Link', callback_data:'refer_link' }],
      [{ text:'👥 My Referrals', callback_data:'refer_list' }],
      [{ text:'🔙 Back', callback_data:'back_main' }]
    ]}}
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showReferList(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const refs = await db.getReferralsByUser(userId);
  let text = `👥 *My Referrals* (${refs.length})\n\n━━━━━━━━━━━━━━━━━\n`;
  if (!refs.length) text += '_No referrals yet._';
  else text += refs.slice(0,15).map((r,i) => {
    const name = r.username?`@${r.username}`:(r.first_name||'User');
    return `${i+1}. ${name}\n   💰 +${fmtPts(r.points_earned)} pts | ${formatDate(r.created_at)}`;
  }).join('\n\n');
  const msg = await ctx.reply(text, { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{ text:'🔙 Back', callback_data:'show_refer' }]] }});
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function creditReferral(ctx, referrerId, referredId) {
  try {
    const ppr = parseFloat(await db.getSetting('points_per_refer') || '50');
    const enabled = await db.getSetting('referral_bonus_enabled');
    if (enabled !== 'true') return;
    const maxDaily = parseInt(await db.getSetting('max_daily_referrals') || '20');
    const daily = await db.getDailyReferrals(referrerId);
    if (daily >= maxDaily) return;
    await db.setReferred(referredId, referrerId);
    await db.createReferral(referrerId, referredId, ppr);
    await db.addPoints(referrerId, ppr, 'REFERRAL', `Referral bonus for user ${referredId}`, String(referredId));
    await db.incReferrals(referrerId);
    const referredUser = await db.getUser(referredId);
    await ctx.telegram.sendMessage(referrerId,
      `🎉 *New Referral!*\n\n👤 ${getUserName(referredUser)} joined!\n💰 You earned *${ppr} points*!\n\n💰 Total Referrals: ${(await db.getUser(referrerId)).total_referrals}`,
      { parse_mode:'Markdown' }
    );
  } catch(e) {}
}
module.exports = { showRefer, showReferList, creditReferral };
