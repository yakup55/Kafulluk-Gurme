export type Product = { id: string; cat: "Bal" | "Peynir" | "Zeytin"; name: string; w: string; price: number; desc: string };

export const PRODUCTS: Product[] = [
  { id: "bal-cicek", cat: "Bal", name: "Süzme Çiçek Balı", w: "450 g", price: 289, desc: "Yayla çiçeklerinden süzülmüş, akışkan ve hafif aromalı bal." },
  { id: "bal-cam", cat: "Bal", name: "Muğla Çam Balı", w: "850 g", price: 599, desc: "Koyu renkli, yoğun ve hafif reçineli tadıyla kahvaltının klasiği." },
  { id: "bal-petek", cat: "Bal", name: "Karakovan Petek Bal", w: "500 g", price: 849, desc: "Peteğiyle birlikte sunulan, işlenmemiş karakovan balı." },
  { id: "pey-ezine", cat: "Peynir", name: "Ezine Beyaz Peynir", w: "500 g", price: 329, desc: "Tuzu dengeli, tam yağlı ve dilimlenebilir beyaz peynir." },
  { id: "pey-kasar", cat: "Peynir", name: "Eski Kaşar Peyniri", w: "400 g", price: 289, desc: "Olgunlaşmış, hafif sert ve yoğun lezzetli kaşar." },
  { id: "pey-tulum", cat: "Peynir", name: "Erzincan Tulum Peyniri", w: "350 g", price: 379, desc: "Mağarada olgunlaşan, ufalanan yapıda, keskin aromalı peynir." },
  { id: "pey-kaymak", cat: "Peynir", name: "Afyon Kaymağı", w: "200 g", price: 179, desc: "Manda sütünden, bal ile en güzel giden kalın kaymak." },
  { id: "zey-siyah", cat: "Zeytin", name: "Gemlik Siyah Zeytin", w: "500 g", price: 199, desc: "Tuzlu salamurada olgunlaşmış, yağlı ve etli sofralık zeytin." },
  { id: "zey-yesil", cat: "Zeytin", name: "Çizik Yeşil Zeytin", w: "500 g", price: 179, desc: "Çıtır yapılı, limonlu ve hafif acımsı yeşil zeytin." },
  { id: "zey-yag", cat: "Zeytin", name: "Naturel Sızma Zeytinyağı", w: "750 ml", price: 649, desc: "Soğuk sıkım, düşük asitli, meyvemsi aromalı zeytinyağı." },
];
