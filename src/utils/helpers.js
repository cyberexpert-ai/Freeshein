function formatDate(d){ return new Date(d).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}); }
async function safeDelete(ctx,chatId,msgId){ try{if(msgId)await ctx.telegram.deleteMessage(chatId,msgId);}catch(e){} }
async function delMsg(ctx){ try{if(ctx.message)await ctx.deleteMessage();}catch(e){} }
function getUserName(u){ if(!u)return 'Unknown'; return u.username?`@${u.username}`:(u.first_name||'User'); }
function fmtPts(p){ return parseFloat(p||0).toFixed(0); }
module.exports = { formatDate, safeDelete, delMsg, getUserName, fmtPts };
