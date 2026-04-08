require('dotenv').config();
module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMIN_ID: parseInt(process.env.ADMIN_ID) || 8004114088,
  BOT_NAME: 'Shein Free Vouchers',
  BOT_USERNAME: 'SheinFreeVouchersHub_Bot',
  BRAND: 'SHEIN',
  BRAND_EMOJI: '👗',
  CHANNELS: [
    { id: process.env.MAIN_CHANNEL_ID || '-100XXXXXXXXXX', link: 'https://t.me/SheinVoucherHub', name: 'Shein Voucher Hub' },
    { id: process.env.NOTIFY_CHANNEL_ID || '-1002862139182', link: 'https://t.me/OrdersNotify', name: 'Orders Notify' }
  ],
  NOTIFY_CHANNEL_ID: process.env.NOTIFY_CHANNEL_ID || '-1002862139182',
  ORDER_PREFIX: 'SHN',
  VERIFY_URL: process.env.VERIFY_URL || 'https://freesheinvoucherverify.rf.gd',
};
