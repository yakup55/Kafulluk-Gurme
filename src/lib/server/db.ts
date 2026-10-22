import postgres from "postgres";
import seedProducts from "./seed-products.json";
import schemaSql from "./schema.sql?raw";

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

const SCHEMA = schemaSql;

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
