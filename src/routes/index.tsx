import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TasteAdvisor } from "@/components/TasteAdvisor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kafulluk Gurme" },
      {
        name: "description",
        content: "Kafulluk Gurme — Taze, Doğal, Güvenli. Yöresel kahvaltılık ve gurme ürünler.",
      },
      { property: "og:title", content: "Kafulluk Gurme" },
      {
        property: "og:description",
        content: "Kafulluk Gurme — Taze, Doğal, Güvenli. Yöresel kahvaltılık ve gurme ürünler.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og-image.png" },
      { name: "theme-color", content: "#40712E" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  // Özel soru bağlantısı (/#soru=ANAHTAR) vitrine aktarılır; vitrin konuşmayı açar
  const [src, setSrc] = useState("/kafulluk.html");
  useEffect(() => {
    if (/^#soru=[A-Za-z0-9_-]{20,80}$/.test(window.location.hash)) {
      setSrc("/kafulluk.html" + window.location.hash);
      history.replaceState(null, "", "/");
    }
  }, []);
  const addToCart = (id: string) => {
    const frame = document.getElementById("kg-frame") as HTMLIFrameElement | null;
    (frame?.contentWindow as unknown as { addItem?: (id: string, n?: number) => void })?.addItem?.(
      id,
      1,
    );
  };
  return (
    <>
      <iframe
        id="kg-frame"
        src={src}
        title="Kafulluk Gurme"
        className="fixed inset-0 h-screen w-screen border-0"
      />
      <TasteAdvisor onAdd={addToCart} />
    </>
  );
}
