const db = require('../database/database');
const cfg = require('../config');
const { safeDelete } = require('../utils/helpers');
const { showMain, mainKb } = require('../commands/user/menu');
const { showBalance } = require('../commands/user/balance');
const { showRefer } = require('../commands/user/refer');
const { showWithdraw } = require('../commands/user/withdraw');
const adm = require('../commands/admin/panel');

const MENU_MAP = {
  '💰 Balance':      async (ctx) => { await db.clearSession(ctx.from.id); return showBalance(ctx); },
  '👥 Refer & Earn': async (ctx) => { await db.clearSession(ctx.from.id); return showRefer(ctx); },
  '🎁 Withdraw':     async (ctx) => { await db.clearSession(ctx.from.id); return showWithdraw(ctx); },
};

async function handleMessage(ctx) {
  if (!ctx.message || !ctx.from) return;
  const userId = ctx.from.id;
  const isAdmin = userId === cfg.ADMIN_ID;
  const msgText = ctx.message?.text || '';
  const sess = await db.getSession(userId);

  // User menu
  if (!isAdmin && MENU_MAP[msgText]) {
    try{await ctx.deleteMessage();}catch(e){}
    return MENU_MAP[msgText](ctx);
  }

  // Admin states
  if (isAdmin && adm.STATES_MAP[sess.state]) {
    return adm.STATES_MAP[sess.state](ctx);
  }

  // Idle fallback
  if (!isAdmin && sess.state === 'IDLE') {
    try{await ctx.deleteMessage();}catch(e){}
    const msg = await ctx.reply('❓ Use buttons below or /start.', { reply_markup:{ inline_keyboard:[[{text:'🏠 Menu',callback_data:'back_main'}]] }});
    setTimeout(async()=>{try{await ctx.telegram.deleteMessage(ctx.chat.id,msg.message_id);}catch(e){}},4000);
  }
}
module.exports = { handleMessage };
