/* Shared site behaviour: mobile menu + Chinese/English switch.
   Translations live next to the Chinese text in the HTML:
     data-en="..."       swap textContent (element must contain text only)
     data-en-html="..."  swap innerHTML (for text with <br>, <b>, links)
     data-en-ph="..."    swap placeholder
   Choice is remembered per browser; ?lang=en / ?lang=zh in a link overrides it. */
(function () {
  var header = document.querySelector(".site-header");
  var menuBtn = document.querySelector(".menu-btn");
  if (header && menuBtn) {
    menuBtn.addEventListener("click", function () {
      var open = header.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    header.querySelectorAll(".site-nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        header.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  var KEY = "shk-lang";
  function initial() {
    var q = new URLSearchParams(location.search).get("lang");
    if (q === "en" || q === "zh") return q;
    try { return localStorage.getItem(KEY) === "en" ? "en" : "zh"; } catch (e) { return "zh"; }
  }
  function swap(sel, attr, zhAttr, prop, lang) {
    document.querySelectorAll(sel).forEach(function (el) {
      if (!el.hasAttribute(zhAttr)) el.setAttribute(zhAttr, el[prop]);
      el[prop] = lang === "en" ? el.getAttribute(attr) : el.getAttribute(zhAttr);
    });
  }
  function apply(lang) {
    document.documentElement.lang = lang === "en" ? "en-GB" : "zh-Hant";
    swap("[data-en]", "data-en", "data-zh", "textContent", lang);
    swap("[data-en-html]", "data-en-html", "data-zh-html", "innerHTML", lang);
    swap("[data-en-ph]", "data-en-ph", "data-zh-ph", "placeholder", lang);
    var b = document.querySelector(".lang-btn");
    if (b) { b.textContent = lang === "en" ? "中文" : "EN"; b.setAttribute("aria-label", lang === "en" ? "切換至中文" : "Switch to English"); }
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    window.SHK_LANG = lang;
    document.dispatchEvent(new CustomEvent("shk:lang", { detail: lang }));
  }
  var lang = initial();
  apply(lang);
  var langBtn = document.querySelector(".lang-btn");
  if (langBtn) langBtn.addEventListener("click", function () { lang = lang === "en" ? "zh" : "en"; apply(lang); });
})();
