/* Mobile menu toggle for the shared site header. */
(function () {
  var btn = document.querySelector(".menu-btn");
  var header = document.querySelector(".site-header");
  if (!btn || !header) return;
  btn.addEventListener("click", function () {
    var open = header.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  header.querySelectorAll(".site-nav a").forEach(function (a) {
    a.addEventListener("click", function () {
      header.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });
  });
})();
