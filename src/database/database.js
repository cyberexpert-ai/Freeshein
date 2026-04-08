require('dotenv').config();
const { Pool } = require('pg');
const { createLogger, format, transports } = require('winston');
const logger = createLogger({ level:'info', format: format.combine(format.timestamp({format:'YYYY-MM-DD HH:mm:ss'}), format.printf(({timestamp,level,message})=>`[${timestamp}] ${level.toUpperCase()}: ${message}`)), transports:[new transports.Console()] });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false, max:20, idleTimeoutMillis:30000, connectionTimeoutMillis:3000 });
pool.on('error', err => logger.error('PG: '+err.message));

async function query(text, params) {
  try { return await pool.query(text, params); }
  catch(e) { logger.error(`DB: ${e.message}`); throw e; }
}

const crypto = require('crypto');
function genCode(){ return crypto.randomBytes(4).toString('hex').toUpperCase(); }
function genWdId(prefix){ const d=new Date().toISOString().slice(0,10).replace(/-/g,''); const r=crypto.randomBytes(3).toString('hex').toUpperCase(); return `${prefix}-${d}-${r}`; }

// Sessions
async function getSession(id){ const r=await query('SELECT state,data FROM sessions WHERE telegram_id=$1',[id]); return r.rows[0]||{state:'IDLE',data:{}}; }
async function setSession(id,state,data={}){ await query(`INSERT INTO sessions(telegram_id,state,data,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(telegram_id) DO UPDATE SET state=$2,data=$3,updated_at=NOW()`,[id,state,JSON.stringify(data)]); }
async function clearSession(id){ await setSession(id,'IDLE',{}); }

// Users
async function upsertUser(tid,username,firstName,lastName){
  let code=genCode();
  while((await query('SELECT id FROM users WHERE refer_code=$1',[code])).rows.length){ code=genCode(); }
  const r=await query(`INSERT INTO users(telegram_id,username,first_name,last_name,refer_code) VALUES($1,$2,$3,$4,$5) ON CONFLICT(telegram_id) DO UPDATE SET username=$2,first_name=$3,last_name=$4,updated_at=NOW() RETURNING *`,[tid,username||null,firstName||null,lastName||null,code]);
  return r.rows[0];
}
async function getUser(tid){ return (await query('SELECT * FROM users WHERE telegram_id=$1',[tid])).rows[0]||null; }
async function getUserByCode(code){ return (await query('SELECT * FROM users WHERE refer_code=$1',[code.toUpperCase()])).rows[0]||null; }
async function getAllUsers(){ return (await query('SELECT * FROM users ORDER BY joined_at DESC')).rows; }
async function getUserCount(){ return parseInt((await query('SELECT COUNT(*) FROM users')).rows[0].count); }
async function setChannelVerified(tid,v){ await query('UPDATE users SET is_channel_verified=$2,updated_at=NOW() WHERE telegram_id=$1',[tid,v]); }
async function setReferred(tid,byId){ await query('UPDATE users SET referred_by=$2,pending_refer_code=NULL,updated_at=NOW() WHERE telegram_id=$1',[tid,byId]); }
async function setPendingRefer(tid,code){ await query('UPDATE users SET pending_refer_code=$2,updated_at=NOW() WHERE telegram_id=$1',[tid,code]); }
async function blockUser(tid,reason,until=null){ await query('UPDATE users SET is_blocked=true,block_reason=$2,block_until=$3,updated_at=NOW() WHERE telegram_id=$1',[tid,reason,until]); }
async function unblockUser(tid){ await query('UPDATE users SET is_blocked=false,is_temp_blocked=false,block_reason=null,block_until=null,updated_at=NOW() WHERE telegram_id=$1',[tid]); }
async function tempBlockUser(tid,reason,minutes){ const until=new Date(Date.now()+minutes*60000); await query('UPDATE users SET is_temp_blocked=true,block_reason=$2,block_until=$3,updated_at=NOW() WHERE telegram_id=$1',[tid,reason,until]); }
async function setVIP(tid,vip){ await query('UPDATE users SET is_vip=$2,updated_at=NOW() WHERE telegram_id=$1',[tid,vip]); }
async function addPoints(tid,pts,type,desc,refId=null){ await query('UPDATE users SET points=points+$2,total_earned=CASE WHEN $2>0 THEN total_earned+$2 ELSE total_earned END,updated_at=NOW() WHERE telegram_id=$1',[tid,pts]); await query('INSERT INTO point_transactions(user_id,type,points,description,ref_id) VALUES($1,$2,$3,$4,$5)',[tid,type,pts,desc,refId]); }
async function deductPoints(tid,pts,type,desc,refId=null){ await query('UPDATE users SET points=points-$2,total_withdrawn=total_withdrawn+$2,updated_at=NOW() WHERE telegram_id=$1',[tid,pts]); await query('INSERT INTO point_transactions(user_id,type,points,description,ref_id) VALUES($1,$2,$3,$4,$5)',[tid,type,-pts,desc,refId]); }
async function incReferrals(tid){ await query('UPDATE users SET total_referrals=total_referrals+1,updated_at=NOW() WHERE telegram_id=$1',[tid]); }

// Referrals
async function createReferral(referrerId,referredId,pts){ await query('INSERT INTO referrals(referrer_id,referred_id,points_earned) VALUES($1,$2,$3) ON CONFLICT(referred_id) DO NOTHING',[referrerId,referredId,pts]); }
async function getReferralsByUser(id){ return (await query('SELECT r.*,u.username,u.first_name FROM referrals r LEFT JOIN users u ON r.referred_id=u.telegram_id WHERE r.referrer_id=$1 ORDER BY r.created_at DESC',[id])).rows; }
async function getDailyReferrals(id){ return parseInt((await query("SELECT COUNT(*) FROM referrals WHERE referrer_id=$1 AND created_at>NOW()-INTERVAL '1 day'",[id])).rows[0].count); }

// Categories
async function getCategories(activeOnly=true){ const q=activeOnly?'SELECT * FROM categories WHERE is_active=true ORDER BY points_required':'SELECT * FROM categories ORDER BY points_required'; return (await query(q)).rows; }
async function getCategory(id){ return (await query('SELECT * FROM categories WHERE id=$1',[id])).rows[0]||null; }
async function addCategory(name,desc,pts,val,stock){ return (await query('INSERT INTO categories(name,description,points_required,voucher_value,stock) VALUES($1,$2,$3,$4,$5) RETURNING *',[name,desc,pts,val,stock])).rows[0]; }
async function updateCategory(id,fields){ const keys=Object.keys(fields); const sets=keys.map((k,i)=>`${k}=$${i+2}`).join(','); await query(`UPDATE categories SET ${sets} WHERE id=$1`,[id,...Object.values(fields)]); }
async function toggleCategory(id,active){ await query('UPDATE categories SET is_active=$2 WHERE id=$1',[id,active]); }
async function deleteCategory(id){ await query('DELETE FROM categories WHERE id=$1',[id]); }
async function addStock(catId,delta){ await query('UPDATE categories SET stock=stock+$2 WHERE id=$1',[catId,delta]); }

// Vouchers
async function addVoucher(catId,code){ try{ await query('INSERT INTO vouchers(category_id,code) VALUES($1,$2)',[catId,code]); await query('UPDATE categories SET stock=stock+1 WHERE id=$1',[catId]); return true; }catch(e){ return false; } }
async function addVouchersBulk(catId,codes){ let added=0; for(const c of codes){ const ok=await addVoucher(catId,c.trim()); if(ok) added++; } return added; }
async function getNextVoucher(catId){ return (await query('SELECT * FROM vouchers WHERE category_id=$1 AND is_used=false ORDER BY id ASC LIMIT 1',[catId])).rows[0]||null; }
async function markVoucherUsed(id,userId){ await query('UPDATE vouchers SET is_used=true,used_by=$2,used_at=NOW() WHERE id=$1',[id,userId]); await query('UPDATE categories SET stock=GREATEST(0,stock-1),total_redeemed=total_redeemed+1 WHERE id=(SELECT category_id FROM vouchers WHERE id=$1)',[id]); }
async function getVouchersByCategory(catId,used=null){ const q=used===null?'SELECT * FROM vouchers WHERE category_id=$1 ORDER BY id':used?'SELECT * FROM vouchers WHERE category_id=$1 AND is_used=true ORDER BY id':'SELECT * FROM vouchers WHERE category_id=$1 AND is_used=false ORDER BY id'; return (await query(q,[catId])).rows; }
async function deleteUnusedVouchers(catId){ const r=await query("DELETE FROM vouchers WHERE category_id=$1 AND is_used=false RETURNING id",[catId]); const cnt=r.rowCount; await query('UPDATE categories SET stock=GREATEST(0,stock-$2) WHERE id=$1',[catId,cnt]); return cnt; }

// Withdrawals
async function createWithdrawal(wdId,userId,catId,catName,pts){ return (await query('INSERT INTO withdrawals(withdrawal_id,user_id,category_id,category_name,points_used) VALUES($1,$2,$3,$4,$5) RETURNING *',[wdId,userId,catId,catName,pts])).rows[0]; }
async function getWithdrawal(wdId){ return (await query('SELECT * FROM withdrawals WHERE withdrawal_id=$1',[wdId])).rows[0]||null; }
async function getWithdrawalsByUser(uid){ return (await query('SELECT * FROM withdrawals WHERE user_id=$1 ORDER BY requested_at DESC',[uid])).rows; }
async function getPendingWithdrawals(){ return (await query("SELECT w.*,u.username,u.first_name,u.telegram_id as uid FROM withdrawals w LEFT JOIN users u ON w.user_id=u.telegram_id WHERE w.status='PENDING' ORDER BY w.requested_at ASC")).rows; }
async function approveWithdrawal(wdId,code){ await query("UPDATE withdrawals SET status='APPROVED',voucher_code=$2,processed_at=NOW() WHERE withdrawal_id=$1",[wdId,code]); }
async function rejectWithdrawal(wdId,reason){ await query("UPDATE withdrawals SET status='REJECTED',reject_reason=$2,processed_at=NOW() WHERE withdrawal_id=$1",[wdId,reason]); }
async function getWdStats(){ return (await query("SELECT COUNT(*) FILTER(WHERE status='PENDING') as pending, COUNT(*) FILTER(WHERE status='APPROVED') as approved, COUNT(*) FILTER(WHERE status='REJECTED') as rejected, COUNT(*) as total FROM withdrawals")).rows[0]; }

// Transactions
async function getTransactions(uid,limit=15){ return (await query('SELECT * FROM point_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',[uid,limit])).rows; }

// Broadcasts
async function saveBroadcast(msg,photo,target,sent,failed){ return (await query('INSERT INTO broadcasts(message,photo_file_id,target,sent_count,failed_count) VALUES($1,$2,$3,$4,$5) RETURNING *',[msg,photo,target,sent,failed])).rows[0]; }
async function getBroadcasts(limit=10){ return (await query('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT $1',[limit])).rows; }

// Settings
async function getSetting(key){ return (await query('SELECT value FROM settings WHERE key=$1',[key])).rows[0]?.value||null; }
async function setSetting(key,value){ await query('INSERT INTO settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=NOW()',[key,value]); }
async function getAllSettings(){ return (await query('SELECT * FROM settings ORDER BY key')).rows; }

// Stats
async function getStats(){ const u=await getUserCount(); const wd=await getWdStats(); const r=await query("SELECT SUM(CASE WHEN points>0 THEN points ELSE 0 END) as total_given, COUNT(*) FILTER(WHERE type='REFERRAL') as total_refs FROM point_transactions"); const c=await getCategories(false); return {...r.rows[0],users:u,...wd,categories:c.length}; }

async function initDatabase(){ const fs=require('fs'),path=require('path'); await pool.query(fs.readFileSync(path.join(__dirname,'init.sql'),'utf8')); }

module.exports = {
  query, pool, genCode, genWdId,
  getSession, setSession, clearSession,
  upsertUser, getUser, getUserByCode, getAllUsers, getUserCount,
  setChannelVerified, setReferred, setPendingRefer,
  blockUser, unblockUser, tempBlockUser, setVIP, addPoints, deductPoints, incReferrals,
  createReferral, getReferralsByUser, getDailyReferrals,
  getCategories, getCategory, addCategory, updateCategory, toggleCategory, deleteCategory, addStock,
  addVoucher, addVouchersBulk, getNextVoucher, markVoucherUsed, getVouchersByCategory, deleteUnusedVouchers,
  createWithdrawal, getWithdrawal, getWithdrawalsByUser, getPendingWithdrawals, approveWithdrawal, rejectWithdrawal, getWdStats,
  getTransactions, saveBroadcast, getBroadcasts, getSetting, setSetting, getAllSettings, getStats, initDatabase
};
