const db = require('../database/database');
const cfg = require('../config');

async function isMember(ctx, channelId) {
  try { const m = await ctx.telegram.getChatMember(channelId, ctx.from.id); return ['member','administrator','creator'].includes(m.status); }
  catch(e) { return true; }
}
async function checkChannels(ctx) {
  const results = await Promise.all(cfg.CHANNELS.map(ch => isMember(ctx, ch.id)));
  const notJoined = cfg.CHANNELS.filter((_,i) => !results[i]);
  return { allJoined: notJoined.length===0, notJoined };
}
function joinKeyboard(notJoined) {
  const btns = notJoined.map(ch => [{ text: `📢 Join ${ch.name}`, url: ch.link }]);
  btns.push([{ text: '✅ I Joined — Verify', callback_data: 'check_join' }]);
  return { inline_keyboard: btns };
}

async function authMiddleware(ctx, next) {
  if (!ctx.from) return next();
  const tid = ctx.from.id;
  try {
    await db.upsertUser(tid, ctx.from.username, ctx.from.first_name, ctx.from.last_name);
    if (tid === cfg.ADMIN_ID) return next();
    const user = await db.getUser(tid);
    if (user?.is_temp_blocked && user.block_until && new Date() > new Date(user.block_until)) { await db.unblockUser(tid); return next(); }
    if (user?.is_blocked) {
      if (ctx.callbackQuery) await ctx.answerCbQuery('🚫 You are blocked', { show_alert: true });
      else await ctx.reply(`🚫 You are blocked.\n${user.block_reason||''}`).catch(()=>{});
      return;
    }
    if (user?.is_temp_blocked) {
      const until = new Date(user.block_until).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
      if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ Temporarily restricted', { show_alert: true });
      else await ctx.reply(`⏳ Restricted until: ${until}\nReason: ${user.block_reason||'N/A'}`).catch(()=>{});
      return;
    }
    // Maintenance check
    if (ctx.message?.text !== '/admin') {
      const maint = await db.getSetting('maintenance_mode');
      if (maint === 'true') {
        const maintMsg = await db.getSetting('maintenance_message') || '🔧 Bot under maintenance.';
        if (ctx.callbackQuery) await ctx.answerCbQuery('🔧 Maintenance mode', { show_alert: true });
        else await ctx.reply(maintMsg).catch(()=>{});
        return;
      }
    }
    return next();
  } catch(e) { return next(); }
}

module.exports = { authMiddleware, checkChannels, joinKeyboard, isMember };
