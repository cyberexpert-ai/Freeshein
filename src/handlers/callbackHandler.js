const db = require('../database/database');
const cfg = require('../config');
const { checkChannels, joinKeyboard } = require('../middlewares/auth');
const { mainKb, showMain } = require('../commands/user/menu');
const { showBalance, showHistory } = require('../commands/user/balance');
const { showRefer, showReferList, creditReferral } = require('../commands/user/refer');
const { showWithdraw, confirmWithdraw, processWithdrawal, showWdHistory } = require('../commands/user/withdraw');
const adm = require('../commands/admin/panel');

async function handleCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const userId = ctx.from.id;
  const isAdmin = userId === cfg.ADMIN_ID;
  await ctx.answerCbQuery().catch(() => {});

  // ── USER ──────────────────────────────────────────────────────
  if (data === 'back_main') {
    try { await ctx.deleteMessage(); } catch(e) {}
    await db.clearSession(userId);
    return showMain(ctx);
  }

  if (data === 'check_join') {
    const { allJoined, notJoined } = await checkChannels(ctx);
    if (!allJoined) {
      await ctx.answerCbQuery('❌ Join all channels first!', { show_alert: true });
      return;
    }
    await db.setChannelVerified(userId, true);
    try { await ctx.deleteMessage(); } catch(e) {}

    // Credit referral if pending
    const user = await db.getUser(userId);
    if (user?.pending_refer_code && !user?.referred_by) {
      const referrer = await db.getUserByCode(user.pending_refer_code);
      if (referrer && referrer.telegram_id !== userId) {
        await creditReferral(ctx, referrer.telegram_id, userId);
      }
    }
    return showMain(ctx);
  }

  if (data === 'show_balance') return showBalance(ctx);
  if (data === 'bal_history') return showHistory(ctx);

  if (data === 'show_refer') return showRefer(ctx);
  if (data === 'refer_link') {
    const user = await db.getUser(userId);
    const link = `https://t.me/${cfg.BOT_USERNAME}?start=ref_${user.refer_code}`;
    await ctx.reply(
      `🔗 *Your Refer Link:*\n\n\`${link}\`\n\n_Tap to copy!_`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'show_refer' }]] } }
    );
    return;
  }
  if (data === 'refer_list') return showReferList(ctx);

  if (data === 'show_withdraw') return showWithdraw(ctx);
  if (data === 'wd_history') return showWdHistory(ctx);
  if (data === 'wd_cant') {
    await ctx.answerCbQuery('❌ Insufficient points or out of stock!', { show_alert: true });
    return;
  }
  if (data.startsWith('wd_cat_')) return confirmWithdraw(ctx, parseInt(data.replace('wd_cat_', '')));
  if (data.startsWith('wd_ok_')) return processWithdrawal(ctx, parseInt(data.replace('wd_ok_', '')));

  // ── ADMIN ─────────────────────────────────────────────────────
  if (!isAdmin) return;

  if (data === 'adm_back') return adm.showPanel(ctx, true);
  if (data === 'adm_wds') return adm.showWds(ctx);
  if (data.startsWith('adm_wd_list_')) return adm.showWdList(ctx, data.replace('adm_wd_list_', ''));
  if (data.startsWith('adm_wd_detail_')) return adm.showWdDetail(ctx, data.replace('adm_wd_detail_', ''));
  if (data.startsWith('adm_wd_approve_')) return adm.promptApproveWd(ctx, data.replace('adm_wd_approve_', ''));
  if (data.startsWith('adm_wd_reject_')) return adm.promptRejectWd(ctx, data.replace('adm_wd_reject_', ''));

  if (data === 'adm_cats') return adm.showCats(ctx);
  if (data === 'adm_cat_add') return adm.promptAddCat(ctx);
  if (data.startsWith('adm_cat_edit_')) return adm.showCatDetail(ctx, parseInt(data.replace('adm_cat_edit_', '')));
  if (data.startsWith('adm_cat_tog_')) {
    const id = parseInt(data.replace('adm_cat_tog_', ''));
    const cat = await db.getCategory(id);
    await db.toggleCategory(id, !cat?.is_active);
    await ctx.answerCbQuery(`✅ ${!cat?.is_active ? 'Enabled' : 'Disabled'}!`);
    return adm.showCats(ctx);
  }
  if (data.startsWith('adm_cat_del_')) {
    await db.deleteCategory(parseInt(data.replace('adm_cat_del_', '')));
    await ctx.answerCbQuery('✅ Deleted!');
    return adm.showCats(ctx);
  }
  if (data.startsWith('adm_cat_single_')) return adm.promptSingleVoucher(ctx, parseInt(data.replace('adm_cat_single_', '')));
  if (data.startsWith('adm_cat_bulk_')) return adm.promptBulkVoucher(ctx, parseInt(data.replace('adm_cat_bulk_', '')));
  if (data.startsWith('adm_cat_vouchers_')) return adm.showVouchersInCat(ctx, parseInt(data.replace('adm_cat_vouchers_', '')));
  if (data.startsWith('adm_cat_clear_')) {
    const id = parseInt(data.replace('adm_cat_clear_', ''));
    const cnt = await db.deleteUnusedVouchers(id);
    await ctx.answerCbQuery(`✅ Cleared ${cnt} vouchers!`);
    return adm.showCatDetail(ctx, id);
  }

  if (data === 'adm_users') return adm.showUsers(ctx);
  if (data === 'adm_search_user') return adm.promptSearchUser(ctx);
  if (data === 'adm_vip_list') return adm.showVIPList(ctx);
  if (data === 'adm_top_refs') return adm.showTopRefs(ctx);
  if (data.startsWith('adm_user_list_')) return adm.showUserList(ctx, parseInt(data.replace('adm_user_list_', '')));
  if (data.startsWith('adm_user_wds_')) return adm.showUserWds(ctx, parseInt(data.replace('adm_user_wds_', '')));
  if (data.startsWith('adm_user_txs_')) return adm.showUserTxs(ctx, parseInt(data.replace('adm_user_txs_', '')));
  if (data.startsWith('adm_user_')) return adm.showUserProfile(ctx, parseInt(data.replace('adm_user_', '')), true);
  if (data.startsWith('adm_block_')) return adm.promptBlockUser(ctx, parseInt(data.replace('adm_block_', '')));
  if (data.startsWith('adm_unblock_')) return adm.handleUnblock(ctx, parseInt(data.replace('adm_unblock_', '')));
  if (data.startsWith('adm_temp_')) return adm.promptTempBlock(ctx, parseInt(data.replace('adm_temp_', '')));
  if (data.startsWith('adm_vip_on_')) return adm.setVIP(ctx, parseInt(data.replace('adm_vip_on_', '')), true);
  if (data.startsWith('adm_vip_off_')) return adm.setVIP(ctx, parseInt(data.replace('adm_vip_off_', '')), false);
  if (data === 'adm_adj_pts_prompt') return adm.promptAdjustPts(ctx);
  if (data.startsWith('adm_adj_user_')) return adm.promptAdjustPts(ctx, parseInt(data.replace('adm_adj_user_', '')));
  if (data.startsWith('adm_msg_')) return adm.promptMsgUser(ctx, parseInt(data.replace('adm_msg_', '')));

  if (data === 'adm_broadcast') return adm.showBroadcast(ctx);
  if (data === 'adm_bc_all') return adm.promptBroadcast(ctx, false);
  if (data === 'adm_bc_photo') return adm.promptBroadcast(ctx, true);
  if (data === 'adm_bc_user') return adm.promptMsgUser(ctx);

  if (data === 'adm_settings') return adm.showSettings(ctx);
  if (data.startsWith('adm_tog_')) {
    const rest = data.replace('adm_tog_', '');
    const li = rest.lastIndexOf('_');
    return adm.handleToggleSetting(ctx, rest.substring(0, li), rest.substring(li + 1));
  }
  if (data === 'adm_set_ppr') {
    const msgId = await adm.promptSet(ctx, 'points_per_refer', 'Points Per Referral');
    if (msgId) await db.setSession(cfg.ADMIN_ID, adm.S.ADM_SET_REFER_PTS, { lastMsgId: msgId });
    return;
  }
  if (data === 'adm_set_minwd') {
    const msgId = await adm.promptSet(ctx, 'min_withdrawal_points', 'Min Withdrawal Points');
    if (msgId) await db.setSession(cfg.ADMIN_ID, adm.S.ADM_SET_MIN_WD, { lastMsgId: msgId });
    return;
  }
  if (data === 'adm_set_maint_msg') {
    const msgId = await adm.promptSet(ctx, 'maintenance_message', 'Maintenance Message');
    if (msgId) await db.setSession(cfg.ADMIN_ID, adm.S.ADM_SET_MAINT_MSG, { lastMsgId: msgId });
    return;
  }
  if (data === 'adm_stats') return adm.showStats(ctx);
}

module.exports = { handleCallback };
