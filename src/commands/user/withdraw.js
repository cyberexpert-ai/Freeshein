const db = require('../../database/database');
const cfg = require('../../config');
const { safeDelete, formatDate, fmtPts, getUserName } = require('../../utils/helpers');
const { mainKb } = require('./menu');
const { checkChannels, joinKeyboard } = require('../../middlewares/auth');
const logger = require('../../utils/logger');

async function showWithdraw(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  // Channel check
  const { allJoined, notJoined } = await checkChannels(ctx);
  if (!allJoined) {
    const msg = await ctx.reply('📢 *Join required channels to withdraw:*', { parse_mode:'Markdown', reply_markup:joinKeyboard(notJoined) });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const user = await db.getUser(userId);
  const cats = await db.getCategories(true);
  const minPts = parseFloat(await db.getSetting('min_withdrawal_points') || '100');
  const pts = parseFloat(user?.points || 0);

  if (!cats.length) {
    const msg = await ctx.reply('❌ No withdrawal options available.', { reply_markup:{ remove_keyboard:true, inline_keyboard:[[{ text:'🔙 Back', callback_data:'back_main' }]] }});
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const buttons = cats.map(cat => {
    const canAfford = pts >= cat.points_required;
    const hasStock = cat.stock > 0;
    const label = (!hasStock) ? `❌ ${cat.name} — Out of Stock`
      : (!canAfford) ? `🔒 ${cat.name} — Need ${cat.points_required} pts`
      : `✅ ${cat.name} — ${cat.points_required} pts`;
    return [{ text: label, callback_data: (canAfford && hasStock) ? `wd_cat_${cat.id}` : 'wd_cant' }];
  });
  buttons.push([{ text:'📋 My Withdrawals', callback_data:'wd_history' }]);
  buttons.push([{ text:'🔙 Back', callback_data:'back_main' }]);

  const msg = await ctx.reply(
    `🎁 *Withdraw Voucher*\n\n━━━━━━━━━━━━━━━━━\n💰 Balance: *${fmtPts(pts)} pts*\n📋 Min Required: *${minPts} pts*\n━━━━━━━━━━━━━━━━━\n\nSelect a voucher:`,
    { parse_mode:'Markdown', reply_markup:{ remove_keyboard:true, inline_keyboard:buttons }}
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function confirmWithdraw(ctx, catId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const user = await db.getUser(userId);
  const cat = await db.getCategory(catId);
  if (!cat) { await ctx.answerCbQuery('Category not found.'); return; }
  const pts = parseFloat(user?.points || 0);
  if (pts < cat.points_required || cat.stock <= 0) {
    const msg = await ctx.reply('❌ Cannot withdraw — insufficient points or out of stock.', { reply_markup:{ inline_keyboard:[[{ text:'🔙 Back', callback_data:'show_withdraw' }]] }});
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }
  const msg = await ctx.reply(
    `🎁 *Confirm Withdrawal*\n\n━━━━━━━━━━━━━━━━━\n📦 *${cat.name}*\n💎 Value: ${cat.voucher_value}\n💰 Cost: ${cat.points_required} pts\n💰 After: ${fmtPts(pts - cat.points_required)} pts\n━━━━━━━━━━━━━━━━━\n\n⚠️ Cannot be undone!`,
    { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[
      [{ text:'✅ Confirm', callback_data:`wd_ok_${catId}` }],
      [{ text:'❌ Cancel', callback_data:'show_withdraw' }]
    ]}}
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function processWithdrawal(ctx, catId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const user = await db.getUser(userId);
  const cat = await db.getCategory(catId);
  if (!cat || !user) return;
  const pts = parseFloat(user.points);
  if (pts < cat.points_required || cat.stock <= 0) {
    const msg = await ctx.reply('❌ Cannot process.', { reply_markup:{ inline_keyboard:[[{ text:'🔙 Back', callback_data:'show_withdraw' }]] }});
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const autoApprove = await db.getSetting('withdrawal_auto_approve');
  const wdId = db.genWdId(cfg.ORDER_PREFIX);
  await db.deductPoints(userId, cat.points_required, 'WITHDRAWAL', `Voucher: ${cat.name}`, wdId);
  await db.createWithdrawal(wdId, userId, cat.id, cat.name, cat.points_required);

  let voucherCode = null;
  if (autoApprove === 'true') {
    const voucher = await db.getNextVoucher(cat.id);
    if (voucher) {
      voucherCode = voucher.code;
      await db.markVoucherUsed(voucher.id, userId);
      await db.approveWithdrawal(wdId, voucherCode);
    }
  }

  const msg = await ctx.reply(
    autoApprove === 'true' && voucherCode
      ? `✅ *Withdrawal Approved!*\n\n━━━━━━━━━━━━━━━━━\n🆔 \`${wdId}\`\n📦 ${cat.name}\n🎟 *Your Code:*\n\`${voucherCode}\`\n━━━━━━━━━━━━━━━━━\n\n💡 Tap code to copy!`
      : `✅ *Withdrawal Requested!*\n\n━━━━━━━━━━━━━━━━━\n🆔 \`${wdId}\`\n📦 ${cat.name}\n⏳ Pending admin approval\n━━━━━━━━━━━━━━━━━`,
    { parse_mode:'Markdown', ...mainKb() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });

  // Notify admin
  try {
    const uName = getUserName(user);
    await ctx.telegram.sendMessage(cfg.ADMIN_ID,
      `🎁 *New Withdrawal*\n\n🆔 \`${wdId}\`\n👤 ${uName} (\`${userId}\`)\n📦 ${cat.name}\n💰 ${cat.points_required} pts\n${autoApprove==='true'?'✅ Auto-approved':'⏳ Pending'}`,
      { parse_mode:'Markdown', reply_markup: autoApprove==='true'?undefined:{ inline_keyboard:[
        [{ text:'✅ Approve', callback_data:`adm_wd_approve_${wdId}` }, { text:'❌ Reject', callback_data:`adm_wd_reject_${wdId}` }]
      ]}}
    );
  } catch(e) {}

  // Notify channel
  try {
    await ctx.telegram.sendMessage(cfg.NOTIFY_CHANNEL_ID,
      `🎁 *Withdrawal ${autoApprove==='true'?'Approved':'Requested'}*\n\n👤 ${getUserName(user)}\n📦 ${cat.name}\n🆔 \`${wdId}\``,
      { parse_mode:'Markdown' }
    );
  } catch(e) {}
}

async function showWdHistory(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const wds = await db.getWithdrawalsByUser(userId);
  const se = { PENDING:'⏳', APPROVED:'✅', REJECTED:'❌' };
  let text = `📋 *My Withdrawals* (${wds.length})\n\n━━━━━━━━━━━━━━━━━\n`;
  if (!wds.length) text += '_No withdrawals yet._';
  else text += wds.slice(0,10).map(w => {
    let line = `${se[w.status]||'❓'} \`${w.withdrawal_id}\`\n📦 ${w.category_name} | ${fmtPts(w.points_used)} pts\n📅 ${formatDate(w.requested_at)}`;
    if (w.status==='APPROVED' && w.voucher_code) line += `\n🎟 \`${w.voucher_code}\``;
    if (w.status==='REJECTED') line += `\n❌ ${w.reject_reason||'N/A'}`;
    return line;
  }).join('\n\n');
  const msg = await ctx.reply(text, { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{ text:'🔙 Back', callback_data:'show_withdraw' }]] }});
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}
module.exports = { showWithdraw, confirmWithdraw, processWithdrawal, showWdHistory };
