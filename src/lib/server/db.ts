import postgres from "postgres";
import seedProducts from "./seed-products.json";

/**
 * PostgreSQL bağlantısı.
 * DATABASE_URL ortam değişkeni zorunludur, örn:
 *   postgres://kullanici:sifre@sunucu:5432/kafulluk?sslmode=require
 * Şema ilk istekte otomatik oluşturulur, ürün tablosu boşsa örnek katalog yüklenir.
 */
export type Sql = postgres.Sql;

let _sql: Sql | undefined;
let _ready: Promise<void> | undefined;

function client(): Sql {
  if (_sql) return _sql;
  const url = process.env["DATABASE_URL"];
  if (!url) throw new HttpError(503, "Veritabanı yapılandırılmamış (DATABASE_URL).");
  _sql = postgres(url, {
    max: Number(process.env["DATABASE_POOL_MAX"] ?? 5),
    idle_timeout: 20,
    onnotice: () => {},
    types: {
      // numeric ve bigint değerlerini JS number olarak döndür
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (x: number) => String(x),
        parse: (x: string) => Number(x),
      },
      bigint: {
        to: 20,
        from: [20],
        serialize: (x: number) => String(x),
        parse: (x: string) => Number(x),
      },
    },
  });
  return _sql;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const SCHEMA = /* sql */ `
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
`;

async function migrate(sql: Sql) {
  await transaction(sql, async (tx) => {
    // Aynı anda açılan birden çok sunucu örneği şemayı iki kez kurmasın
    await tx`SELECT pg_advisory_xact_lock(724501)`;
    await tx.unsafe(SCHEMA);
    const n = (await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM products`)[0]?.n ?? 0;
    const s = (await tx<{ s: number }[]>`SELECT count(*)::int AS s FROM settings`)[0]?.s ?? 0;
    if (n === 0 && s === 0) {
      for (const p of seedProducts as SeedProduct[]) {
        await tx`
          INSERT INTO products (id, cat, name, w, price, old, type, c1, c2, origin, descr, store, inc, stock, active, sort)
          VALUES (${p.id}, ${p.cat}, ${p.name}, ${p.w}, ${p.price}, ${p.old || 0}, ${p.type}, ${p.c1}, ${p.c2},
                  ${p.origin}, ${p.desc}, ${p.store}, ${p.inc ?? null}, ${p.stock}, ${p.active}, ${p.sort})`;
      }
      await tx`INSERT INTO coupons (code, pct, min, active) VALUES ('KAHVALTI10', 10, 0, true) ON CONFLICT DO NOTHING`;
      await tx`INSERT INTO settings (key, value) VALUES ('store', ${tx.json({})}) ON CONFLICT DO NOTHING`;
    }
  });
}

type SeedProduct = {
  id: string;
  cat: string;
  name: string;
  w: string;
  price: number;
  old: number;
  type: string;
  c1: string;
  c2: string;
  origin: string;
  desc: string;
  store: string;
  inc?: string[];
  stock: number;
  active: boolean;
  sort: number;
};

/** Şemanın hazır olduğunu garanti eden bağlantıyı döndürür. */
export async function db(): Promise<Sql> {
  const sql = client();
  if (!_ready) {
    _ready = migrate(sql).catch((e) => {
      _ready = undefined;
      throw e;
    });
  }
  await _ready;
  return sql;
}

/** İşlem içindeki bağlantı. (postgres.js TransactionSql tipi TS'de çağrılamadığı için Sql olarak kullanılır.) */
export type Tx = Sql;

export function transaction<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin((t) => fn(t as unknown as Tx)) as Promise<T>;
}
