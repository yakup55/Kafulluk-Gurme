# Kafulluk Gurme

Gurme kahvaltılık ürünler satan e-ticaret sitesi: vitrin (`/`), satıcı paneli (`/satici.html`) ve PostgreSQL üzerinde çalışan bir API.

## Mimari

| Katman | Nerede | Ne yapar |
| --- | --- | --- |
| Vitrin | `public/kafulluk.html` (ana sayfada iframe) | Ürünleri ve ayarları `/api/store`'dan okur, kuponu `/api/coupon` ile doğrular, siparişi `/api/orders`'a gönderir |
| Satıcı paneli | `public/satici.html` | Kullanıcı adı + şifreyle giriş, rol bazlı yetki; ürün, stok, sipariş, kupon, ayar ve kullanıcı yönetimi (`/api/admin/*`). Yeni siparişleri 20 sn'de bir kontrol eder |
| API | `src/routes/api/**` (TanStack Start server routes) | İş kuralları `src/lib/server/store.ts` içinde |
| Veritabanı | PostgreSQL (`src/lib/server/db.ts`) | Şema ilk istekte otomatik kurulur; ürün tablosu boşsa örnek katalog yüklenir |

### Stok kuralları
- Sipariş verildiğinde stok **aynı veritabanı işleminde** düşülür (`UPDATE … WHERE stock >= adet`). Aynı anda gelen siparişlerde stok eksiye düşmez; yetmeyen siparişe "X için yalnızca N adet kaldı" yanıtı döner.
- Fiyat, kupon, kargo ve kapıda ödeme bedeli **sunucuda** hesaplanır. Tarayıcıdaki toplam farklıysa sipariş reddedilir ve müşteriye güncel özet gösterilir.
- Sipariş iptal edilince stok geri eklenir; iptal geri alınırsa tekrar düşülür. Sipariş silinirse stok iade edilir.
- Her stok hareketi `stock_moves` tablosuna yazılır (kim, ne zaman, hangi sipariş).
- Setlerin stoğu ayrı tutulur (set satışı içindeki ürünlerin stoğunu düşmez).

### Panel kullanıcıları ve yetkiler
| Rol | Yapabilecekleri |
| --- | --- |
| **Yönetici** | Her şey: ürün/fiyat, satışa açma-kapama, kupon, ayarlar, yedek, kullanıcı yönetimi, sipariş silme |
| **Personel** | Siparişleri görür; durum, kargo ve not günceller; telefonla gelen siparişi girer; stok ekler/düşer |

- **İlk giriş:** Kullanıcı adı `admin`, şifre `ADMIN_PASSWORD`. Bu giriş "admin" yönetici hesabını oluşturur; sonra **Şifremi değiştir** ile şifreyi değiştirin. Hesap oluştuktan sonra `ADMIN_PASSWORD` girişte kullanılmaz.
- Şifreler PBKDF2-SHA256 ile saklanır. Kullanıcı pasife alınınca, rolü ya da şifresi değişince açık oturumları anında kapanır.
- En az bir aktif yönetici kalmak zorundadır; kimse kendi hesabını silemez ya da yetkisini düşüremez.
- Stok hareketlerinde (`stock_moves.actor`) ve siparişlerde (`created_by`, `status_by`) işlemi yapan kullanıcı tutulur.

## Kurulum

0. **Node.js 22.12 veya üzeri** gerekli (`node -v`). Node 20 ile `vite dev` "Cannot find native binding" hatası verir.
1. `.env.example` dosyasını `.env` olarak kopyalayın ve `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET` değerlerini girin.
2. `bun install` (ya da `npm i`)
3. `npm run dev` (ya da `bun run dev`) → vitrin: http://localhost:3000 · panel: http://localhost:3000/satici.html

**`.env` notları:** Dosyanın adı tam olarak `.env` olmalı (Windows'ta `.env.txt` olarak kaydedilmesin; `Get-ChildItem -Force .env*` ile kontrol edin) ve proje kök klasöründe durmalı. `DATABASE_URL` Node biçiminde yazılır: `postgres://kullanici:sifre@localhost:5432/kafulluk` — Java'daki `jdbc:postgresql://…` biçimi çalışmaz. `.env` değişince `npm run dev`'i yeniden başlatın.

**Canlı (Node sunucusu):** `NITRO_PRESET=node-server npm run build` ardından `npm start` (`.env`'i okur, `PORT` ile port seçilir).

Lovable üzerinde yayınlıyorsanız aynı değişkenleri projenin **Secrets** bölümüne ekleyin.

## Satıcıya soru (Soru & Cevap)

- Vitrinde menüdeki **Soru sor**, SSS altındaki kutu ve her ürün sayfasındaki **Satıcıya soru sor** ile müşteri ad, e-posta/telefon ve sorusunu gönderir.
- Panelde **Sorular** ekranı: bekleyen soru sayısı menüde ve sekme başlığında görünür, yeni soru gelince bildirim çıkar. Yanıt yazılır; ürünle ilgili yanıtlar **Ürün sayfasında yayınla** ile vitrinde "Soru & Cevap" altında gösterilir (müşteri adı "Ayşe Y." şeklinde kısaltılır, iletişim bilgisi asla gösterilmez). **E-posta / WhatsApp ile gönder** hazır mesajla müşteriye yanıt açar.
- Personel yanıtlayabilir ve yayınlayabilir; soru silme yönetici yetkisindedir.
- Spam koruması: bot tuzağı alanı, aynı e-posta/telefondan 10 dk'da 4, aynı IP'den 20 soru. Nginx arkasında gerçek IP için `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` ekleyin.

## Demo veri

Paneli ve vitrini müşteriye göstermek ya da denemek için:

```bash
npm run seed:demo                    # 150 örnek sipariş (son 60 gün)
npm run seed:demo -- --orders=400    # daha fazla
```

Yüklenenler: son 60 günün siparişleri (farklı il/ilçe müşteriler, tüm durumlar, kargo takip no, kupon, ödeme tipleri), gerçekçi stoklar (birkaçı az/tükenmiş), stok hareketleri, kuponlar, mağaza ayarlarının boş alanları ve personel hesapları (`ayse.k`, `mehmet` / `personel123`).

Siparişler **örnek** işaretlidir; canlıya geçmeden önce Panel → Özet → **Örnek siparişleri sil** ile stoklara dokunmadan silinir. Script tekrar çalıştırılırsa eski örnekleri silip yenilerini yükler; gerçek siparişlere dokunmaz. Canlıda personel şifrelerini değiştirin ve IBAN'ı güncelleyin.

## API özeti

| Yöntem | Yol | Açıklama |
| --- | --- | --- |
| GET | `/api/store` | Satıştaki ürünler (stokla) + mağaza ayarları |
| POST | `/api/coupon` | `{ code, sub }` kupon doğrulama |
| POST | `/api/orders` | Müşteri siparişi |
| GET/POST | `/api/questions` | Ürünün yayınlanmış soru-cevapları (`?pid=`) / satıcıya soru gönder |
| PATCH/DELETE | `/api/admin/questions/:id` | Yanıtla, yayınla / sil (yönetici) |
| POST | `/api/admin/login` · `/api/admin/logout` | Panel oturumu (`{ username, password }`, HttpOnly çerez) |
| GET | `/api/admin/me` | Giriş yapmış kullanıcı ve rolü |
| POST | `/api/admin/password` | Kendi şifresini değiştir |
| GET/POST | `/api/admin/users` | Kullanıcıları listele / ekle (yönetici) |
| PATCH/DELETE | `/api/admin/users/:id` | Rol, aktiflik, şifre belirleme / silme (yönetici) |
| GET | `/api/admin/data` | Ürünler, siparişler, kuponlar, ayarlar |
| PUT/PATCH/DELETE | `/api/admin/products/:id` | Ürün kaydet / satışa aç-kapat / sil |
| POST | `/api/admin/stock/:id` | `{ delta }` stok ekle/çıkar |
| PUT/PATCH/DELETE | `/api/admin/orders/:id` | Elle sipariş / durum-kargo-not / sil |
| PUT/PATCH/DELETE | `/api/admin/coupons/:code` | Kupon yönetimi |
| PUT | `/api/admin/settings` | Mağaza ayarları (kargo ücretleri, IBAN, WhatsApp…) |
| POST | `/api/admin/import` | Eski tarayıcı yedeğini (JSON) veritabanına aktar |

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://kafullukgurme.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cd2a513b-8696-497e-9b67-2b26757cd3ab).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
