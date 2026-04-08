const db = require('../../database/database');
const cfg = require('../../config');
const { safeDelete, formatDate, fmtPts, getUserName } = require('../../utils/helpers');
const { mainKb } = require('../user/menu');

// ── STATES ───────────────────────────────────────────────────────────────────
const S = {
  IDLE:'IDLE', ADM_BC_MSG:'ADM_BC_MSG', ADM_BC_PHOTO:'ADM_BC_PHOTO',
  ADM_MSG_UID:'ADM_MSG_UID', ADM_MSG_TEXT:'ADM_MSG_TEXT',
  ADM_BLOCK_REASON:'ADM_BLOCK_REASON', ADM_TEMP_BLOCK:'ADM_TEMP_BLOCK',
  ADM_SEARCH_USER:'ADM_SEARCH_USER', ADM_ADD_CAT_NAME:'ADM_ADD_CAT_NAME',
  ADM_ADD_CAT_PTS:'ADM_ADD_CAT_PTS', ADM_ADD_CAT_VAL:'ADM_ADD_CAT_VAL',
  ADM_ADD_CAT_STOCK:'ADM_ADD_CAT_STOCK', ADM_ADD_SINGLE_VOUCHER:'ADM_ADD_SINGLE_VOUCHER',
  ADM_ADD_BULK_VOUCHER:'ADM_ADD_BULK_VOUCHER', ADM_SET_REFER_PTS:'ADM_SET_REFER_PTS',
  ADM_SET_MIN_WD:'ADM_SET_MIN_WD', ADM_APPROVE_WD:'ADM_APPROVE_WD',
  ADM_REJECT_WD:'ADM_REJECT_WD', ADM_ADJ_PTS:'ADM_ADJ_PTS',
  ADM_SET_MAINT_MSG:'ADM_SET_MAINT_MSG', ADM_EDIT_CAT_PTS:'ADM_EDIT_CAT_PTS',
  ADM_EDIT_CAT_VAL:'ADM_EDIT_CAT_VAL', ADM_EDIT_CAT_NAME:'ADM_EDIT_CAT_NAME',
};

async function showPanel(ctx, edit=false) {
  const stats = await db.getStats();
  const pending = await db.getPendingWithdrawals();
  const text = `👑 *Admin Panel — ${cfg.BOT_NAME}*\n\n━━━━━━━━━━━━━━━━━\n👥 Users: *${stats.users}*\n💰 Points Given: *${fmtPts(stats.total_given||0)}*\n👥 Referrals: *${stats.total_refs||0}*\n🎁 Pending WD: *${pending.length}*${pending.length?' ⚠️':''}\n✅ Approved: *${stats.approved||0}* | ❌ Rejected: *${stats.rejected||0}*\n📦 Categories: *${stats.categories}*\n━━━━━━━━━━━━━━━━━`;
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[
    [{ text:'🎁 Withdrawals', callback_data:'adm_wds' }, { text:'📂 Categories', callback_data:'adm_cats' }],
    [{ text:'👥 Users', callback_data:'adm_users' }, { text:'📢 Broadcast', callback_data:'adm_broadcast' }],
    [{ text:'⚙️ Settings', callback_data:'adm_settings' }, { text:'📊 Stats', callback_data:'adm_stats' }],
    [{ text:'💰 Adjust Points', callback_data:'adm_adj_pts_prompt' }, { text:'🔍 Search User', callback_data:'adm_search_user' }]
  ]}};
  if (edit && ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch(e){} }
  const sess = await db.getSession(cfg.ADMIN_ID);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const msg = await ctx.reply(text, opts);
  await db.setSession(cfg.ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

// ── WITHDRAWALS ──────────────────────────────────────────────────────────────
async function showWds(ctx) {
  const pending = await db.getPendingWithdrawals();
  const stats = await db.getWdStats();
  let text = `🎁 *Withdrawals*\n\n⏳ Pending: *${stats.pending||0}*\n✅ Approved: *${stats.approved||0}*\n❌ Rejected: *${stats.rejected||0}*\n`;
  const btns = [
    [{ text:`⏳ Pending (${stats.pending||0})`, callback_data:'adm_wd_list_p' }, { text:'✅ Approved', callback_data:'adm_wd_list_a' }],
    [{ text:'❌ Rejected', callback_data:'adm_wd_list_r' }],
    [{ text:'↩️ Back', callback_data:'adm_back' }]
  ];
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:btns }};
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch(e){} }
  const msg = await ctx.reply(text, opts);
  await db.setSession(cfg.ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function showWdList(ctx, status) {
  const stMap = { p:'PENDING', a:'APPROVED', r:'REJECTED' };
  const st = stMap[status] || 'PENDING';
  const rows = status==='p' ? await db.getPendingWithdrawals() : (await db.query(`SELECT w.*,u.username,u.first_name FROM withdrawals w LEFT JOIN users u ON w.user_id=u.telegram_id WHERE w.status=$1 ORDER BY w.requested_at DESC LIMIT 10`,[st])).rows;
  let text = `🎁 *${st} Withdrawals* (${rows.length})\n`;
  const btns = rows.map(w => [{ text:`${w.withdrawal_id} | ${w.category_name} | ${w.username?`@${w.username}`:w.first_name||'User'}`, callback_data:`adm_wd_detail_${w.withdrawal_id}` }]);
  btns.push([{ text:'↩️ Back', callback_data:'adm_wds' }]);
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:btns }};
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch(e){} }
  await ctx.reply(text, opts);
}

async function showWdDetail(ctx, wdId) {
  const w = await db.getWithdrawal(wdId);
  if (!w) { await ctx.answerCbQuery('Not found.'); return; }
  const user = await db.getUser(w.user_id);
  const se = { PENDING:'⏳', APPROVED:'✅', REJECTED:'❌' };
  const text = `🎁 *Withdrawal*\n\n🆔 \`${w.withdrawal_id}\`\n👤 ${getUserName(user)} (\`${w.user_id}\`)\n📦 ${w.category_name}\n💰 ${fmtPts(w.points_used)} pts\n${se[w.status]||'❓'} ${w.status}\n📅 ${formatDate(w.requested_at)}${w.voucher_code?`\n🎟 \`${w.voucher_code}\``:''} ${w.reject_reason?`\n❌ ${w.reject_reason}`:''}`;
  const btns = [];
  if (w.status==='PENDING') {
    btns.push([{ text:'✅ Approve + Send Code', callback_data:`adm_wd_approve_${w.withdrawal_id}` }]);
    btns.push([{ text:'❌ Reject', callback_data:`adm_wd_reject_${w.withdrawal_id}` }]);
  }
  btns.push([{ text:'👤 User', callback_data:`adm_user_${w.user_id}` }, { text:'↩️ Back', callback_data:'adm_wds' }]);
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:btns }};
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch(e){} }
  await ctx.reply(text, opts);
}

async function promptApproveWd(ctx, wdId) {
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{ text:'↩️ Cancel', callback_data:`adm_wd_detail_${wdId}` }]] }};
  let msgId;
  if (ctx.callbackQuery) { try { await ctx.editMessageText(`✅ *Approve \`${wdId}\`*\n\nSend voucher code:`, opts); msgId=ctx.callbackQuery.message.message_id; } catch(e) { const m=await ctx.reply('Send code:',opts); msgId=m.message_id; } }
  else { const m=await ctx.reply('Send code:',opts); msgId=m.message_id; }
  await db.setSession(cfg.ADMIN_ID, S.ADM_APPROVE_WD, { wdId, lastMsgId: msgId });
}

async function handleApproveWdInput(ctx) {
  const sess = await db.getSession(cfg.ADMIN_ID);
  const code = ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if (!code) return ctx.reply('⚠️ Send valid code.');
  const { wdId } = sess.data;
  const w = await db.getWithdrawal(wdId);
  if (!w) return;
  await db.approveWithdrawal(wdId, code);
  // Notify user
  try { await ctx.telegram.sendMessage(w.user_id, `✅ *Withdrawal Approved!*\n\n🆔 \`${wdId}\`\n📦 ${w.category_name}\n🎟 *Code:* \`${code}\`\n\n💡 Tap code to copy!`, { parse_mode:'Markdown' }); } catch(e){}
  try { await ctx.telegram.sendMessage(cfg.NOTIFY_CHANNEL_ID, `✅ *Voucher Delivered*\n\n📦 ${w.category_name}\n🆔 \`${wdId}\``, { parse_mode:'Markdown' }); } catch(e){}
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(cfg.ADMIN_ID);
  const msg = await ctx.reply(`✅ Approved \`${wdId}\`!`, { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{ text:'↩️ Withdrawals', callback_data:'adm_wds' }]] }});
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptRejectWd(ctx, wdId) {
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{ text:'↩️ Cancel', callback_data:`adm_wd_detail_${wdId}` }]] }};
  let msgId;
  if (ctx.callbackQuery) { try { await ctx.editMessageText(`❌ *Reject \`${wdId}\`*\n\nSend reason:`, opts); msgId=ctx.callbackQuery.message.message_id; } catch(e) { const m=await ctx.reply('Send reason:',opts); msgId=m.message_id; } }
  else { const m=await ctx.reply('Send reason:',opts); msgId=m.message_id; }
  await db.setSession(cfg.ADMIN_ID, S.ADM_REJECT_WD, { wdId, lastMsgId: msgId });
}

async function handleRejectWdInput(ctx) {
  const sess = await db.getSession(cfg.ADMIN_ID);
  const reason = ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if (!reason) return;
  const { wdId } = sess.data;
  const w = await db.getWithdrawal(wdId);
  if (!w) return;
  await db.rejectWithdrawal(wdId, reason);
  // Refund points
  await db.addPoints(w.user_id, w.points_used, 'REFUND', `Refund: rejected withdrawal ${wdId}`, wdId);
  try { await ctx.telegram.sendMessage(w.user_id, `❌ *Withdrawal Rejected*\n\n🆔 \`${wdId}\`\nReason: ${reason}\n\n💰 Points refunded!`, { parse_mode:'Markdown' }); } catch(e){}
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(cfg.ADMIN_ID);
  const msg = await ctx.reply(`❌ Rejected. Points refunded.`, { reply_markup:{ inline_keyboard:[[{ text:'↩️ Back', callback_data:'adm_wds' }]] }});
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

// ── CATEGORIES ───────────────────────────────────────────────────────────────
async function showCats(ctx) {
  const cats = await db.getCategories(false);
  let text = `📂 *Categories* (${cats.length})\n\n`;
  cats.forEach((c,i) => { text += `${i+1}. ${c.is_active?'✅':'❌'} *${c.name}*\n   💰 ${c.points_required} pts | 💎 ${c.voucher_value} | 📦 Stock: ${c.stock} | Redeemed: ${c.total_redeemed}\n\n`; });
  const btns = [
    [{ text:'➕ Add Category', callback_data:'adm_cat_add' }],
    ...cats.map(c => [
      { text:`✏️ ${c.name.slice(0,15)}`, callback_data:`adm_cat_edit_${c.id}` },
      { text:c.is_active?'🔴 Disable':'🟢 Enable', callback_data:`adm_cat_tog_${c.id}` },
      { text:'🗑 Delete', callback_data:`adm_cat_del_${c.id}` }
    ]),
    [{ text:'↩️ Back', callback_data:'adm_back' }]
  ];
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:btns }};
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch(e){} }
  const msg = await ctx.reply(text, opts);
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function showCatDetail(ctx, catId) {
  const cat = await db.getCategory(catId);
  if (!cat) { await ctx.answerCbQuery('Not found.'); return; }
  const vouchers = await db.getVouchersByCategory(catId, false);
  const text = `📂 *${cat.name}*\n\n💰 Points: *${cat.points_required}*\n💎 Value: *${cat.voucher_value}*\n📦 Stock: *${cat.stock}*\n✅ Redeemed: *${cat.total_redeemed}*\n${cat.is_active?'✅ Active':'❌ Inactive'}\n\n📋 Unused vouchers: *${vouchers.length}*`;
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[
    [{ text:'➕ Add Single Voucher', callback_data:`adm_cat_single_${catId}` }],
    [{ text:'📋 Add Bulk Vouchers', callback_data:`adm_cat_bulk_${catId}` }],
    [{ text:'📜 View Vouchers', callback_data:`adm_cat_vouchers_${catId}` }],
    [{ text:'✏️ Edit Name', callback_data:`adm_cat_ename_${catId}` }, { text:'✏️ Edit Points', callback_data:`adm_cat_epts_${catId}` }],
    [{ text:'✏️ Edit Value', callback_data:`adm_cat_eval_${catId}` }, { text:'🗑 Clear Vouchers', callback_data:`adm_cat_clear_${catId}` }],
    [{ text:'↩️ Back', callback_data:'adm_cats' }]
  ]}};
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch(e){} }
  const msg = await ctx.reply(text, opts);
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptAddCat(ctx) {
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{ text:'↩️ Back', callback_data:'adm_cats' }]] }};
  let msgId;
  if (ctx.callbackQuery) { try { await ctx.editMessageText('📂 *Add Category*\n\nSend the *name*:', opts); msgId=ctx.callbackQuery.message.message_id; } catch(e) { const m=await ctx.reply('Send name:',opts); msgId=m.message_id; } }
  else { const m=await ctx.reply('Send name:',opts); msgId=m.message_id; }
  await db.setSession(cfg.ADMIN_ID, S.ADM_ADD_CAT_NAME, { lastMsgId: msgId });
}
async function handleAddCatName(ctx) {
  const sess=await db.getSession(cfg.ADMIN_ID); const name=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){} if(!name) return;
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  const msg=await ctx.reply(`📂 *${name}*\n\nSend *points required*:`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_cats'}]]}});
  await db.setSession(cfg.ADMIN_ID,S.ADM_ADD_CAT_PTS,{catName:name,lastMsgId:msg.message_id});
}
async function handleAddCatPts(ctx) {
  const sess=await db.getSession(cfg.ADMIN_ID); const pts=parseFloat(ctx.message?.text?.trim());
  try{await ctx.deleteMessage();}catch(e){} if(isNaN(pts)) return ctx.reply('⚠️ Invalid number.');
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  const msg=await ctx.reply(`💰 ${pts} pts\n\nSend *voucher value* (e.g. ₹500):`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_cats'}]]}});
  await db.setSession(cfg.ADMIN_ID,S.ADM_ADD_CAT_VAL,{...sess.data,catPts:pts,lastMsgId:msg.message_id});
}
async function handleAddCatVal(ctx) {
  const sess=await db.getSession(cfg.ADMIN_ID); const val=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){} if(!val) return;
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  const cat=await db.addCategory(sess.data.catName,'',sess.data.catPts,val,0);
  await db.clearSession(cfg.ADMIN_ID);
  const msg=await ctx.reply(`✅ Category *${cat.name}* added!\n💰 ${cat.points_required} pts | 💎 ${cat.voucher_value}\n\nNow add vouchers via Category > Add Vouchers`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'📦 Add Vouchers',callback_data:`adm_cat_edit_${cat.id}`},{text:'↩️ Categories',callback_data:'adm_cats'}]]}});
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptSingleVoucher(ctx, catId) {
  const cat=await db.getCategory(catId);
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:`adm_cat_edit_${catId}`}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText(`➕ *Add Single Voucher*\n\n*${cat?.name}*\n\nSend the voucher code:`,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Send code:',opts);msgId=m.message_id;}}
  else{const m=await ctx.reply('Send code:',opts);msgId=m.message_id;}
  await db.setSession(cfg.ADMIN_ID,S.ADM_ADD_SINGLE_VOUCHER,{catId,lastMsgId:msgId});
}
async function handleSingleVoucherInput(ctx) {
  const sess=await db.getSession(cfg.ADMIN_ID); const code=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){} if(!code) return;
  const ok=await db.addVoucher(sess.data.catId,code);
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(cfg.ADMIN_ID);
  const msg=await ctx.reply(ok?`✅ Voucher \`${code}\` added!`:`⚠️ Code already exists.`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'➕ Add More',callback_data:`adm_cat_single_${sess.data.catId}`},{text:'↩️ Back',callback_data:`adm_cat_edit_${sess.data.catId}`}]]}});
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptBulkVoucher(ctx, catId) {
  const cat=await db.getCategory(catId);
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:`adm_cat_edit_${catId}`}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText(`📋 *Add Bulk Vouchers*\n\n*${cat?.name}*\n\nSend codes, one per line:\n\`\`\`\nCODE1\nCODE2\nCODE3\n\`\`\``,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Send codes (one per line):',opts);msgId=m.message_id;}}
  else{const m=await ctx.reply('Send codes:',opts);msgId=m.message_id;}
  await db.setSession(cfg.ADMIN_ID,S.ADM_ADD_BULK_VOUCHER,{catId,lastMsgId:msgId});
}
async function handleBulkVoucherInput(ctx) {
  const sess=await db.getSession(cfg.ADMIN_ID); const text=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){} if(!text) return;
  const codes=text.split('\n').map(c=>c.trim()).filter(c=>c.length>0);
  const added=await db.addVouchersBulk(sess.data.catId,codes);
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(cfg.ADMIN_ID);
  const msg=await ctx.reply(`✅ Added *${added}/${codes.length}* vouchers!`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:`adm_cat_edit_${sess.data.catId}`}]]}});
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function showVouchersInCat(ctx, catId) {
  const cat=await db.getCategory(catId);
  const unused=await db.getVouchersByCategory(catId,false);
  const used=await db.getVouchersByCategory(catId,true);
  let text=`📜 *Vouchers: ${cat?.name}*\n\n📦 Unused: *${unused.length}*\n✅ Used: *${used.length}*\n\n`;
  if(unused.length) text+=`*Unused codes:*\n${unused.slice(0,20).map(v=>`\`${v.code}\``).join('\n')}`;
  if(unused.length>20) text+=`\n\n_...and ${unused.length-20} more_`;
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:`adm_cat_edit_${catId}`}]]}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  const msg=await ctx.reply(text,opts);
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

// ── USERS ────────────────────────────────────────────────────────────────────
async function showUsers(ctx) {
  const count=await db.getUserCount();
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[
    [{text:'🔍 Search',callback_data:'adm_search_user'},{text:'📋 All Users',callback_data:'adm_user_list_0'}],
    [{text:'👑 VIP List',callback_data:'adm_vip_list'},{text:'🏆 Top Referrers',callback_data:'adm_top_refs'}],
    [{text:'↩️ Back',callback_data:'adm_back'}]
  ]}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(`👥 *Users* (${count})`,opts);}catch(e){}}
  const msg=await ctx.reply(`👥 *Users* (${count})`,opts);
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptSearchUser(ctx) {
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText('🔍 Send Telegram User ID:',opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Send ID:',opts);msgId=m.message_id;}}
  else{const m=await ctx.reply('Send ID:',opts);msgId=m.message_id;}
  await db.setSession(cfg.ADMIN_ID,S.ADM_SEARCH_USER,{lastMsgId:msgId});
}
async function handleSearchUserInput(ctx) {
  const sess=await db.getSession(cfg.ADMIN_ID); const id=parseInt(ctx.message?.text?.trim());
  try{await ctx.deleteMessage();}catch(e){}
  if(isNaN(id)) return ctx.reply('⚠️ Invalid ID.');
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(cfg.ADMIN_ID);
  await showUserProfile(ctx, id);
}

async function showUserProfile(ctx, userId, edit=false) {
  const user=await db.getUser(userId);
  if(!user){ const opts={reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]}}; if(edit&&ctx.callbackQuery){try{return await ctx.editMessageText(`⚠️ User \`${userId}\` not found.`,opts);}catch(e){}} const msg=await ctx.reply(`⚠️ Not found.`,opts); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); return; }
  const wds=await db.getWithdrawalsByUser(userId);
  const refs=await db.getReferralsByUser(userId);
  const text=`👤 *User Profile*\n\n━━━━━━━━━━━━━━━━━\n🆔 \`${user.telegram_id}\`\n👤 ${user.first_name||''} ${user.last_name||''}\n📱 ${user.username?`@${user.username}`:'No username'}\n👑 VIP: ${user.is_vip?'✅':'❌'}\n🚫 Blocked: ${user.is_blocked?'✅':'❌'}\n💰 Balance: *${fmtPts(user.points)} pts*\n📈 Earned: *${fmtPts(user.total_earned)} pts*\n📤 Withdrawn: *${fmtPts(user.total_withdrawn)} pts*\n👥 Referrals: *${user.total_referrals}*\n🎁 Withdrawals: *${wds.length}*\n📅 Joined: ${formatDate(user.joined_at)}\n━━━━━━━━━━━━━━━━━`;
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[
    [{text:'💬 Message',callback_data:`adm_msg_${userId}`},{text:'🎁 WD History',callback_data:`adm_user_wds_${userId}`}],
    user.is_vip?[{text:'👑 Remove VIP',callback_data:`adm_vip_off_${userId}`}]:[{text:'👑 Give VIP',callback_data:`adm_vip_on_${userId}`}],
    user.is_blocked?[{text:'✅ Unblock',callback_data:`adm_unblock_${userId}`}]:[{text:'🚫 Block',callback_data:`adm_block_${userId}`},{text:'⏳ Temp',callback_data:`adm_temp_${userId}`}],
    [{text:'💰 Adjust Points',callback_data:`adm_adj_user_${userId}`},{text:'📊 Transactions',callback_data:`adm_user_txs_${userId}`}],
    [{text:'↩️ Back',callback_data:'adm_users'}]
  ]}};
  if(edit&&ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  const msg=await ctx.reply(text,opts);
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptBlockUser(ctx,userId){ const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Cancel',callback_data:`adm_user_${userId}`}]]}}; let msgId; if(ctx.callbackQuery){try{await ctx.editMessageText(`🚫 *Block \`${userId}\`*\n\nSend reason:`,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Send reason:',opts);msgId=m.message_id;}}else{const m=await ctx.reply('Send reason:',opts);msgId=m.message_id;} await db.setSession(cfg.ADMIN_ID,S.ADM_BLOCK_REASON,{targetId:userId,lastMsgId:msgId}); }
async function handleBlockInput(ctx){ const sess=await db.getSession(cfg.ADMIN_ID); const reason=ctx.message?.text?.trim(); try{await ctx.deleteMessage();}catch(e){} if(!reason) return; await db.blockUser(sess.data.targetId,reason); try{await ctx.telegram.sendMessage(sess.data.targetId,`🚫 Blocked.\nReason: ${reason}`);}catch(e){} try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){} await db.clearSession(cfg.ADMIN_ID); const msg=await ctx.reply('✅ User blocked.',{reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]}}); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }
async function handleUnblock(ctx,userId){ await db.unblockUser(userId); try{await ctx.telegram.sendMessage(userId,'✅ Unblocked! Send /start.');}catch(e){} await ctx.answerCbQuery('✅ Unblocked!'); await showUserProfile(ctx,userId,true); }
async function promptTempBlock(ctx,userId){ const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Cancel',callback_data:`adm_user_${userId}`}]]}}; let msgId; if(ctx.callbackQuery){try{await ctx.editMessageText(`⏳ *Temp Block \`${userId}\`*\n\nFormat: \`MINUTES REASON\``,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Format: MINUTES REASON',opts);msgId=m.message_id;}}else{const m=await ctx.reply('Format: MINUTES REASON',opts);msgId=m.message_id;} await db.setSession(cfg.ADMIN_ID,S.ADM_TEMP_BLOCK,{targetId:userId,lastMsgId:msgId}); }
async function handleTempBlockInput(ctx){ const sess=await db.getSession(cfg.ADMIN_ID); const parts=ctx.message?.text?.trim().split(' '); try{await ctx.deleteMessage();}catch(e){} const mins=parseInt(parts?.[0]); const reason=parts?.slice(1).join(' ')||'Temp restriction'; if(isNaN(mins)||mins<1) return ctx.reply('⚠️ Format: MINUTES REASON'); await db.tempBlockUser(sess.data.targetId,reason,mins); try{await ctx.telegram.sendMessage(sess.data.targetId,`⏳ Restricted ${mins} min.\nReason: ${reason}`);}catch(e){} try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){} await db.clearSession(cfg.ADMIN_ID); const msg=await ctx.reply(`✅ Restricted ${mins} min.`,{reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]}}); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }
async function setVIP(ctx,userId,vip){ await db.setVIP(userId,vip); try{await ctx.telegram.sendMessage(userId,vip?'👑 VIP granted!':'VIP removed.');}catch(e){} await ctx.answerCbQuery(vip?'✅ VIP!':'✅ Removed!'); await showUserProfile(ctx,userId,true); }
async function promptAdjustPts(ctx,userId=null){ const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Cancel',callback_data:userId?`adm_user_${userId}`:'adm_back'}]]}}; let msgId; const text=userId?`💰 *Adjust Points*\n\nUser: \`${userId}\`\n\nSend amount (+100 or -50):`:'💰 *Adjust Points*\n\nSend: \`USER_ID AMOUNT\`\nExample: \`123456789 +100\`'; if(ctx.callbackQuery){try{await ctx.editMessageText(text,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply(text,opts);msgId=m.message_id;}}else{const m=await ctx.reply(text,opts);msgId=m.message_id;} await db.setSession(cfg.ADMIN_ID,S.ADM_ADJ_PTS,{targetId:userId,lastMsgId:msgId}); }
async function handleAdjPtsInput(ctx){ const sess=await db.getSession(cfg.ADMIN_ID); const text=ctx.message?.text?.trim(); try{await ctx.deleteMessage();}catch(e){} let targetId=sess.data.targetId; let pts; if(targetId){ pts=parseFloat(text); }else{ const parts=text.split(' '); targetId=parseInt(parts[0]); pts=parseFloat(parts[1]); } if(isNaN(pts)||isNaN(targetId)) return ctx.reply('⚠️ Invalid input.'); await db.addPoints(targetId,pts,'ADMIN_ADJUST',pts>0?`Admin added ${pts} pts`:`Admin deducted ${Math.abs(pts)} pts`); try{await ctx.telegram.sendMessage(targetId,`💰 ${pts>0?'Added':'Deducted'} ${Math.abs(pts)} points by admin`);}catch(e){} try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){} await db.clearSession(cfg.ADMIN_ID); const msg=await ctx.reply(`✅ Adjusted ${pts} pts for \`${targetId}\``,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_back'}]]}}); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }

async function showUserList(ctx,page=0){ const all=await db.getAllUsers(); const ps=10; const pu=all.slice(page*ps,(page+1)*ps); let text=`📋 *All Users* (${all.length}) — Page ${page+1}\n\n`+pu.map((u,i)=>`${page*ps+i+1}. \`${u.telegram_id}\` ${u.username?`@${u.username}`:u.first_name||'User'} | ${fmtPts(u.points)}pts${u.is_blocked?' 🚫':''}${u.is_vip?' 👑':''}`).join('\n'); const btns=[]; const nav=[]; if(page>0) nav.push({text:'⬅️',callback_data:`adm_user_list_${page-1}`}); if((page+1)*ps<all.length) nav.push({text:'➡️',callback_data:`adm_user_list_${page+1}`}); if(nav.length) btns.push(nav); btns.push([{text:'↩️ Back',callback_data:'adm_users'}]); const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:btns}}; if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}} const msg=await ctx.reply(text,opts); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }
async function showVIPList(ctx){ const r=await db.query('SELECT * FROM users WHERE is_vip=true ORDER BY joined_at DESC'); let text=`👑 *VIP Users* (${r.rows.length})\n\n`+(r.rows.length?r.rows.map((u,i)=>`${i+1}. \`${u.telegram_id}\` ${u.username?`@${u.username}`:u.first_name||'User'}`).join('\n'):'_None._'); const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]}}; if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}} const msg=await ctx.reply(text,opts); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }
async function showTopRefs(ctx){ const r=await db.query('SELECT telegram_id,username,first_name,total_referrals,points FROM users WHERE total_referrals>0 ORDER BY total_referrals DESC LIMIT 10'); let text=`🏆 *Top Referrers*\n\n`; if(!r.rows.length) text+='_No referrals yet._'; else{ const medals=['🥇','🥈','🥉']; r.rows.forEach((u,i)=>{ text+=`${medals[i]||`${i+1}.`} ${u.username?`@${u.username}`:u.first_name||'User'}\n   👥 ${u.total_referrals} | 💰 ${fmtPts(u.points)} pts\n\n`; }); } const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]}}; if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}} const msg=await ctx.reply(text,opts); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }
async function showUserWds(ctx,userId){ const wds=await db.getWithdrawalsByUser(userId); const se={PENDING:'⏳',APPROVED:'✅',REJECTED:'❌'}; let text=`🎁 *WDs for \`${userId}\`* (${wds.length})\n\n`+(wds.length?wds.slice(0,8).map(w=>`${se[w.status]||'❓'} \`${w.withdrawal_id}\`\n${w.category_name} | ${fmtPts(w.points_used)} pts`).join('\n\n'):'_None._'); const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:`adm_user_${userId}`}]]}}; if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}} const msg=await ctx.reply(text,opts); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }
async function showUserTxs(ctx,userId){ const txs=await db.getTransactions(userId,15); let text=`📊 *Transactions \`${userId}\`*\n\n`+(txs.length?txs.map(t=>`${t.points>0?'🟢 +':'🔴 '}${fmtPts(t.points)} — ${t.description}\n${formatDate(t.created_at)}`).join('\n\n'):'_None._'); const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:`adm_user_${userId}`}]]}}; if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}} const msg=await ctx.reply(text,opts); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }
async function promptMsgUser(ctx,userId=null){ const text=userId?`💬 Send message to \`${userId}\`:`:'💬 Send User ID:'; const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_broadcast'}]]}}; let msgId; if(ctx.callbackQuery){try{await ctx.editMessageText(text,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply(text,opts);msgId=m.message_id;}}else{const m=await ctx.reply(text,opts);msgId=m.message_id;} if(userId){await db.setSession(cfg.ADMIN_ID,S.ADM_MSG_TEXT,{targetId:userId,lastMsgId:msgId});}else{await db.setSession(cfg.ADMIN_ID,S.ADM_MSG_UID,{lastMsgId:msgId});} }
async function handleMsgUidInput(ctx){ const sess=await db.getSession(cfg.ADMIN_ID); const id=parseInt(ctx.message?.text?.trim()); try{await ctx.deleteMessage();}catch(e){} if(isNaN(id)) return ctx.reply('⚠️ Invalid ID.'); try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){} const msg=await ctx.reply(`💬 Now send message to \`${id}\`:`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Cancel',callback_data:'adm_broadcast'}]]}}); await db.setSession(cfg.ADMIN_ID,S.ADM_MSG_TEXT,{targetId:id,lastMsgId:msg.message_id}); }
async function handleMsgTextInput(ctx){ const sess=await db.getSession(cfg.ADMIN_ID); const msgText=ctx.message?.text||ctx.message?.caption||''; const photoId=ctx.message?.photo?.[ctx.message.photo.length-1]?.file_id||null; try{await ctx.deleteMessage();}catch(e){} if(!msgText&&!photoId) return ctx.reply('⚠️ Send message or photo.'); try{ if(photoId){await ctx.telegram.sendPhoto(sess.data.targetId,photoId,{caption:`📨 *Admin:*\n\n${msgText||''}`,parse_mode:'Markdown'});}else{await ctx.telegram.sendMessage(sess.data.targetId,`📨 *Admin:*\n\n${msgText}`,{parse_mode:'Markdown'});} }catch(e){ const msg=await ctx.reply('❌ Failed.',{reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_broadcast'}]]}}); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); return; } try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){} await db.clearSession(cfg.ADMIN_ID); const msg=await ctx.reply(`✅ Sent to \`${sess.data.targetId}\`!`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_broadcast'}]]}}); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }

// ── BROADCAST ────────────────────────────────────────────────────────────────
async function showBroadcast(ctx){ const recent=await db.getBroadcasts(3); let text=`📢 *Broadcast*\n\nRecent:\n`+(recent.length?recent.map((b,i)=>`${i+1}. ${(b.message||'[Photo]').slice(0,40)} ✅${b.sent_count} ❌${b.failed_count}`).join('\n'):'_None._'); const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'📢 Broadcast All',callback_data:'adm_bc_all'},{text:'📸 With Photo',callback_data:'adm_bc_photo'}],[{text:'💬 Message User',callback_data:'adm_bc_user'}],[{text:'↩️ Back',callback_data:'adm_back'}]]}}; if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}} const msg=await ctx.reply(text,opts); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }
async function promptBroadcast(ctx,withPhoto=false){ const text=withPhoto?'📸 Send photo with caption:':'📢 Type broadcast message:'; const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_broadcast'}]]}}; let msgId; if(ctx.callbackQuery){try{await ctx.editMessageText(text,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply(text,opts);msgId=m.message_id;}}else{const m=await ctx.reply(text,opts);msgId=m.message_id;} await db.setSession(cfg.ADMIN_ID,withPhoto?S.ADM_BC_PHOTO:S.ADM_BC_MSG,{lastMsgId:msgId}); }
async function handleBroadcastInput(ctx){ const sess=await db.getSession(cfg.ADMIN_ID); const msgText=ctx.message?.text||ctx.message?.caption||''; const photoId=ctx.message?.photo?.[ctx.message.photo.length-1]?.file_id||null; try{await ctx.deleteMessage();}catch(e){} if(!msgText&&!photoId) return ctx.reply('⚠️ Send message or photo.'); const users=await db.getAllUsers(); try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){} const statusMsg=await ctx.reply(`📢 Sending to ${users.length}...`); let sent=0,failed=0; for(const u of users){ try{ if(photoId){await ctx.telegram.sendPhoto(u.telegram_id,photoId,{caption:msgText||'',parse_mode:'Markdown'});}else{await ctx.telegram.sendMessage(u.telegram_id,msgText,{parse_mode:'Markdown'});} sent++; }catch(e){failed++;} await new Promise(r=>setTimeout(r,50)); } await db.saveBroadcast(msgText,photoId,'ALL',sent,failed); try{await ctx.telegram.deleteMessage(ctx.chat.id,statusMsg.message_id);}catch(e){} await db.clearSession(cfg.ADMIN_ID); const msg=await ctx.reply(`✅ *Done!*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed}`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_broadcast'}]]}}); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }

// ── SETTINGS ────────────────────────────────────────────────────────────────
async function showSettings(ctx){ const all=await db.getAllSettings(); const sm={}; all.forEach(s=>sm[s.key]=s.value); const text=`⚙️ *Settings*\n\n💰 Points/Refer: *${sm.points_per_refer||50}*\n🎁 Min Withdrawal: *${sm.min_withdrawal_points||100} pts*\n✅ Auto Approve WD: *${sm.withdrawal_auto_approve==='true'?'✅ ON':'❌ OFF'}*\n🎁 Referral Bonus: *${sm.referral_bonus_enabled==='true'?'✅ ON':'❌ OFF'}*\n👥 Max Daily Refs: *${sm.max_daily_referrals||20}*\n🔧 Maintenance: *${sm.maintenance_mode==='true'?'✅ ON':'❌ OFF'}*`; const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:`💰 Set Refer Points (${sm.points_per_refer||50})`,callback_data:'adm_set_ppr'}],[{text:`🎁 Set Min WD (${sm.min_withdrawal_points||100})`,callback_data:'adm_set_minwd'}],[{text:`✅ Auto Approve: ${sm.withdrawal_auto_approve==='true'?'ON':'OFF'}`,callback_data:`adm_tog_withdrawal_auto_approve_${sm.withdrawal_auto_approve==='true'?'false':'true'}`}],[{text:`🎁 Referral Bonus: ${sm.referral_bonus_enabled==='true'?'ON':'OFF'}`,callback_data:`adm_tog_referral_bonus_enabled_${sm.referral_bonus_enabled==='true'?'false':'true'}`}],[{text:`🔧 Maintenance: ${sm.maintenance_mode==='true'?'ON':'OFF'}`,callback_data:`adm_tog_maintenance_mode_${sm.maintenance_mode==='true'?'false':'true'}`}],[{text:'📝 Maintenance Message',callback_data:'adm_set_maint_msg'}],[{text:'↩️ Back',callback_data:'adm_back'}]]}}; if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}} const msg=await ctx.reply(text,opts); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }
async function promptSet(ctx,key,label){ const cur=await db.getSetting(key); const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_settings'}]]}}; let msgId; if(ctx.callbackQuery){try{await ctx.editMessageText(`⚙️ *${label}*\n\nCurrent: *${cur}*\n\nSend new value:`,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Send value:',opts);msgId=m.message_id;}}else{const m=await ctx.reply('Send value:',opts);msgId=m.message_id;} return msgId; }
async function handleToggleSetting(ctx,key,val){ await db.setSetting(key,val); await ctx.answerCbQuery(`✅ ${key} → ${val}`); await showSettings(ctx); }

async function showStats(ctx){ const stats=await db.getStats(); const cats=await db.getCategories(false); let catText=''; for(const c of cats){ catText+=`\n• ${c.name}: 📦 ${c.stock} | ✅ ${c.total_redeemed}`; } const text=`📊 *Statistics*\n\n━━━━━━━━━━━━━━━━━\n👥 Users: *${stats.users}*\n💰 Points Given: *${fmtPts(stats.total_given||0)}*\n👥 Total Refs: *${stats.total_refs||0}*\n⏳ Pending WD: *${stats.pending||0}*\n✅ Approved WD: *${stats.approved||0}*\n❌ Rejected WD: *${stats.rejected||0}*\n━━━━━━━━━━━━━━━━━\n📦 *Stock:*${catText}`; const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'🔄 Refresh',callback_data:'adm_stats'},{text:'↩️ Back',callback_data:'adm_back'}]]}}; if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}} const msg=await ctx.reply(text,opts); await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }

// States map
const STATES_MAP = {
  [S.ADM_BC_MSG]: handleBroadcastInput, [S.ADM_BC_PHOTO]: handleBroadcastInput,
  [S.ADM_MSG_UID]: handleMsgUidInput, [S.ADM_MSG_TEXT]: handleMsgTextInput,
  [S.ADM_BLOCK_REASON]: handleBlockInput, [S.ADM_TEMP_BLOCK]: handleTempBlockInput,
  [S.ADM_SEARCH_USER]: handleSearchUserInput,
  [S.ADM_ADD_CAT_NAME]: handleAddCatName, [S.ADM_ADD_CAT_PTS]: handleAddCatPts,
  [S.ADM_ADD_CAT_VAL]: handleAddCatVal,
  [S.ADM_ADD_SINGLE_VOUCHER]: handleSingleVoucherInput,
  [S.ADM_ADD_BULK_VOUCHER]: handleBulkVoucherInput,
  [S.ADM_APPROVE_WD]: handleApproveWdInput, [S.ADM_REJECT_WD]: handleRejectWdInput,
  [S.ADM_ADJ_PTS]: handleAdjPtsInput,
};

// Settings input handlers (need to be set dynamically)
async function handleSettingInput(ctx, key) {
  const sess = await db.getSession(cfg.ADMIN_ID);
  const val = ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if (!val || isNaN(parseFloat(val))) return ctx.reply('⚠️ Invalid value.');
  await db.setSetting(key, val);
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(cfg.ADMIN_ID);
  const msg = await ctx.reply(`✅ Set to *${val}*`, { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_settings'}]] }});
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}
async function handleMaintMsgInput(ctx) {
  const sess = await db.getSession(cfg.ADMIN_ID);
  const val = ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if (!val) return;
  await db.setSetting('maintenance_message', val);
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(cfg.ADMIN_ID);
  const msg = await ctx.reply(`✅ Maintenance message updated.`, { reply_markup:{ inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_settings'}]] }});
  await db.setSession(cfg.ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

STATES_MAP[S.ADM_SET_REFER_PTS] = (ctx) => handleSettingInput(ctx, 'points_per_refer');
STATES_MAP[S.ADM_SET_MIN_WD] = (ctx) => handleSettingInput(ctx, 'min_withdrawal_points');
STATES_MAP[S.ADM_SET_MAINT_MSG] = handleMaintMsgInput;

module.exports = {
  S, STATES_MAP, showPanel, showWds, showWdList, showWdDetail,
  promptApproveWd, promptRejectWd,
  showCats, showCatDetail, promptAddCat, promptSingleVoucher, promptBulkVoucher, showVouchersInCat,
  showUsers, promptSearchUser, showUserProfile, promptBlockUser, handleUnblock,
  promptTempBlock, setVIP, promptAdjustPts, showUserList, showVIPList, showTopRefs,
  showUserWds, showUserTxs, promptMsgUser,
  showBroadcast, promptBroadcast, showSettings, handleToggleSetting, showStats,
  promptSet,
};
