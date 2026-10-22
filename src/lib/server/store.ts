import { z } from "zod";
import { hashPassword, verifyPassword } from "./auth";
import { db, HttpError, transaction, type Sql, type Tx } from "./db";

/* ================= ortak tipler ve dönüştürücüler ================= */

export const DEFAULT_SETTINGS = {
  name: "Kafulluk Gurme",
  phone: "",
  email: "",
  address: "",
  hours: "",
  whatsapp: "",
  iban: "",
  freeAt: 750,
  ship: 59.9,
  fast: 99.9,
  cod: 19.9,
  lowStock: 5,
};
export type Settings = typeof DEFAULT_SETTINGS;

const round2 = (n: number) => Math.round(n * 100) / 100;

type ProductRow = {
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
  descr: string;
  store: string;
  img: string;
  inc: string[] | null;
  stock: number;
  active: boolean;
  sort: number;
};

function productOut(r: ProductRow) {
  return {
    id: r.id,
    cat: r.cat,
    name: r.name,
    w: r.w,
    price: r.price,
    old: r.old,
    type: r.type,
    c1: r.c1,
    c2: r.c2,
    origin: r.origin,
    desc: r.descr,
    store: r.store,
    img: r.img,
    inc: r.inc && r.inc.length ? r.inc : null,
    stock: r.stock,
    active: r.active,
    sort: r.sort,
  };
}

type OrderRow = {
  id: string;
  no: string;
  created_at: Date;
  status: string;
  status_at: Date;
  customer: Record<string, string>;
  sub: number;
  disc: number;
  ship: number;
  fee: number;
  total: number;
  pay: string;
  dlv: string;
  coupon: string | null;
  cargo: { firm: string; track: string };
  note: string;
  stock_applied: boolean;
  source: string;
  sample: boolean;
  status_by: string | null;
  created_by: string | null;
  items: { pid: string | null; name: string; w: string; price: number; qty: number }[];
};

function orderOut(r: OrderRow) {
  return {
    id: r.id,
    no: r.no,
    createdAt: r.created_at.getTime(),
    status: r.status,
    statusAt: r.status_at.getTime(),
    customer: r.customer,
    items: r.items ?? [],
    sub: r.sub,
    disc: r.disc,
    ship: r.ship,
    fee: r.fee,
    total: r.total,
    pay: r.pay,
    dlv: r.dlv,
    coupon: r.coupon,
    cargo: r.cargo,
    note: r.note,
    stockApplied: r.stock_applied,
    source: r.source,
    sample: r.sample,
    statusBy: r.status_by,
    createdBy: r.created_by,
  };
}

async function getSettings(sql: Sql): Promise<Settings> {
  const rows = await sql<
    { value: Partial<Settings> }[]
  >`SELECT value FROM settings WHERE key = 'store'`;
  const v = rows[0]?.value ?? {};
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const [k, val] of Object.entries(v))
    if (val !== null && val !== "" && val !== undefined) out[k] = val;
  return out as Settings;
}

const ORDER_SELECT = (where: string) => `
  SELECT o.*, COALESCE(
    (SELECT json_agg(json_build_object('pid', i.pid, 'name', i.name, 'w', i.w, 'price', i.price::float8, 'qty', i.qty) ORDER BY i.line)
       FROM order_items i WHERE i.order_id = o.id), '[]') AS items
  FROM orders o ${where}`;

/* ================= stok hareketleri ================= */

type Line = { pid: string | null; qty: number };

/** Satırlardaki ürünlerin stoğunu atomik olarak düşer; yetmezse işlemi iptal eder. */
async function takeStock(
  tx: Tx,
  lines: Line[],
  reason: string,
  orderId: string | null,
  requireActive: boolean,
  actor: string | null = null,
) {
  const need = new Map<string, number>();
  for (const l of lines) if (l.pid) need.set(l.pid, (need.get(l.pid) ?? 0) + l.qty);
  // Kilitlenmeyi önlemek için hep aynı sırada güncelle
  for (const pid of [...need.keys()].sort()) {
    const qty = need.get(pid)!;
    const upd = requireActive
      ? await tx`UPDATE products SET stock = stock - ${qty}, updated_at = now() WHERE id = ${pid} AND active AND stock >= ${qty} RETURNING id`
      : await tx`UPDATE products SET stock = stock - ${qty}, updated_at = now() WHERE id = ${pid} AND stock >= ${qty} RETURNING id`;
    if (!upd.length) {
      const [p] = await tx<
        { name: string; stock: number; active: boolean }[]
      >`SELECT name, stock, active FROM products WHERE id = ${pid}`;
      if (!p)
        throw new HttpError(409, "Sepetteki bir ürün artık satışta değil.", { code: "gone", pid });
      if (requireActive && !p.active)
        throw new HttpError(409, `${p.name} şu an satışta değil.`, { code: "inactive", pid });
      throw new HttpError(
        409,
        p.stock > 0 ? `${p.name} için yalnızca ${p.stock} adet stok kaldı.` : `${p.name} tükendi.`,
        { code: "stock", pid, stock: p.stock },
      );
    }
    await tx`INSERT INTO stock_moves (pid, delta, reason, order_id, actor) VALUES (${pid}, ${-qty}, ${reason}, ${orderId}, ${actor})`;
  }
}

/** Stoğu geri ekler (iptal / silme). Silinmiş ürünler atlanır. */
async function returnStock(
  tx: Tx,
  lines: Line[],
  reason: string,
  orderId: string | null,
  actor: string | null = null,
) {
  const back = new Map<string, number>();
  for (const l of lines) if (l.pid) back.set(l.pid, (back.get(l.pid) ?? 0) + l.qty);
  for (const pid of [...back.keys()].sort()) {
    const qty = back.get(pid)!;
    const upd =
      await tx`UPDATE products SET stock = stock + ${qty}, updated_at = now() WHERE id = ${pid} RETURNING id`;
    if (upd.length)
      await tx`INSERT INTO stock_moves (pid, delta, reason, order_id, actor) VALUES (${pid}, ${qty}, ${reason}, ${orderId}, ${actor})`;
  }
}

async function orderLines(tx: Tx, orderId: string): Promise<Line[]> {
  return tx<Line[]>`SELECT pid, qty FROM order_items WHERE order_id = ${orderId}`;
}

async function insertOrder(
  tx: Tx,
  o: {
    id: string;
    no?: string | undefined;
    createdAt?: number | undefined;
    status?: string | undefined;
    customer: Record<string, string>;
    items: { pid: string | null; name: string; w: string; price: number; qty: number }[];
    sub: number;
    disc: number;
    ship: number;
    fee: number;
    total: number;
    pay: string;
    dlv: string;
    coupon?: string | null | undefined;
    cargo?: { firm: string; track: string } | undefined;
    note?: string | undefined;
    stockApplied: boolean;
    source: string;
    sample?: boolean | undefined;
  },
) {
  const no = o.no || "KG-" + (await tx<{ n: number }[]>`SELECT nextval('order_no_seq') AS n`)[0]!.n;
  const created = o.createdAt ? new Date(o.createdAt) : new Date();
  await tx`
    INSERT INTO orders (id, no, created_at, status, status_at, customer, sub, disc, ship, fee, total, pay, dlv,
                        coupon, cargo, note, stock_applied, source, sample)
    VALUES (${o.id}, ${no}, ${created}, ${o.status ?? "yeni"}, now(), ${tx.json(o.customer)}, ${o.sub}, ${o.disc},
            ${o.ship}, ${o.fee}, ${o.total}, ${o.pay}, ${o.dlv}, ${o.coupon ?? null},
            ${tx.json(o.cargo ?? { firm: "", track: "" })}, ${o.note ?? ""}, ${o.stockApplied}, ${o.source}, ${!!o.sample})`;
  let line = 0;
  for (const it of o.items) {
    await tx`INSERT INTO order_items (order_id, line, pid, name, w, price, qty)
             VALUES (${o.id}, ${line++}, ${it.pid}, ${it.name}, ${it.w}, ${it.price}, ${it.qty})`;
  }
  return no;
}

/* ================= VİTRİN ================= */

export async function publicStore() {
  const sql = await db();
  const [rows, s] = await Promise.all([
    sql<ProductRow[]>`SELECT * FROM products WHERE active ORDER BY sort, name`,
    getSettings(sql),
  ]);
  const { lowStock: _l, ...pub } = s;
  return { products: rows.map(productOut), settings: pub };
}

export async function checkCoupon(code: string, sub: number) {
  const sql = await db();
  const c = (
    await sql<{ code: string; pct: number; min: number }[]>`
    SELECT code, pct, min FROM coupons WHERE code = ${code.trim().toUpperCase()} AND active`
  )[0];
  if (!c) throw new HttpError(404, "Bu kupon kodu geçerli değil.");
  if (sub < c.min)
    throw new HttpError(422, `Bu kupon en az ${c.min} ₺ tutarındaki sepetlerde geçerli.`);
  return c;
}

const phoneOk = (v: string) => {
  const d = v.replace(/\D/g, "");
  return (
    d.length === 10 || (d.length === 11 && d[0] === "0") || (d.length === 12 && d.startsWith("90"))
  );
};

export const webOrderSchema = z.object({
  customer: z.object({
    name: z
      .string()
      .trim()
      .min(5)
      .max(120)
      .refine((v) => v.split(/\s+/).length >= 2, "ad ve soyad gerekli"),
    phone: z.string().trim().max(30).refine(phoneOk, "geçerli telefon gerekli"),
    email: z.string().trim().email().max(160),
    city: z.string().trim().min(2).max(60),
    dist: z.string().trim().min(2).max(60),
    addr: z.string().trim().min(15).max(500),
    note: z.string().trim().max(500).optional().default(""),
  }),
  items: z
    .array(z.object({ id: z.string().min(1).max(80), qty: z.number().int().min(1).max(20) }))
    .min(1)
    .max(40),
  coupon: z.string().trim().max(40).optional().nullable(),
  dlv: z.enum(["std", "fast"]),
  pay: z.enum(["cod", "eft"]),
  /** Müşterinin ekranda gördüğü toplam; sunucu farklı hesaplarsa sipariş reddedilir */
  expectedTotal: z.number().optional(),
});

/** Müşteri siparişi: fiyatlar ve ücretler veritabanından hesaplanır, stok aynı işlemde düşülür. */
export async function placeWebOrder(input: z.infer<typeof webOrderSchema>) {
  const sql = await db();
  return transaction(sql, async (tx) => {
    const s = await getSettings(tx);
    const qty = new Map<string, number>();
    for (const it of input.items) qty.set(it.id, Math.min(20, (qty.get(it.id) ?? 0) + it.qty));
    const ids = [...qty.keys()];
    const prods = await tx<ProductRow[]>`SELECT * FROM products WHERE id IN ${tx(ids)}`;
    const byId = new Map(prods.map((p) => [p.id, p]));

    const items = ids.map((id) => {
      const p = byId.get(id);
      if (!p || !p.active)
        throw new HttpError(
          409,
          "Sepetteki bir ürün artık satışta değil. Sepetinizi kontrol edin.",
          { code: "gone", pid: id },
        );
      return { pid: p.id, name: p.name, w: p.w, price: p.price, qty: qty.get(id)! };
    });

    const sub = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
    let disc = 0;
    let coupon: string | null = null;
    if (input.coupon) {
      const c = (
        await tx<{ code: string; pct: number; min: number }[]>`
        SELECT code, pct, min FROM coupons WHERE code = ${input.coupon.toUpperCase()} AND active`
      )[0];
      if (!c) throw new HttpError(422, "Kupon kodu artık geçerli değil.", { code: "coupon" });
      if (sub >= c.min) {
        disc = round2((sub * c.pct) / 100);
        coupon = c.code;
      }
    }
    const after = sub - disc;
    const ship = input.dlv === "fast" ? +s.fast : after >= +s.freeAt ? 0 : +s.ship;
    const fee = input.pay === "cod" ? +s.cod : 0;
    const total = round2(after + ship + fee);

    if (input.expectedTotal != null && Math.abs(input.expectedTotal - total) > 0.009) {
      throw new HttpError(
        409,
        "Fiyatlar güncellendi. Lütfen sipariş özetini kontrol edip tekrar onaylayın.",
        {
          code: "price_changed",
          total,
        },
      );
    }

    const id = crypto.randomUUID();
    await takeStock(tx, items, "web-siparis", id, true);
    const no = await insertOrder(tx, {
      id,
      customer: input.customer,
      items,
      sub,
      disc,
      ship,
      fee,
      total,
      pay: input.pay,
      dlv: input.dlv,
      coupon,
      stockApplied: true,
      source: "web",
    });
    return {
      no,
      items,
      sub,
      disc,
      ship,
      fee,
      total,
      pay: input.pay,
      dlv: input.dlv,
      iban: s.iban,
      whatsapp: s.whatsapp,
    };
  });
}

/* ================= SATICI PANELİ ================= */

export async function adminData() {
  const sql = await db();
  const [products, orders, coupons, settings, questions] = await Promise.all([
    sql<ProductRow[]>`SELECT * FROM products ORDER BY sort, name`,
    sql.unsafe<OrderRow[]>(ORDER_SELECT("ORDER BY o.created_at DESC LIMIT 2000")),
    sql`SELECT code, pct, min, active FROM coupons ORDER BY code`,
    sql<{ value: Partial<Settings> }[]>`SELECT value FROM settings WHERE key = 'store'`,
    sql<
      QuestionRow[]
    >`SELECT * FROM questions ORDER BY (answer = '') DESC, created_at DESC LIMIT 1000`,
  ]);
  return {
    products: products.map(productOut),
    orders: orders.map(orderOut),
    coupons,
    settings: settings[0]?.value ?? {},
    questions: questions.map(questionOut),
  };
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  cat: z.string().trim().min(1).max(60),
  w: z.string().trim().max(40).default(""),
  price: z.number().positive().max(1_000_000),
  old: z.number().min(0).max(1_000_000).default(0),
  stock: z.number().int().min(0).max(1_000_000),
  origin: z.string().trim().max(60).default(""),
  desc: z.string().trim().max(1000).default(""),
  store: z.string().trim().max(300).default(""),
  img: z.string().trim().max(500).default(""),
  type: z
    .enum(["jar", "bottle", "cheese", "olives", "sausage", "pack", "tub", "box"])
    .default("jar"),
  c1: hex.default("#E3A21A"),
  c2: hex.default("#7A4B00"),
  active: z.boolean().default(true),
  inc: z.array(z.string()).max(20).nullable().optional(),
  sort: z.number().optional(),
});
const productId = z.string().regex(/^[a-z0-9-]{1,80}$/, "geçersiz ürün kodu");

export async function putProduct(id: string, data: z.infer<typeof productSchema>, actor: string) {
  productId.parse(id);
  const sql = await db();
  return transaction(sql, async (tx) => {
    const prev = (
      await tx<{ stock: number }[]>`SELECT stock FROM products WHERE id = ${id} FOR UPDATE`
    )[0];
    const sort = data.sort ?? Date.now();
    await tx`
      INSERT INTO products (id, cat, name, w, price, old, type, c1, c2, origin, descr, store, img, inc, stock, active, sort)
      VALUES (${id}, ${data.cat}, ${data.name}, ${data.w}, ${data.price}, ${data.old > data.price ? data.old : 0},
              ${data.type}, ${data.c1}, ${data.c2}, ${data.origin}, ${data.desc}, ${data.store}, ${data.img},
              ${data.inc && data.inc.length ? data.inc : null}, ${data.stock}, ${data.active}, ${sort})
      ON CONFLICT (id) DO UPDATE SET
        cat = EXCLUDED.cat, name = EXCLUDED.name, w = EXCLUDED.w, price = EXCLUDED.price, old = EXCLUDED.old,
        type = EXCLUDED.type, c1 = EXCLUDED.c1, c2 = EXCLUDED.c2, origin = EXCLUDED.origin, descr = EXCLUDED.descr,
        store = EXCLUDED.store, img = EXCLUDED.img, inc = EXCLUDED.inc, stock = EXCLUDED.stock,
        active = EXCLUDED.active, sort = COALESCE(${data.sort ?? null}::bigint, products.sort), updated_at = now()`;
    const delta = data.stock - (prev?.stock ?? 0);
    if (delta)
      await tx`INSERT INTO stock_moves (pid, delta, reason, actor) VALUES (${id}, ${delta}, 'panel-duzenleme', ${actor})`;
    return { ok: true };
  });
}

export async function patchProduct(id: string, patch: { active?: boolean }) {
  const sql = await db();
  const r =
    await sql`UPDATE products SET active = ${!!patch.active}, updated_at = now() WHERE id = ${id} RETURNING id`;
  if (!r.length) throw new HttpError(404, "Ürün bulunamadı.");
  return { ok: true };
}

export async function deleteProduct(id: string) {
  const sql = await db();
  await sql`DELETE FROM products WHERE id = ${id}`;
  return { ok: true };
}

/** Panelden +/- stok: istemcinin gördüğü değere değil, veritabanındaki güncel değere göre çalışır. */
export async function adjustStock(id: string, delta: number, actor: string) {
  const sql = await db();
  return transaction(sql, async (tx) => {
    const r = await tx<{ stock: number }[]>`
      UPDATE products SET stock = GREATEST(0, stock + ${delta}), updated_at = now() WHERE id = ${id} RETURNING stock`;
    if (!r.length) throw new HttpError(404, "Ürün bulunamadı.");
    await tx`INSERT INTO stock_moves (pid, delta, reason, actor) VALUES (${id}, ${delta}, 'panel-stok', ${actor})`;
    return { ok: true, stock: r[0]!.stock };
  });
}

const money = z.number().min(0).max(10_000_000);
export const adminOrderSchema = z.object({
  no: z.string().trim().max(40).optional().default(""),
  createdAt: z.number().optional(),
  status: z.enum(["yeni", "hazirlaniyor", "kargoda", "teslim", "iptal"]).default("yeni"),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(30).default(""),
    email: z.string().trim().max(160).default(""),
    city: z.string().trim().max(60).default(""),
    dist: z.string().trim().max(60).default(""),
    addr: z.string().trim().max(500).default(""),
    note: z.string().trim().max(500).default(""),
  }),
  items: z
    .array(
      z.object({
        pid: z.string().nullable().optional(),
        name: z.string().max(160),
        w: z.string().max(40).default(""),
        price: money,
        qty: z.number().int().min(1).max(1000),
      }),
    )
    .min(1)
    .max(60),
  disc: money.default(0),
  ship: money.default(0),
  fee: money.default(0),
  pay: z.enum(["cod", "eft"]),
  dlv: z.enum(["std", "fast"]),
  cargo: z.object({ firm: z.string().max(60), track: z.string().max(80) }).optional(),
  note: z.string().max(1000).optional(),
  stockApplied: z.boolean().default(true),
  sample: z.boolean().optional(),
});

/** Telefon/WhatsApp siparişini panelden kaydet. */
export async function createAdminOrder(
  id: string,
  o: z.infer<typeof adminOrderSchema>,
  actor: string,
) {
  const sql = await db();
  return transaction(sql, async (tx) => {
    const items = o.items.map((i) => ({
      pid: i.pid ?? null,
      name: i.name,
      w: i.w,
      price: i.price,
      qty: i.qty,
    }));
    const sub = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
    const disc = Math.min(o.disc, sub);
    const total = round2(sub - disc + o.ship + o.fee);
    const applyStock = o.stockApplied && !o.sample && o.status !== "iptal";
    if (applyStock) await takeStock(tx, items, "panel-siparis", id, false, actor);
    const no = await insertOrder(tx, {
      id,
      no: o.no || undefined,
      createdAt: o.createdAt,
      status: o.status,
      customer: o.customer,
      items,
      sub,
      disc,
      ship: o.ship,
      fee: o.fee,
      total,
      pay: o.pay,
      dlv: o.dlv,
      cargo: o.cargo,
      note: o.note,
      stockApplied: applyStock,
      source: o.sample ? "ornek" : "panel",
      sample: o.sample,
    }).catch((e) => {
      if (String(e?.code) === "23505")
        throw new HttpError(409, "Bu sipariş numarası zaten kayıtlı.");
      throw e;
    });
    await tx`UPDATE orders SET created_by = ${actor} WHERE id = ${id}`;
    return { ok: true, no };
  });
}

export const orderPatchSchema = z.object({
  status: z.enum(["yeni", "hazirlaniyor", "kargoda", "teslim", "iptal"]).optional(),
  cargo: z.object({ firm: z.string().max(60), track: z.string().max(80) }).optional(),
  note: z.string().max(1000).optional(),
});

/** Durum değişikliği: iptal edilince stok geri eklenir, iptalden geri alınınca tekrar düşülür. */
export async function patchOrder(id: string, p: z.infer<typeof orderPatchSchema>, actor: string) {
  const sql = await db();
  return transaction(sql, async (tx) => {
    const o = (
      await tx<{ status: string; stock_applied: boolean; sample: boolean }[]>`
      SELECT status, stock_applied, sample FROM orders WHERE id = ${id} FOR UPDATE`
    )[0];
    if (!o) throw new HttpError(404, "Sipariş bulunamadı.");
    let stockApplied = o.stock_applied;
    if (p.status && p.status !== o.status) {
      if (p.status === "iptal" && o.stock_applied) {
        await returnStock(tx, await orderLines(tx, id), "iptal", id, actor);
        stockApplied = false;
      } else if (o.status === "iptal" && !o.stock_applied && !o.sample) {
        await takeStock(tx, await orderLines(tx, id), "iptal-geri-alindi", id, false, actor);
        stockApplied = true;
      }
      await tx`UPDATE orders SET status = ${p.status}, status_at = now(), stock_applied = ${stockApplied}, status_by = ${actor} WHERE id = ${id}`;
    }
    if (p.cargo) await tx`UPDATE orders SET cargo = ${tx.json(p.cargo)} WHERE id = ${id}`;
    if (p.note !== undefined) await tx`UPDATE orders SET note = ${p.note} WHERE id = ${id}`;
    return { ok: true };
  });
}

export async function deleteOrder(id: string, actor: string) {
  const sql = await db();
  return transaction(sql, async (tx) => {
    const o = (
      await tx<
        { stock_applied: boolean }[]
      >`SELECT stock_applied FROM orders WHERE id = ${id} FOR UPDATE`
    )[0];
    if (!o) return { ok: true };
    if (o.stock_applied)
      await returnStock(tx, await orderLines(tx, id), "siparis-silindi", id, actor);
    await tx`DELETE FROM orders WHERE id = ${id}`;
    return { ok: true };
  });
}

export const couponSchema = z.object({
  pct: z.number().int().min(1).max(90),
  min: z.number().min(0).default(0),
  active: z.boolean().default(true),
});
const couponCode = z.string().regex(/^[A-Z0-9_-]{3,40}$/, "geçersiz kupon kodu");

export async function putCoupon(code: string, c: z.infer<typeof couponSchema>) {
  couponCode.parse(code);
  const sql = await db();
  await sql`INSERT INTO coupons (code, pct, min, active) VALUES (${code}, ${c.pct}, ${c.min}, ${c.active})
            ON CONFLICT (code) DO UPDATE SET pct = EXCLUDED.pct, min = EXCLUDED.min, active = EXCLUDED.active`;
  return { ok: true };
}
export async function patchCoupon(code: string, active: boolean) {
  const sql = await db();
  await sql`UPDATE coupons SET active = ${active} WHERE code = ${code}`;
  return { ok: true };
}
export async function deleteCoupon(code: string) {
  const sql = await db();
  await sql`DELETE FROM coupons WHERE code = ${code}`;
  return { ok: true };
}

export const settingsSchema = z.object({
  name: z.string().max(80).default(""),
  phone: z.string().max(40).default(""),
  email: z.string().max(160).default(""),
  whatsapp: z
    .string()
    .regex(/^\d{0,15}$/)
    .default(""),
  address: z.string().max(300).default(""),
  hours: z.string().max(120).default(""),
  iban: z.string().max(60).default(""),
  freeAt: z.number().min(0),
  ship: z.number().min(0),
  fast: z.number().min(0),
  cod: z.number().min(0),
  lowStock: z.number().int().min(0),
});
export async function putSettings(s: z.infer<typeof settingsSchema>) {
  const sql = await db();
  await sql`INSERT INTO settings (key, value) VALUES ('store', ${sql.json(s)})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return { ok: true };
}

/** Eski tarayıcı (localStorage) yedeğini veritabanına aktarır. Mevcut verinin yerine geçer. */
export async function importBackup(data: {
  products: Record<string, Record<string, unknown>>;
  orders: Record<string, Record<string, unknown>>;
  coupons?: Record<string, Record<string, unknown>> | undefined;
  settings?: Record<string, Record<string, unknown>> | undefined;
}) {
  const sql = await db();
  return transaction(sql, async (tx) => {
    await tx`DELETE FROM order_items`;
    await tx`DELETE FROM orders`;
    await tx`DELETE FROM products`;
    await tx`DELETE FROM coupons`;
    for (const [id, raw] of Object.entries(data.products)) {
      const p = productSchema.parse(raw);
      await tx`INSERT INTO products (id, cat, name, w, price, old, type, c1, c2, origin, descr, store, img, inc, stock, active, sort)
        VALUES (${productId.parse(id)}, ${p.cat}, ${p.name}, ${p.w}, ${p.price}, ${p.old}, ${p.type}, ${p.c1}, ${p.c2},
                ${p.origin}, ${p.desc}, ${p.store}, ${p.img}, ${p.inc && p.inc.length ? p.inc : null}, ${p.stock}, ${p.active}, ${p.sort ?? 0})`;
    }
    for (const [id, raw] of Object.entries(data.orders)) {
      const o = adminOrderSchema.parse(raw);
      const r = raw as { sub?: number; total?: number; statusAt?: number; stockApplied?: boolean };
      const items = o.items.map((i) => ({
        pid: i.pid ?? null,
        name: i.name,
        w: i.w,
        price: i.price,
        qty: i.qty,
      }));
      const sub = r.sub ?? round2(items.reduce((a, i) => a + i.price * i.qty, 0));
      await insertOrder(tx, {
        id: id.slice(0, 80),
        no: o.no || undefined,
        createdAt: o.createdAt,
        status: o.status,
        customer: o.customer,
        items,
        sub,
        disc: o.disc,
        ship: o.ship,
        fee: o.fee,
        total: r.total ?? round2(sub - o.disc + o.ship + o.fee),
        pay: o.pay,
        dlv: o.dlv,
        cargo: o.cargo,
        note: o.note,
        stockApplied: !!r.stockApplied,
        source: o.sample ? "ornek" : "yedek",
        sample: o.sample,
      });
    }
    for (const [code, raw] of Object.entries(data.coupons ?? {})) {
      const c = couponSchema.parse(raw);
      await tx`INSERT INTO coupons (code, pct, min, active) VALUES (${couponCode.parse(code)}, ${c.pct}, ${c.min}, ${c.active})`;
    }
    const st = data.settings?.["store"];
    if (st)
      await tx`INSERT INTO settings (key, value) VALUES ('store', ${tx.json(settingsSchema.partial().parse(st) as never)})
                     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    return { ok: true };
  });
}

/* ================= KULLANICILAR ================= */

export const ROLES = ["yonetici", "personel"] as const;
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,32}$/,
    "3-32 karakter olmalı; yalnızca harf, rakam ve . _ - kullanılabilir",
  );

export const newUserSchema = z.object({
  username,
  name: z.string().trim().min(2).max(60),
  role: z.enum(ROLES),
  password: z.string().min(8, "şifre en az 8 karakter").max(200),
});
export const userPatchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, "şifre en az 8 karakter").max(200).optional(),
});

type UserListRow = {
  id: number;
  username: string;
  name: string;
  role: string;
  active: boolean;
  created_at: Date;
  last_login: Date | null;
};

export async function listUsers() {
  const sql = await db();
  const rows = await sql<UserListRow[]>`
    SELECT id, username, name, role, active, created_at, last_login FROM admin_users ORDER BY role, username`;
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role,
    active: r.active,
    createdAt: r.created_at.getTime(),
    lastLogin: r.last_login ? r.last_login.getTime() : null,
  }));
}

export async function createUser(u: z.infer<typeof newUserSchema>) {
  const sql = await db();
  const r = await sql`
    INSERT INTO admin_users (username, name, pass_hash, role)
    VALUES (${u.username}, ${u.name}, ${await hashPassword(u.password)}, ${u.role})
    ON CONFLICT (username) DO NOTHING RETURNING id`;
  if (!r.length) throw new HttpError(409, "Bu kullanıcı adı zaten kullanılıyor.");
  return { ok: true };
}

/** Son aktif yöneticinin yetkisini alma / pasife alma / silme engellenir. */
async function assertKeepsOwner(tx: Tx, id: number) {
  const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM admin_users WHERE role = 'yonetici' AND active AND id <> ${id}`;
  if (n === 0) throw new HttpError(409, "En az bir aktif yönetici kalmalı.");
}

export async function updateUser(
  id: number,
  p: z.infer<typeof userPatchSchema>,
  me: { id: number },
) {
  const sql = await db();
  return transaction(sql, async (tx) => {
    const u = (
      await tx<{ role: string; active: boolean }[]>`
      SELECT role, active FROM admin_users WHERE id = ${id} FOR UPDATE`
    )[0];
    if (!u) throw new HttpError(404, "Kullanıcı bulunamadı.");
    if (id === me.id && (p.active === false || p.role === "personel"))
      throw new HttpError(409, "Kendi hesabınızı pasife alamaz ya da yetkinizi düşüremezsiniz.");
    const losesOwner =
      u.role === "yonetici" && u.active && (p.active === false || p.role === "personel");
    if (losesOwner) await assertKeepsOwner(tx, id);
    if (p.name !== undefined) await tx`UPDATE admin_users SET name = ${p.name} WHERE id = ${id}`;
    if (p.role !== undefined) await tx`UPDATE admin_users SET role = ${p.role} WHERE id = ${id}`;
    if (p.active !== undefined)
      await tx`UPDATE admin_users SET active = ${p.active} WHERE id = ${id}`;
    if (p.password !== undefined)
      await tx`UPDATE admin_users SET pass_hash = ${await hashPassword(p.password)} WHERE id = ${id}`;
    // Yetki, durum ya da şifre değiştiyse açık oturumlar kapanır
    if (p.role !== undefined || p.active === false || p.password !== undefined)
      await tx`UPDATE admin_users SET session_ver = session_ver + 1 WHERE id = ${id}`;
    return { ok: true };
  });
}

export async function deleteUser(id: number, me: { id: number }) {
  if (id === me.id) throw new HttpError(409, "Kendi hesabınızı silemezsiniz.");
  const sql = await db();
  return transaction(sql, async (tx) => {
    const u = (
      await tx<{ role: string; active: boolean }[]>`
      SELECT role, active FROM admin_users WHERE id = ${id} FOR UPDATE`
    )[0];
    if (!u) return { ok: true };
    if (u.role === "yonetici" && u.active) await assertKeepsOwner(tx, id);
    await tx`DELETE FROM admin_users WHERE id = ${id}`;
    return { ok: true };
  });
}

/** Kullanıcının kendi şifresini değiştirmesi (mevcut şifre gerekir). Yeni oturum bilgisi döner. */
export async function changeOwnPassword(id: number, current: string, next: string) {
  const sql = await db();
  const u = (
    await sql<{ pass_hash: string }[]>`SELECT pass_hash FROM admin_users WHERE id = ${id}`
  )[0];
  if (!u || !(await verifyPassword(current, u.pass_hash)))
    throw new HttpError(422, "Mevcut şifre hatalı.");
  const r = await sql<{ id: number; session_ver: number }[]>`
    UPDATE admin_users SET pass_hash = ${await hashPassword(next)}, session_ver = session_ver + 1
    WHERE id = ${id} RETURNING id, session_ver`;
  return r[0]!;
}

/* ================= SORU & CEVAP ================= */

type QuestionRow = {
  id: number;
  created_at: Date;
  pid: string | null;
  product_name: string;
  name: string;
  contact: string;
  question: string;
  answer: string;
  answered_at: Date | null;
  answered_by: string | null;
  public: boolean;
};

function questionOut(r: QuestionRow) {
  return {
    id: r.id,
    createdAt: r.created_at.getTime(),
    pid: r.pid,
    productName: r.product_name,
    name: r.name,
    contact: r.contact,
    question: r.question,
    answer: r.answer,
    answeredAt: r.answered_at ? r.answered_at.getTime() : null,
    answeredBy: r.answered_by,
    public: r.public,
  };
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const questionSchema = z.object({
  name: z.string().trim().min(2).max(80),
  contact: z
    .string()
    .trim()
    .max(160)
    .refine((v) => emailRe.test(v) || phoneOk(v), "geçerli bir e-posta ya da telefon gerekli"),
  pid: z.string().max(80).nullable().optional(),
  question: z.string().trim().min(10, "en az 10 karakter").max(1000),
  /** bot tuzağı: gerçek kullanıcı bu alanı görmez, boş bırakır */
  website: z.string().max(200).optional(),
});

/*
 * Spam koruması (sunucu örneği başına, bellekte):
 *  - aynı e-posta/telefondan 10 dakikada en fazla 4 soru
 *  - aynı IP'den 10 dakikada en fazla 20 soru (Nginx X-Forwarded-For göndermezse tüm
 *    ziyaretçiler tek IP gibi görünür; bu yüzden IP sınırı geniş tutuldu)
 */
const askLog = new Map<string, number[]>();
function hit(key: string, limit: number) {
  const now = Date.now();
  const recent = (askLog.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= limit) return false;
  recent.push(now);
  askLog.set(key, recent);
  return true;
}
function askAllowed(ip: string, contact: string) {
  const c = contact.toLowerCase().replace(/[^a-z0-9@.]/g, "");
  return hit("c:" + c, 4) && hit("ip:" + ip, 20);
}

export async function askQuestion(q: z.infer<typeof questionSchema>, ip: string) {
  // Bot tuzağı doluysa sessizce "alındı" de, kaydetme
  if (q.website) return { ok: true };
  if (!askAllowed(ip, q.contact))
    throw new HttpError(429, "Kısa sürede çok fazla soru gönderdiniz. Biraz sonra tekrar deneyin.");
  const sql = await db();
  let productName = "";
  let pid: string | null = null;
  if (q.pid) {
    const p = (
      await sql<{ id: string; name: string }[]>`SELECT id, name FROM products WHERE id = ${q.pid}`
    )[0];
    if (p) {
      pid = p.id;
      productName = p.name;
    }
  }
  await sql`INSERT INTO questions (pid, product_name, name, contact, question, ip)
            VALUES (${pid}, ${productName}, ${q.name}, ${q.contact}, ${q.question}, ${ip})`;
  return { ok: true };
}

/** Ürün sayfasında gösterilecek, yayınlanmış yanıtlar (müşteri iletişim bilgisi döndürülmez) */
export async function publicAnswers(pid: string) {
  const sql = await db();
  const rows = await sql<
    { name: string; question: string; answer: string; created_at: Date; answered_at: Date }[]
  >`
    SELECT name, question, answer, created_at, answered_at FROM questions
    WHERE pid = ${pid} AND public AND answer <> '' ORDER BY answered_at DESC LIMIT 30`;
  return rows.map((r) => ({
    // gizlilik: "Ayşe Yılmaz" → "Ayşe Y."
    name: r.name
      .split(/\s+/)
      .map((w, i) => (i === 0 ? w : w.charAt(0) + "."))
      .join(" "),
    question: r.question,
    answer: r.answer,
    createdAt: r.created_at.getTime(),
    answeredAt: r.answered_at.getTime(),
  }));
}

export const questionPatchSchema = z.object({
  answer: z.string().trim().max(2000).optional(),
  public: z.boolean().optional(),
});

export async function patchQuestion(
  id: number,
  p: z.infer<typeof questionPatchSchema>,
  actor: string,
) {
  const sql = await db();
  return transaction(sql, async (tx) => {
    const q = (
      await tx<{ answer: string; pid: string | null }[]>`
      SELECT answer, pid FROM questions WHERE id = ${id} FOR UPDATE`
    )[0];
    if (!q) throw new HttpError(404, "Soru bulunamadı.");
    const answer = p.answer ?? q.answer;
    if (p.answer !== undefined) {
      await tx`UPDATE questions SET answer = ${p.answer},
                 answered_at = ${p.answer ? new Date() : null}, answered_by = ${p.answer ? actor : null}
               WHERE id = ${id}`;
    }
    if (p.public !== undefined) {
      if (p.public && !answer) throw new HttpError(422, "Yayınlamak için önce yanıt yazın.");
      if (p.public && !q.pid)
        throw new HttpError(422, "Genel sorular ürün sayfasında yayınlanamaz.");
      await tx`UPDATE questions SET public = ${p.public} WHERE id = ${id}`;
    }
    if (!answer) await tx`UPDATE questions SET public = false WHERE id = ${id}`;
    return { ok: true };
  });
}

export async function deleteQuestion(id: number) {
  const sql = await db();
  await sql`DELETE FROM questions WHERE id = ${id}`;
  return { ok: true };
}
