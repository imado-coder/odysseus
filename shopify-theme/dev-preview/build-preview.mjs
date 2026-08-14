/* Dev-only harness. Renders the theme's real CSS against representative
   content so layouts can be screenshotted at target breakpoints before the
   Liquid sections are wired up. Not shipped with the theme. */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/* --- placeholder imagery -------------------------------------------------
   Abstract SVG stand-ins so previews need zero network requests and stay
   byte-identical between runs. Real product photos replace these in Liquid. */
const palettes = [
  ["#e8f3f0", "#00806a", "#0aa88a"],
  ["#fdeef0", "#d92d22", "#ff6a5e"],
  ["#eef2fb", "#2b4b8f", "#5b7fd4"],
  ["#fff5e6", "#b8791a", "#ffb020"],
  ["#f2eefb", "#5b3f9e", "#8e6fd6"],
  ["#eaf6f9", "#1a6f85", "#3fa8c4"],
  ["#fdf0e8", "#a8531f", "#e8834a"],
  ["#eef7ee", "#2f7a34", "#5eb964"],
];

function productImage(i, variant = 0) {
  const [bg, dark, light] = palettes[(i + variant) % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<rect width="400" height="400" fill="${bg}"/>
<circle cx="${200 + variant * 24}" cy="176" r="104" fill="${light}" opacity=".38"/>
<rect x="120" y="128" width="160" height="160" rx="34" fill="${dark}" opacity=".88"/>
<rect x="152" y="160" width="96" height="96" rx="20" fill="${light}" opacity=".65"/>
<circle cx="200" cy="208" r="26" fill="${bg}"/>
<rect x="140" y="312" width="120" height="12" rx="6" fill="${dark}" opacity=".22"/>
<rect x="164" y="336" width="72" height="10" rx="5" fill="${dark}" opacity=".14"/>
</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/* --- content ------------------------------------------------------------- */
const products = [
  { t: "ساعة ذكية رياضية مقاومة للماء مع شاشة AMOLED", p: 4900, c: 7900, r: "4.8", n: 1284, sold: "2.4k" },
  { t: "سماعات لاسلكية بلوتوث 5.3 عزل ضجيج نشط", p: 3500, c: 6200, r: "4.7", n: 942, sold: "1.8k" },
  { t: "حذاء رياضي خفيف للجري نعل مريح", p: 5990, c: 8900, r: "4.6", n: 611, sold: "930" },
  { t: "حقيبة ظهر مقاومة للماء مع منفذ USB", p: 2900, c: 4500, r: "4.9", n: 1503, sold: "3.1k" },
  { t: "مجفف شعر احترافي أيوني 2200 واط", p: 6400, c: 9500, r: "4.5", n: 388, sold: "740" },
  { t: "عطر رجالي فاخر ثابت 100 مل", p: 3900, c: 6900, r: "4.8", n: 2201, sold: "4.6k" },
  { t: "طقم أواني طبخ جرانيت 8 قطع غير لاصق", p: 12900, c: 18900, r: "4.7", n: 505, sold: "610" },
  { t: "مكنسة كهربائية لاسلكية شفط قوي", p: 15900, c: 22900, r: "4.6", n: 276, sold: "420" },
  { t: "نظارة شمسية بولاريزد حماية UV400", p: 1900, c: 3400, r: "4.4", n: 833, sold: "1.2k" },
  { t: "شاحن سريع 65 واط ثلاث منافذ GaN", p: 2400, c: 3900, r: "4.9", n: 1740, sold: "3.9k" },
];

const dz = (n) => n.toLocaleString("en-US");
const off = (p, c) => Math.round((1 - p / c) * 100);

const stars = (r) => {
  const full = Math.floor(r);
  return "★".repeat(full) + "☆".repeat(5 - full);
};

function card(prod, i, { rail = false } = {}) {
  const cls = rail ? "card card--rail" : "card";
  return `<article class="${cls}">
  <a class="card__media" href="#" aria-label="${prod.t}">
    <img class="card__img card__img--main" src="${productImage(i)}" alt="${prod.t}" loading="lazy" width="400" height="400">
    <img class="card__img card__img--hover" src="${productImage(i, 3)}" alt="" loading="lazy" width="400" height="400" aria-hidden="true">
    <div class="card__badges">
      <span class="badge badge--sale">-${off(prod.p, prod.c)}%</span>
      ${i % 3 === 0 ? '<span class="badge badge--ink">الأكثر مبيعاً</span>' : ""}
    </div>
    <span class="card__sold">تم بيع ${prod.sold}+</span>
  </a>
  <button class="card__wish" type="button" aria-label="أضف إلى المفضلة">♡</button>
  <div class="card__body">
    <h3 class="card__title truncate-2"><a href="#">${prod.t}</a></h3>
    <div class="card__rating">
      <span class="card__stars" aria-hidden="true">${stars(+prod.r)}</span>
      <span>${prod.r}</span>
      <span>(${dz(prod.n)})</span>
    </div>
    <div class="card__price-row">
      <span class="price">${dz(prod.p)}<span class="price__unit">دج</span></span>
      <s class="price--compare">${dz(prod.c)} دج</s>
    </div>
    <div class="card__foot">
      <span class="card__ship">توصيل 58 ولاية</span>
      <button class="card__add" type="button" aria-label="أضف إلى السلة">+</button>
    </div>
  </div>
</article>`;
}

const categories = [
  ["📱", "إلكترونيات"], ["👗", "أزياء"], ["🏠", "منزل"], ["💄", "تجميل"],
  ["👟", "أحذية"], ["⌚", "ساعات"], ["🎧", "صوتيات"], ["🧸", "أطفال"],
  ["🍳", "مطبخ"], ["🏋️", "رياضة"],
];

const benefits = [
  ["💵", "الدفع عند الاستلام", "ادفع بعد المعاينة"],
  ["🚚", "توصيل 58 ولاية", "خلال 24 إلى 72 ساعة"],
  ["🔄", "استبدال مجاني", "خلال 7 أيام"],
  ["📞", "دعم سريع", "من 8ص إلى 8م"],
];

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>معاينة الصفحة الرئيسية</title>
<link rel="stylesheet" href="../assets/base.css">
<link rel="stylesheet" href="../assets/components.css">
</head>
<body>

<div class="announcement">
  الدفع عند الاستلام في كل الولايات <span class="announcement__dot"></span> توصيل مجاني للطلبات فوق 8.000 دج
</div>

<header class="header">
  <div class="header__inner">
    <a class="header__logo" href="#">
      <span class="header__logo-mark">S</span><span>سوقنا</span>
    </a>
    <form class="search header__search-inline" role="search">
      <span aria-hidden="true">🔍</span>
      <input class="search__input" type="search" placeholder="ابحث عن منتج، ماركة، أو فئة…">
      <button class="search__submit" type="submit">بحث</button>
    </form>
    <div class="header__actions">
      <button class="icon-btn" type="button" aria-label="حسابي">👤</button>
      <button class="icon-btn" type="button" aria-label="المفضلة">♡</button>
      <button class="icon-btn" type="button" aria-label="السلة">🛒<span class="icon-btn__count">3</span></button>
    </div>
  </div>
  <div class="header__search-row">
    <form class="search" role="search">
      <span aria-hidden="true">🔍</span>
      <input class="search__input" type="search" placeholder="ابحث عن منتج…">
      <button class="search__submit" type="submit">بحث</button>
    </form>
  </div>
  <nav class="nav">
    <ul class="nav__list">
      <li><a class="nav__link nav__link--hot" href="#">🔥 عروض اليوم</a></li>
      <li><a class="nav__link" href="#">إلكترونيات</a></li>
      <li><a class="nav__link" href="#">أزياء</a></li>
      <li><a class="nav__link" href="#">المنزل والمطبخ</a></li>
      <li><a class="nav__link" href="#">التجميل</a></li>
      <li><a class="nav__link" href="#">الرياضة</a></li>
      <li><a class="nav__link" href="#">وصل حديثاً</a></li>
    </ul>
  </nav>
</header>

<main>
  <section class="categories">
    <div class="rail">
      ${categories.map(([e, l]) => `<a class="category" href="#">
        <span class="category__thumb">${e}</span>
        <span class="category__label">${l}</span>
      </a>`).join("\n      ")}
    </div>
  </section>

  <div class="page">
    <section class="hero">
      <span class="hero__eyebrow">عرض الأسبوع</span>
      <h1 class="hero__title">وفّر حتى 60% على مختارات هذا الأسبوع</h1>
      <p class="hero__sub">أسعار الجملة، جودة مضمونة، والدفع عند الاستلام في كل ولايات الوطن.</p>
      <a class="btn btn--lg hero__cta" href="#">تسوّق الآن</a>
    </section>

    <section class="benefits">
      ${benefits.map(([i, t, s]) => `<div class="benefit">
        <span class="benefit__icon">${i}</span>
        <span>
          <span class="benefit__title">${t}</span><br>
          <span class="benefit__text">${s}</span>
        </span>
      </div>`).join("\n      ")}
    </section>
  </div>

  <section class="flash">
    <div class="flash__head">
      <h2 class="flash__title">⚡ عروض محدودة</h2>
      <div class="flash__timer" aria-label="ينتهي خلال">
        <span class="flash__unit">04</span><span class="flash__colon">:</span>
        <span class="flash__unit">12</span><span class="flash__colon">:</span>
        <span class="flash__unit">38</span>
      </div>
      <a class="flash__all" href="#">عرض الكل ›</a>
    </div>
    <div class="rail">
      ${products.slice(0, 6).map((p, i) => card(p, i, { rail: true })).join("\n      ")}
    </div>
  </section>

  <div class="page">
    <div class="promos">
      <a class="promo promo--a" href="#">
        <span class="promo__title">أقل من 2.000 دج</span>
        <span class="promo__text">اختيارات بأسعار صغيرة</span>
      </a>
      <a class="promo promo--b" href="#">
        <span class="promo__title">وصل حديثاً</span>
        <span class="promo__text">جديد هذا الأسبوع</span>
      </a>
      <a class="promo promo--c" href="#">
        <span class="promo__title">الأكثر مبيعاً</span>
        <span class="promo__text">اختيار الزبائن</span>
      </a>
      <a class="promo promo--d" href="#">
        <span class="promo__title">تخفيضات 50%+</span>
        <span class="promo__text">لفترة محدودة</span>
      </a>
    </div>
  </div>

  <section class="section">
    <div class="section__head">
      <h2 class="section__title">مختارات لك</h2>
      <a class="section__link" href="#">عرض الكل</a>
    </div>
    <div class="grid">
      ${products.map((p, i) => card(p, i)).join("\n      ")}
    </div>
  </section>

  <section class="newsletter">
    <h2 class="newsletter__title">لا تفوّت العروض</h2>
    <p class="newsletter__text">اشترك لتصلك التخفيضات والمنتجات الجديدة قبل الجميع.</p>
    <form class="newsletter__form">
      <input class="newsletter__input" type="email" placeholder="بريدك الإلكتروني">
      <button class="btn btn--sale" type="submit">اشتراك</button>
    </form>
  </section>
</main>

<footer class="footer">
  <div class="page">
    <div class="footer__cols">
      <div>
        <h3 class="footer__title">تسوّق</h3>
        <ul class="footer__list">
          <li><a href="#">كل المنتجات</a></li>
          <li><a href="#">وصل حديثاً</a></li>
          <li><a href="#">الأكثر مبيعاً</a></li>
          <li><a href="#">التخفيضات</a></li>
        </ul>
      </div>
      <div>
        <h3 class="footer__title">المساعدة</h3>
        <ul class="footer__list">
          <li><a href="#">تتبع طلبك</a></li>
          <li><a href="#">الشحن والتوصيل</a></li>
          <li><a href="#">الاستبدال والإرجاع</a></li>
          <li><a href="#">الأسئلة الشائعة</a></li>
        </ul>
      </div>
      <div>
        <h3 class="footer__title">عن المتجر</h3>
        <ul class="footer__list">
          <li><a href="#">من نحن</a></li>
          <li><a href="#">اتصل بنا</a></li>
          <li><a href="#">سياسة الخصوصية</a></li>
          <li><a href="#">شروط الاستخدام</a></li>
        </ul>
      </div>
      <div>
        <h3 class="footer__title">تواصل معنا</h3>
        <ul class="footer__list">
          <li>📞 0555 00 00 00</li>
          <li>✉️ contact@example.dz</li>
          <li>🕒 من 8:00 إلى 20:00</li>
        </ul>
      </div>
    </div>
    <div class="footer__bottom">
      <span>© 2026 سوقنا — جميع الحقوق محفوظة</span>
      <div class="pay">
        <span class="pay__chip">الدفع عند الاستلام</span>
        <span class="pay__chip">CIB</span>
        <span class="pay__chip">Edahabia</span>
      </div>
    </div>
  </div>
</footer>

<nav class="tabbar">
  <a class="tab tab--active" href="#"><span class="tab__icon">🏠</span>الرئيسية</a>
  <a class="tab" href="#"><span class="tab__icon">☰</span>الفئات</a>
  <a class="tab" href="#"><span class="tab__icon">🔥</span>العروض</a>
  <a class="tab" href="#"><span class="tab__icon">🛒</span>السلة</a>
  <a class="tab" href="#"><span class="tab__icon">👤</span>حسابي</a>
</nav>

</body>
</html>`;

mkdirSync(join(here, "out"), { recursive: true });
writeFileSync(join(here, "home.html"), html);
console.log("wrote dev-preview/home.html");
