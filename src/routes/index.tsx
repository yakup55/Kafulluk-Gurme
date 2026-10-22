import { createFileRoute } from "@tanstack/react-router";
import { TasteAdvisor } from "@/components/TasteAdvisor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kafulluk Gurme" },
      { name: "description", content: "Kafulluk Gurme — doğal, lezzetli gurme ürünler." },
      { property: "og:title", content: "Kafulluk Gurme" },
      { property: "og:description", content: "Kafulluk Gurme — doğal, lezzetli gurme ürünler." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const addToCart = (id: string) => {
    const frame = document.getElementById("kg-frame") as HTMLIFrameElement | null;
    (frame?.contentWindow as unknown as { addItem?: (id: string, n?: number) => void })?.addItem?.(id, 1);
  };
  return (
    <>
      <iframe
        id="kg-frame"
        src="/kafulluk.html"
        title="Kafulluk Gurme"
        className="fixed inset-0 h-screen w-screen border-0"
      />
      <TasteAdvisor onAdd={addToCart} />
    </>
  );
}
