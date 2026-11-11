/*!
 * ADGENT shoppable ad widget
 * <div data-adgent-slot data-query="espresso beans" data-limit="2"></div>
 * <script src="https://YOUR_ADGENT_HOST/widget.js" data-pub="pub_dailygrind" async></script>
 * The publisher earns a share of the ad fee on every sale, paid through PayPal Payouts.
 */
(function () {
  var script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  var origin = new URL(script.src).origin;
  var pub = script.getAttribute("data-pub") || "";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function usd(c) {
    return "$" + (c / 100).toFixed(2);
  }

  var css =
    ".adg-wrap{font-family:system-ui,-apple-system,sans-serif;border:1px solid #e3e8f0;border-radius:14px;padding:14px;background:#fff;color:#111}" +
    ".adg-label{font-size:11px;color:#6b7280;margin-bottom:10px;display:flex;justify-content:space-between}" +
    ".adg-card{display:flex;gap:12px;align-items:center;padding:10px;border-radius:10px;text-decoration:none;color:inherit;transition:background .15s}" +
    ".adg-card:hover{background:#f3f6fb}" +
    ".adg-img{font-size:34px;width:52px;height:52px;display:grid;place-items:center;background:#f3f6fb;border-radius:10px;flex:none}" +
    ".adg-t{font-weight:600;font-size:14px;line-height:1.25}" +
    ".adg-m{font-size:12px;color:#6b7280}" +
    ".adg-p{font-weight:700;font-size:14px}" +
    ".adg-s{text-decoration:line-through;color:#9ca3af;font-weight:400;margin-left:6px;font-size:12px}" +
    ".adg-pl{font-size:11px;color:#003087;margin-top:2px}" +
    ".adg-btn{margin-left:auto;background:#ffc439;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:700;color:#111;white-space:nowrap}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function render(slot) {
    var q = slot.getAttribute("data-query");
    if (!q) return;
    var limit = slot.getAttribute("data-limit") || "2";
    var url = origin + "/api/offers?surface=widget&limit=" + encodeURIComponent(limit) + "&q=" + encodeURIComponent(q) + (pub ? "&pub=" + encodeURIComponent(pub) : "");
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var offers = (data && data.offers) || [];
        if (!offers.length) { slot.style.display = "none"; return; }
        var html = '<div class="adg-wrap"><div class="adg-label"><span>Sponsored</span><span>Pay with PayPal</span></div>';
        offers.forEach(function (o) {
          // Only ever link to a web page (never javascript: or data: URLs).
          if (typeof o.checkoutUrl !== "string" || !/^https?:\/\//i.test(o.checkoutUrl)) return;
          html +=
            '<a class="adg-card" target="_blank" rel="sponsored noopener" href="' + esc(o.checkoutUrl) + '">' +
            '<div class="adg-img" aria-hidden="true">' + esc(o.image) + "</div>" +
            "<div><div class=\"adg-t\">" + esc(o.title) + '</div><div class="adg-m">' + esc(o.merchant) + "</div>" +
            '<div class="adg-p">' + usd(o.finalPriceCents) + (o.discountPct ? '<span class="adg-s">' + usd(o.priceCents) + "</span>" : "") + "</div>" +
            (o.payLaterText ? '<div class="adg-pl">' + esc(o.payLaterText) + "</div>" : "") +
            '</div><span class="adg-btn">Buy</span></a>';
        });
        slot.innerHTML = html + "</div>";
      })
      .catch(function () { slot.style.display = "none"; });
  }

  function init() {
    document.querySelectorAll("[data-adgent-slot]").forEach(render);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
