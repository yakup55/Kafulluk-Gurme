import { useState } from "react";
import { getRecommendations } from "@/lib/recommend.functions";

type Result = { intro: string; picks: { id: string; reason: string; name: string; cat: string; w: string; price: number }[] };

const TASTES = ["Tatlı seven", "Keskin & yoğun", "Hafif & tuzu az", "Doğal, işlenmemiş"];
const PURPOSES = ["Pazar kahvaltısı", "Hediye", "Peynir tabağı", "Çocuklar için"];

export function TasteAdvisor({ onAdd }: { onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [taste, setTaste] = useState("");
  const [purpose, setPurpose] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  async function submit() {
    setLoading(true); setError(""); setRes(null);
    try {
      const r = await getRecommendations({ data: { taste, purpose } });
      if (r.ok) setRes(r); else setError(r.error);
    } catch { setError("Öneri alınamadı, lütfen tekrar deneyin."); }
    setLoading(false);
  }

  const chip = (v: string, cur: string, set: (s: string) => void) => (
    <button key={v} type="button" onClick={() => set(cur ? `${cur}, ${v}` : v)}
      className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:border-primary">{v}</button>
  );

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-50 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:scale-105">
        <span aria-hidden>✨</span> Damak zevkine göre öneri
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-card p-6 text-card-foreground shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold">Gurme danışmanın</h2>
                <p className="text-sm text-muted-foreground">Ne sevdiğini anlat, kahvaltı sofrana uygun ürünleri seçelim.</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Kapat" className="text-2xl leading-none text-muted-foreground">×</button>
            </div>

            <label className="mt-5 block text-sm font-semibold">Damak zevkin</label>
            <textarea value={taste} onChange={(e) => setTaste(e.target.value)} rows={2} maxLength={500}
              placeholder="Örn. tatlıyı severim ama çok şekerli olmasın…"
              className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm" />
            <div className="mt-2 flex flex-wrap gap-2">{TASTES.map((t) => chip(t, taste, setTaste))}</div>

            <label className="mt-4 block text-sm font-semibold">Ne için kullanacaksın?</label>
            <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} maxLength={500}
              placeholder="Örn. hafta sonu misafir kahvaltısı…"
              className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm" />
            <div className="mt-2 flex flex-wrap gap-2">{PURPOSES.map((t) => chip(t, purpose, setPurpose))}</div>

            <button onClick={submit} disabled={loading || (!taste.trim() && !purpose.trim())}
              className="mt-5 w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {loading ? "Senin için seçiyoruz…" : "Önerileri göster"}
            </button>

            {error && <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            {res && (
              <div className="mt-5 space-y-3">
                <p className="text-sm italic">{res.intro}</p>
                {res.picks.map((pk) => {
                  const p = pk;
                  const done = added.includes(p.id);
                  return (
                    <div key={p.id} className="rounded-2xl border border-border bg-background p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-primary">{p.cat}</span>
                          <h3 className="font-semibold">{p.name} <span className="text-xs text-muted-foreground">{p.w}</span></h3>
                        </div>
                        <span className="font-bold">{p.price} ₺</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{pk.reason}</p>
                      <button onClick={() => { onAdd(p.id); setAdded((a) => [...a, p.id]); }}
                        className="mt-3 rounded-full border border-primary px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground">
                        {done ? "Sepete eklendi ✓" : "Sepete ekle"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
