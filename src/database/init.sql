CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  referred_by BIGINT DEFAULT NULL,
  refer_code VARCHAR(20) UNIQUE NOT NULL,
  pending_refer_code VARCHAR(20) DEFAULT NULL,
  points DECIMAL(10,2) DEFAULT 0,
  total_earned DECIMAL(10,2) DEFAULT 0,
  total_withdrawn DECIMAL(10,2) DEFAULT 0,
  total_referrals INT DEFAULT 0,
  is_channel_verified BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE,
  is_temp_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  block_until TIMESTAMP,
  is_vip BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  telegram_id BIGINT PRIMARY KEY,
  state VARCHAR(100) DEFAULT 'IDLE',
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  points_required DECIMAL(10,2) NOT NULL DEFAULT 100,
  voucher_value VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  stock INT DEFAULT 0,
  total_redeemed INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vouchers (
  id SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_by BIGINT DEFAULT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(category_id, code)
);

CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  referrer_id BIGINT NOT NULL,
  referred_id BIGINT NOT NULL,
  points_earned DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(referred_id)
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  withdrawal_id VARCHAR(30) UNIQUE NOT NULL,
  user_id BIGINT NOT NULL,
  category_id INT REFERENCES categories(id),
  category_name VARCHAR(100),
  points_used DECIMAL(10,2) NOT NULL,
  voucher_code TEXT,
  status VARCHAR(20) DEFAULT 'PENDING',
  reject_reason TEXT,
  admin_note TEXT,
  requested_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type VARCHAR(30) NOT NULL,
  points DECIMAL(10,2) NOT NULL,
  description TEXT,
  ref_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id SERIAL PRIMARY KEY,
  message TEXT,
  photo_file_id TEXT,
  target VARCHAR(20) DEFAULT 'ALL',
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('points_per_refer', '50'),
  ('min_withdrawal_points', '100'),
  ('maintenance_mode', 'false'),
  ('maintenance_message', '🔧 Bot is under maintenance. Please try again later.'),
  ('withdrawal_auto_approve', 'false'),
  ('referral_bonus_enabled', 'true'),
  ('max_daily_referrals', '20')
ON CONFLICT (key) DO NOTHING;

INSERT INTO categories (name, description, points_required, voucher_value, stock) VALUES
  ('₹500 Voucher', 'Shein 100% OFF up to ₹500', 500, '₹500', 100),
  ('₹1000 Voucher', 'Shein 100% OFF up to ₹1000', 1000, '₹1000', 50),
  ('₹2000 Voucher', 'Shein 100% OFF up to ₹2000', 2000, '₹2000', 25)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_users_tid ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_code ON users(refer_code);
CREATE INDEX IF NOT EXISTS idx_ref_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_wd_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_wd_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_cat ON vouchers(category_id, is_used);
CREATE INDEX IF NOT EXISTS idx_ptx_user ON point_transactions(user_id);
