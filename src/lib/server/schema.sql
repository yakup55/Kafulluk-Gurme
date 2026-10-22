-- Kafulluk Gurme veritabanı şeması. Tekrar tekrar çalıştırılabilir (IF NOT EXISTS).
-- Uygulama ilk istekte bunu otomatik çalıştırır; scripts/seed-demo.mjs de kullanır.
CREATE TABLE IF NOT EXISTS products (
  id          text PRIMARY KEY,
  cat         text NOT NULL,
  name        text NOT NULL,
  w           text NOT NULL DEFAULT '',
  price       numeric(12,2) NOT NULL CHECK (price > 0),
  old         numeric(12,2) NOT NULL DEFAULT 0,
  type        text NOT NULL DEFAULT 'jar',
  c1          text NOT NULL DEFAULT '#E3A21A',
  c2          text NOT NULL DEFAULT '#7A4B00',
  origin      text NOT NULL DEFAULT '',
  descr       text NOT NULL DEFAULT '',
  store       text NOT NULL DEFAULT '',
  img         text NOT NULL DEFAULT '',
  inc         text[],
  stock       integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active      boolean NOT NULL DEFAULT true,
  sort        bigint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS order_no_seq START 100001;

CREATE TABLE IF NOT EXISTS orders (
  id            text PRIMARY KEY,
  no            text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'yeni'
                CHECK (status IN ('yeni','hazirlaniyor','kargoda','teslim','iptal')),
  status_at     timestamptz NOT NULL DEFAULT now(),
  customer      jsonb NOT NULL,
  sub           numeric(12,2) NOT NULL,
  disc          numeric(12,2) NOT NULL DEFAULT 0,
  ship          numeric(12,2) NOT NULL DEFAULT 0,
  fee           numeric(12,2) NOT NULL DEFAULT 0,
  total         numeric(12,2) NOT NULL,
  pay           text NOT NULL CHECK (pay IN ('cod','eft')),
  dlv           text NOT NULL CHECK (dlv IN ('std','fast')),
  coupon        text,
  cargo         jsonb NOT NULL DEFAULT '{"firm":"","track":""}',
  note          text NOT NULL DEFAULT '',
  stock_applied boolean NOT NULL DEFAULT true,
  source        text NOT NULL DEFAULT 'web',
  sample        boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

CREATE TABLE IF NOT EXISTS order_items (
  order_id  text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line      integer NOT NULL,
  pid       text,
  name      text NOT NULL,
  w         text NOT NULL DEFAULT '',
  price     numeric(12,2) NOT NULL,
  qty       integer NOT NULL CHECK (qty > 0),
  PRIMARY KEY (order_id, line)
);
CREATE INDEX IF NOT EXISTS order_items_pid_idx ON order_items (pid);

CREATE TABLE IF NOT EXISTS coupons (
  code    text PRIMARY KEY,
  pct     integer NOT NULL CHECK (pct BETWEEN 1 AND 90),
  min     numeric(12,2) NOT NULL DEFAULT 0,
  active  boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id          bigserial PRIMARY KEY,
  pid         text NOT NULL,
  delta       integer NOT NULL,
  reason      text NOT NULL,
  order_id    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_users (
  id          serial PRIMARY KEY,
  username    text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
  name        text NOT NULL DEFAULT '',
  pass_hash   text NOT NULL,
  role        text NOT NULL DEFAULT 'personel' CHECK (role IN ('yonetici','personel')),
  active      boolean NOT NULL DEFAULT true,
  session_ver integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_login  timestamptz
);

-- işlemi kimin yaptığı
ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS actor text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_by text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by text;
CREATE INDEX IF NOT EXISTS stock_moves_pid_idx ON stock_moves (pid, created_at DESC);

-- müşterinin satıcıya sorduğu sorular
CREATE TABLE IF NOT EXISTS questions (
  id           serial PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  pid          text,                       -- ürünle ilgiliyse ürün kodu (ürün silinse de soru kalır)
  product_name text NOT NULL DEFAULT '',
  name         text NOT NULL,
  contact      text NOT NULL,              -- e-posta ya da telefon
  question     text NOT NULL,
  answer       text NOT NULL DEFAULT '',
  answered_at  timestamptz,
  answered_by  text,
  public       boolean NOT NULL DEFAULT false,  -- yanıt ürün sayfasında görünsün mü
  ip           text
);
CREATE INDEX IF NOT EXISTS questions_created_idx ON questions (created_at DESC);
CREATE INDEX IF NOT EXISTS questions_pid_idx ON questions (pid) WHERE public;
