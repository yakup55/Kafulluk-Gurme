#!/usr/bin/env node
/**
 * Demo veri yükleyici — panel ve vitrin dolu, canlı bir mağaza gibi görünsün diye.
 *
 *   npm run seed:demo                  # 150 örnek sipariş (son 60 gün)
 *   npm run seed:demo -- --orders=400  # sipariş sayısı
 *   npm run seed:demo -- --days=90     # kaç günlük geçmiş
 *
 * Ne yükler:
 *   - Şema (yoksa) + ürün kataloğu (boşsa) — uygulamanın kullandığı schema.sql ile aynı
 *   - Gerçekçi stok seviyeleri (birkaç ürün az / tükenmiş)
 *   - Son N günün siparişleri: farklı il/ilçe müşteriler, durumlar, kargo takip no, kupon, ödeme tipleri
 *   - Stok hareketleri, kuponlar, mağaza ayarları (boş olan alanlar), personel hesapları
 *
 * Güvenli: Siparişler "örnek" işaretlidir. Canlıya geçmeden önce panelde Özet ekranındaki
 * "Örnek siparişleri sil" ile hepsi silinir; stoklar etkilenmez. Script tekrar çalıştırılırsa
 * eski örnek siparişleri silip yenilerini yükler. Gerçek siparişlere ve ürün bilgilerine dokunmaz.
 */
import { readFileSync } from "node:fs";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? Number(m.split("=")[1]) : d;
};
const ORDER_COUNT = arg("orders", 150);
const DAYS = arg("days", 60);

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL tanımlı değil. Proje klasöründe .env dosyası olduğundan emin olun (.env.example'a bakın).",
  );
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  onnotice: () => {},
  types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } },
});

/* ---------- tekrarlanabilir rastgelelik ---------- */
let seed = 20261022;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p) => rnd() < p;
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------- şifre özeti: uygulamadaki ile aynı biçim ---------- */
const b64url = (b) => Buffer.from(b).toString("base64url");
function hashPassword(pw) {
  const salt = randomBytes(16);
  return `pbkdf2$100000$${b64url(salt)}$${b64url(pbkdf2Sync(pw, salt, 100000, 32, "sha256"))}`;
}

/* ---------- müşteri verisi ---------- */
const FIRST = [
  "Ayşe",
  "Fatma",
  "Zeynep",
  "Elif",
  "Emine",
  "Hatice",
  "Merve",
  "Esra",
  "Selin",
  "Büşra",
  "Derya",
  "Gamze",
  "Mehmet",
  "Mustafa",
  "Ahmet",
  "Ali",
  "Hüseyin",
  "Hasan",
  "İbrahim",
  "Murat",
  "Emre",
  "Burak",
  "Serkan",
  "Yusuf",
  "Osman",
  "Kemal",
];
const LAST = [
  "Yılmaz",
  "Kaya",
  "Demir",
  "Şahin",
  "Çelik",
  "Yıldız",
  "Yıldırım",
  "Öztürk",
  "Aydın",
  "Özdemir",
  "Arslan",
  "Doğan",
  "Kılıç",
  "Aslan",
  "Çetin",
  "Kara",
  "Koç",
  "Kurt",
  "Özkan",
  "Şimşek",
  "Polat",
  "Korkmaz",
  "Erdoğan",
  "Güneş",
];
// [il, [ilçeler], ağırlık]
const CITIES = [
  ["Samsun", ["Atakum", "İlkadım", "Canik", "Tekkeköy", "Bafra", "Çarşamba"], 30],
  ["İstanbul", ["Kadıköy", "Beşiktaş", "Üsküdar", "Ataşehir", "Bakırköy", "Maltepe", "Şişli"], 24],
  ["Ankara", ["Çankaya", "Keçiören", "Yenimahalle", "Etimesgut"], 12],
  ["İzmir", ["Karşıyaka", "Bornova", "Konak", "Buca"], 9],
  ["Bursa", ["Nilüfer", "Osmangazi"], 5],
  ["Trabzon", ["Ortahisar", "Akçaabat"], 4],
  ["Ordu", ["Altınordu", "Ünye"], 4],
  ["Antalya", ["Muratpaşa", "Konyaaltı"], 4],
  ["Kocaeli", ["İzmit", "Gebze"], 3],
  ["Eskişehir", ["Odunpazarı", "Tepebaşı"], 3],
];
const STREETS = [
  "Atatürk Cad.",
  "Cumhuriyet Cad.",
  "İstiklal Sok.",
  "Gazi Cad.",
  "Lale Sok.",
  "Menekşe Sok.",
  "Bahar Cad.",
  "Çınar Sok.",
  "Deniz Cad.",
  "Yıldız Sok.",
  "Fatih Cad.",
  "Barış Sok.",
];
const MAH = [
  "Cumhuriyet",
  "Yenimahalle",
  "Kurtuluş",
  "Fatih",
  "Mimar Sinan",
  "Bahçelievler",
  "Esentepe",
  "Güzelyalı",
  "Hürriyet",
  "Yavuz Selim",
];
const NOTES = [
  "",
  "",
  "",
  "",
  "",
  "Kapıya bırakabilirsiniz.",
  "Teslimattan önce arayın lütfen.",
  "Hediye paketi olursa çok sevinirim.",
  "Akşam 18:00'den sonra evdeyim.",
  "Peynirleri soğuk zincirle gönderebilir misiniz?",
  "Zile basmayın, bebek uyuyor.",
];
const CARGO = ["Yurtiçi Kargo", "Aras Kargo", "MNG Kargo", "PTT Kargo", "Sürat Kargo"];
const lower = (s) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");

function pickCity() {
  const tot = CITIES.reduce((a, c) => a + c[2], 0);
  let r = rnd() * tot;
  for (const c of CITIES) if ((r -= c[2]) < 0) return c;
  return CITIES[0];
}
// Müdavim müşteriler: siparişlerin bir kısmı aynı kişilerden gelsin
const CUSTOMERS = Array.from({ length: 70 }, () => {
  const f = pick(FIRST),
    l = pick(LAST),
    [city, dists] = pickCity();
  return {
    name: `${f} ${l}`,
    phone: `05${pick(["32", "33", "35", "41", "42", "43", "44", "05", "06", "07", "52", "53", "54"])} ${int(100, 999)} ${int(10, 99)} ${int(10, 99)}`,
    email: `${lower(f)}.${lower(l)}${int(1, 99)}@${pick(["gmail.com", "hotmail.com", "outlook.com", "yandex.com"])}`,
    city,
    dist: pick(dists),
    addr: `${pick(MAH)} Mah. ${pick(STREETS)} No:${int(1, 120)} D:${int(1, 24)}`,
  };
});

async function main() {
  console.log("→ Şema kontrol ediliyor…");
  await sql.unsafe(readFileSync(join(root, "src/lib/server/schema.sql"), "utf8"));

  const [{ n: productCount }] = await sql`SELECT count(*)::int AS n FROM products`;
  if (productCount === 0) {
    console.log("→ Ürün kataloğu yükleniyor…");
    const seedProducts = JSON.parse(
      readFileSync(join(root, "src/lib/server/seed-products.json"), "utf8"),
    );
    for (const p of seedProducts) {
      await sql`INSERT INTO products (id, cat, name, w, price, old, type, c1, c2, origin, descr, store, inc, stock, active, sort)
        VALUES (${p.id}, ${p.cat}, ${p.name}, ${p.w}, ${p.price}, ${p.old || 0}, ${p.type}, ${p.c1}, ${p.c2}, ${p.origin},
                ${p.desc}, ${p.store}, ${p.inc ?? null}, ${p.stock}, ${p.active}, ${p.sort})`;
    }
  }
  const products =
    await sql`SELECT id, name, w, price, cat, inc FROM products WHERE active ORDER BY sort`;
  if (!products.length) throw new Error("Satışta ürün yok.");

  /* ---------- ayarlar: yalnızca boş alanları doldur ---------- */
  const DEMO_SETTINGS = {
    name: "Kafulluk Gurme",
    phone: "0362 555 00 55",
    email: "siparis@kafullukgurme.com.tr",
    address: "Cumhuriyet Mah. Atatürk Bulvarı No:12, Tekkeköy / Samsun",
    hours: "Hafta içi 09:00–18:00, Cumartesi 10:00–15:00",
    whatsapp: "905325550055",
    iban: "TR00 0000 0000 0000 0000 0000 00 (örnek — gerçek IBAN girin)",
    freeAt: 750,
    ship: 59.9,
    fast: 99.9,
    cod: 19.9,
    lowStock: 5,
  };
  const cur = (await sql`SELECT value FROM settings WHERE key = 'store'`)[0]?.value ?? {};
  const merged = { ...DEMO_SETTINGS };
  for (const [k, v] of Object.entries(cur)) if (v !== "" && v != null) merged[k] = v;
  await sql`INSERT INTO settings (key, value) VALUES ('store', ${sql.json(merged)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  const S = merged;

  /* ---------- kuponlar ---------- */
  for (const c of [
    ["KAHVALTI10", 10, 0, true],
    ["HOSGELDIN15", 15, 500, true],
    ["BAYRAM20", 20, 1000, false],
  ]) {
    await sql`INSERT INTO coupons (code, pct, min, active) VALUES (${c[0]}, ${c[1]}, ${c[2]}, ${c[3]}) ON CONFLICT (code) DO NOTHING`;
  }

  /* ---------- kullanıcılar ---------- */
  const [{ n: userCount }] = await sql`SELECT count(*)::int AS n FROM admin_users`;
  if (userCount === 0 && process.env.ADMIN_PASSWORD) {
    await sql`INSERT INTO admin_users (username, name, pass_hash, role) VALUES ('admin', 'Yönetici', ${hashPassword(process.env.ADMIN_PASSWORD)}, 'yonetici')`;
  }
  const staff = [
    ["ayse.k", "Ayşe Kaya"],
    ["mehmet", "Mehmet Usta"],
  ];
  for (const [u, n] of staff) {
    await sql`INSERT INTO admin_users (username, name, pass_hash, role) VALUES (${u}, ${n}, ${hashPassword("personel123")}, 'personel')
              ON CONFLICT (username) DO NOTHING`;
  }

  /* ---------- eski demo verisini temizle ---------- */
  await sql`DELETE FROM stock_moves WHERE reason = 'demo-stok' OR order_id IN (SELECT id FROM orders WHERE sample)`;
  const del = await sql`DELETE FROM orders WHERE sample RETURNING id`;
  if (del.length) console.log(`→ Önceki ${del.length} örnek sipariş silindi.`);

  /* ---------- stok seviyeleri ---------- */
  const singles = products.filter((p) => !p.inc);
  for (const p of products) {
    const stock = p.inc ? int(4, 15) : int(8, 60);
    await sql`UPDATE products SET stock = ${stock} WHERE id = ${p.id}`;
  }
  const low = [...singles].sort(() => rnd() - 0.5).slice(0, 5);
  for (const [i, p] of low.entries())
    await sql`UPDATE products SET stock = ${i < 2 ? 0 : int(1, 4)} WHERE id = ${p.id}`;

  /* ---------- siparişler ---------- */
  // Popüler ürünler daha sık satılsın
  const weight = (p) =>
    p.inc ? 1.2 : /Bal|Peynir/.test(p.cat) ? 3 : /Zeytin|Reçel/.test(p.cat) ? 2 : 1;
  const bag = products.flatMap((p) => Array(Math.round(weight(p) * 2)).fill(p));
  const now = Date.now();
  const DAY = 86_400_000;
  // Siparişleri günlere dağıt: zamanla artan talep + hafta sonu yoğunluğu
  const dayWeights = Array.from({ length: DAYS }, (_, d) => {
    const date = new Date(now - d * DAY);
    const growth = 1 + ((DAYS - d) / DAYS) * 0.8;
    const weekend = [0, 6].includes(date.getDay()) ? 1.5 : 1;
    return growth * weekend;
  });
  const wTot = dayWeights.reduce((a, b) => a + b, 0);

  let made = 0,
    revenue = 0;
  const statusCount = {};
  for (let i = 0; i < ORDER_COUNT; i++) {
    let r = rnd() * wTot,
      day = 0;
    for (; day < DAYS - 1; day++) if ((r -= dayWeights[day]) < 0) break;
    const hour = pick([8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 21, 22, 22, 23]);
    let created = new Date(now - day * DAY);
    created.setHours(hour, int(0, 59), int(0, 59), 0);
    if (created.getTime() > now) created = new Date(now - int(5, 180) * 60_000);
    // İlk 6 sipariş son birkaç saate düşsün: panelde "bugün" ve "yeni" siparişler görünsün
    if (i < 6) created = new Date(now - int(4, 8 * 60) * 60_000);
    const ageDays = (now - created.getTime()) / DAY;

    const c = chance(0.35) ? pick(CUSTOMERS.slice(0, 15)) : pick(CUSTOMERS);
    const lines = new Map();
    for (let k = 0, n = pick([1, 1, 2, 2, 2, 3, 3, 4]); k < n; k++) {
      const p = pick(bag);
      lines.set(p.id, {
        pid: p.id,
        name: p.name,
        w: p.w,
        price: p.price,
        qty: Math.min(3, (lines.get(p.id)?.qty ?? 0) + pick([1, 1, 1, 2])),
      });
    }
    const items = [...lines.values()];
    const sub = round2(items.reduce((a, l) => a + l.price * l.qty, 0));
    const coupon = chance(0.15) ? "KAHVALTI10" : sub >= 500 && chance(0.06) ? "HOSGELDIN15" : null;
    const disc = coupon ? round2((sub * (coupon === "KAHVALTI10" ? 10 : 15)) / 100) : 0;
    const dlv = chance(0.15) ? "fast" : "std";
    const pay = chance(0.6) ? "cod" : "eft";
    const ship = dlv === "fast" ? +S.fast : sub - disc >= +S.freeAt ? 0 : +S.ship;
    const fee = pay === "cod" ? +S.cod : 0;
    const total = round2(sub - disc + ship + fee);

    let status;
    if (ageDays < 0.6) status = chance(0.75) ? "yeni" : "hazirlaniyor";
    else if (ageDays < 2) status = pick(["hazirlaniyor", "hazirlaniyor", "kargoda"]);
    else if (ageDays < 5) status = pick(["kargoda", "kargoda", "teslim"]);
    else status = chance(0.08) ? "iptal" : "teslim";
    const shipped = status === "kargoda" || status === "teslim";
    const source = chance(0.12) ? "panel" : "web";
    const staffUser = pick(staff)[0];
    const statusAt = new Date(
      Math.min(now, created.getTime() + (status === "yeni" ? 0 : int(2, 30) * 3_600_000)),
    );

    const id = randomUUID();
    const [{ no }] = await sql`SELECT 'KG-' || nextval('order_no_seq') AS no`;
    await sql`
      INSERT INTO orders (id, no, created_at, status, status_at, customer, sub, disc, ship, fee, total, pay, dlv, coupon,
                          cargo, note, stock_applied, source, sample, status_by, created_by)
      VALUES (${id}, ${no}, ${created}, ${status}, ${statusAt},
              ${sql.json({ ...c, note: pick(NOTES) })}, ${sub}, ${disc}, ${ship}, ${fee}, ${total}, ${pay}, ${dlv}, ${coupon},
              ${sql.json(shipped ? { firm: pick(CARGO), track: String(int(100000, 999999)) + String(int(100000, 999999)) } : { firm: "", track: "" })},
              ${status === "iptal" ? pick(["Müşteri vazgeçti.", "Adrese ulaşılamadı.", "Havale gelmedi."]) : ""},
              false, ${source}, true, ${status === "yeni" ? null : staffUser}, ${source === "panel" ? staffUser : null})`;
    let line = 0;
    for (const l of items) {
      await sql`INSERT INTO order_items (order_id, line, pid, name, w, price, qty) VALUES (${id}, ${line++}, ${l.pid}, ${l.name}, ${l.w}, ${l.price}, ${l.qty})`;
      if (status !== "iptal")
        await sql`INSERT INTO stock_moves (pid, delta, reason, order_id, actor, created_at)
                  VALUES (${l.pid}, ${-l.qty}, ${source === "web" ? "web-siparis" : "panel-siparis"}, ${id}, ${source === "panel" ? staffUser : null}, ${created})`;
    }
    made++;
    if (status !== "iptal") revenue += total;
    statusCount[status] = (statusCount[status] ?? 0) + 1;
  }

  // Haftalık stok girişleri
  for (let d = DAYS; d > 0; d -= 7) {
    for (const p of [...singles].sort(() => rnd() - 0.5).slice(0, 6)) {
      await sql`INSERT INTO stock_moves (pid, delta, reason, actor, created_at) VALUES (${p.id}, ${pick([10, 20, 24, 30])}, 'demo-stok', ${pick(["admin", "ayse.k", "mehmet"])}, ${new Date(now - d * DAY)})`;
    }
  }

  const fmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
  console.log(`\n✓ ${made} örnek sipariş yüklendi (son ${DAYS} gün), ciro: ${fmt.format(revenue)}`);
  console.log(
    "  Durumlar:",
    Object.entries(statusCount)
      .map(([k, v]) => `${k} ${v}`)
      .join(", "),
  );
  console.log(`✓ ${products.length} ürünün stoğu ayarlandı (${low.length} tanesi az/tükenmiş)`);
  console.log("✓ Kuponlar: KAHVALTI10, HOSGELDIN15 (500 ₺ üstü), BAYRAM20 (pasif)");
  console.log("✓ Personel hesapları: ayse.k / mehmet  — şifre: personel123");
  if (userCount === 0)
    console.log(
      process.env.ADMIN_PASSWORD
        ? "✓ Yönetici: admin / (.env'deki ADMIN_PASSWORD)"
        : "! ADMIN_PASSWORD yok: yönetici hesabı oluşturulmadı",
    );
  console.log(
    '\nCanlıya geçerken: Panel → Özet → "Örnek siparişleri sil". Personel şifrelerini değiştirin, IBAN\'ı güncelleyin.',
  );
}

main()
  .catch((e) => {
    console.error("✗ Hata:", e.message);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
