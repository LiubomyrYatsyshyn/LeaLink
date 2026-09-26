/* LeaLink prototype UI behaviour. No data, no backend: only visual interactions. */
(function () {
  "use strict";

  /* ---------- Icons (stroke 1.75, 24px grid; Lucide shapes, ISC licence) ---------- */
  var ICONS = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    "chev-up": '<path d="m18 15-6-6-6 6"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    video: '<path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    sliders: '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    swap: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    spark: '<path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>',
    star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>'
  };
  var FILLED = { star: true };

  function icon(name, size, extra) {
    var cls = "i" + (size ? " i-" + size : "") + (FILLED[name] ? " i-fill" : "") + (extra ? " " + extra : "");
    return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }
  function renderIcons(root) {
    (root || document).querySelectorAll("i[data-i]").forEach(function (el) {
      var tmp = document.createElement("span");
      tmp.innerHTML = icon(el.getAttribute("data-i"), el.getAttribute("data-size"), el.className);
      var svg = tmp.firstChild;
      if (el.getAttribute("style")) svg.setAttribute("style", el.getAttribute("style"));
      el.replaceWith(svg);
    });
  }
  window.LeaLink = { icon: icon, renderIcons: renderIcons };

  /* ---------- Brand logo (vector version of the LeaLink mark) ---------- */
  var MARK = '<svg class="logo-mark" viewBox="0 0 62 92" aria-hidden="true">' +
    '<path fill="url(#ll-stem)" d="M6 26A20 20 0 0 1 26 6V66L37 86A31 20 0 0 1 6 66Z"/>' +
    '<path fill="url(#ll-foot)" d="M26 66H40A16 20 0 0 1 56 86H37A11 20 0 0 1 26 66Z"/></svg>';
  function logoInner(tagline) {
    var word = '<span class="logo-word">LeaLink</span>';
    return MARK + (tagline ? '<span class="logo-lockup">' + word + '<span class="logo-tagline">Learning Network</span></span>' : word);
  }
  function brandDefs() {
    if (document.getElementById("ll-defs")) return;
    var d = document.createElement("div");
    d.id = "ll-defs";
    d.setAttribute("aria-hidden", "true");
    d.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    d.innerHTML = '<svg width="0" height="0"><defs>' +
      '<linearGradient id="ll-stem" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A37B5"/><stop offset=".32" stop-color="#3F5DAA"/><stop offset=".62" stop-color="#6F9B97"/><stop offset=".86" stop-color="#9CC68D"/><stop offset="1" stop-color="#B5DA8E"/></linearGradient>' +
      '<linearGradient id="ll-foot" x1="0" y1="0" x2="1" y2=".35"><stop offset="0" stop-color="#5F8A58"/><stop offset=".45" stop-color="#8DBF7E"/><stop offset="1" stop-color="#B8DE93"/></linearGradient>' +
      '</defs></svg>';
    document.body.insertBefore(d, document.body.firstChild);
  }
  function renderLogos() {
    document.querySelectorAll("[data-logo]").forEach(function (el) { el.innerHTML = logoInner(el.hasAttribute("data-tagline")); });
    document.querySelectorAll("[data-mark]").forEach(function (el) { el.innerHTML = MARK; });
  }

  var forceMotion = /[?&]motion=1/.test(location.search);
  try {
    if (forceMotion) localStorage.setItem("ll-motion", "1");
    else if (/[?&]motion=0/.test(location.search)) localStorage.removeItem("ll-motion");
    else forceMotion = localStorage.getItem("ll-motion") === "1";
  } catch (e) { /* storage unavailable */ }
  if (forceMotion) document.documentElement.classList.add("force-motion");
  var reduceMotion = !forceMotion && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Grid lines + plus marks ---------- */
  function buildGrid(el) {
    var v = (el.getAttribute("data-grid-v") || "").split(",").filter(Boolean);
    var h = (el.getAttribute("data-grid-h") || "").split(",").filter(Boolean);
    var base = +(el.getAttribute("data-grid-delay") || 600);
    var html = "";
    v.forEach(function (x, i) { html += '<span class="gl-v anim-grid-v" style="left:' + x + ';animation-delay:' + (base + i * 100) + 'ms"></span>'; });
    h.forEach(function (y, i) { html += '<span class="gl-h anim-grid-h" style="top:' + y + ';animation-delay:' + (base + 200 + i * 150) + 'ms"></span>'; });
    h.forEach(function (y, hi) {
      v.forEach(function (x, vi) {
        html += '<span class="plus anim-scale-in" style="top:' + y + ';left:' + x + ';animation-delay:' + (base + 400 + (hi * v.length + vi) * 80) + 'ms"></span>';
      });
    });
    el.insertAdjacentHTML("afterbegin", html);
  }
  function decorateBands() {
    document.querySelectorAll(".band, .wizard-band").forEach(function (b) {
      if (b.querySelector(":scope > .deco")) return;
      var d = document.createElement("div");
      d.className = "deco";
      d.setAttribute("aria-hidden", "true");
      d.setAttribute("data-grid-v", "12.6%,37.5%,61.9%,86.2%");
      d.setAttribute("data-grid-h", "100%");
      d.setAttribute("data-grid-delay", "150");
      b.insertBefore(d, b.firstChild);
    });
    document.querySelectorAll("[data-grid-v]").forEach(buildGrid);
  }

  /* ---------- Staggered reveal (load + scroll) ---------- */
  var REVEAL = [
    ".band .container > *", ".wizard-band .container > *", ".home-aside > *", ".home-main > *",
    ".auth > *", ".status-card > *", ".cards > *", ".list > *", ".list-sm > *", ".split > aside",
    ".split-results > aside", ".steps .step", ".wizard-panel > *", ".side-nav a", ".chat-list .conv",
    ".thread > *", ".tp-section", ".profile-head", ".duo-half > *", ".how .row-between", ".how-card",
    ".screens-group", ".sg-section", ".site-footer > *"
  ].join(",");
  function initReveal() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    var els = Array.prototype.slice.call(document.querySelectorAll(REVEAL)).filter(function (el) {
      return !el.closest(".hero") && !el.closest("dialog") && !el.classList.contains("reveal");
    });
    var io = new IntersectionObserver(function (entries) {
      var batch = 0;
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.style.setProperty("--rd", Math.min(batch * 70, 560) + "ms");
        el.classList.add("is-in");
        batch++;
        io.unobserve(el);
        setTimeout(function () { el.classList.remove("reveal", "is-in"); el.style.removeProperty("--rd"); }, 1600 + Math.min(batch * 70, 560));
      });
    }, { rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el) { el.classList.add("reveal"); io.observe(el); });
  }

  /* ---------- Hero: mobile menu + 3D parallax ---------- */
  function initHero() {
    var hero = document.querySelector(".hero");
    if (!hero) return;
    function setMenu(open) {
      hero.classList.toggle("menu-open", open);
      document.body.classList.toggle("menu-lock", open);
      hero.querySelectorAll("[data-hero-menu]").forEach(function (b) { b.setAttribute("aria-expanded", String(open)); });
    }
    hero.addEventListener("click", function (e) {
      if (e.target.closest("[data-hero-menu]")) { setMenu(!hero.classList.contains("menu-open")); return; }
      if (e.target.closest("[data-hero-menu-close]") || e.target.closest(".hero-menu-list a")) setMenu(false);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

    var net = hero.querySelector(".network-3d");
    if (!net || reduceMotion) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, pointer = false, visible = true, raf = 0;
    hero.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - .5;
      ty = (e.clientY - r.top) / r.height - .5;
      pointer = true;
    });
    hero.addEventListener("pointerleave", function () { pointer = false; });
    function loop(t) {
      if (!pointer) { tx = Math.sin(t / 5200) * .22; ty = Math.cos(t / 6800) * .16; }
      cx += (tx - cx) * .05; cy += (ty - cy) * .05;
      net.style.transform = "rotateX(" + (-cy * 5).toFixed(3) + "deg) rotateY(" + (cx * 8).toFixed(3) + "deg)";
      raf = visible ? requestAnimationFrame(loop) : 0;
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(loop);
      }).observe(hero);
    } else raf = requestAnimationFrame(loop);
  }

  /* ---------- Header ---------- */
  var NAV = {
    learner: [["find", "Find teachers", "search.html"], ["requests", "My requests", "learner.html"], ["chats", "Chats", "chat.html"]],
    teacher: [["home", "Home", "teacher-home.html"], ["chats", "Chats", "chat-teacher.html"]]
  };
  function roleSwitch(role) {
    return '<div class="role-switch">' +
      '<a class="learning' + (role === "learner" ? " is-active" : "") + '" href="learner.html">Learning</a>' +
      '<a class="teaching' + (role === "teacher" ? " is-active" : "") + '" href="teacher-home.html">Teaching</a></div>';
  }
  function renderHeader() {
    var h = document.querySelector("header[data-header]");
    if (!h) return;
    var v = h.getAttribute("data-header");
    var active = h.getAttribute("data-active") || "";
    var logo = '<a class="logo" href="index.html" aria-label="LeaLink home">' + logoInner() + "</a>";
    var html = logo;
    h.classList.add("site-header");

    if (v === "guest") {
      html += '<div class="header-right"><a class="btn btn-secondary" href="login.html">Log in</a></div>';
    } else if (v === "auth") {
      html += '<div class="header-right"><a class="header-link" href="index.html"><i data-i="back"></i> Back to home</a></div>';
    } else if (v === "wizard") {
      html += '<div class="header-center">Create your teacher profile</div>' +
        '<div class="header-right"><span class="header-link hide-mobile" style="cursor:default"><i data-i="check"></i> Saved as draft · 2 min ago</span>' +
        '<a class="header-link" href="index.html"><i data-i="x"></i> Exit</a></div>';
    } else {
      var items = NAV[v] || [];
      var initials = v === "teacher" ? "OK" : "AP";
      html += '<nav class="nav">' + items.map(function (it) {
        return '<a href="' + it[2] + '"' + (it[0] === active ? ' class="is-active"' : "") + ">" + it[1] + "</a>";
      }).join("") + "</nav>" + roleSwitch(v) +
        '<div class="header-right">' +
        '<button class="icon-btn" type="button" aria-label="Notifications" data-toast="No new notifications."><i data-i="bell"></i></button>' +
        '<button class="icon-btn menu-btn" type="button" aria-label="Menu" data-drawer><i data-i="menu" data-size="18"></i></button>' +
        '<div class="account"><button class="account-btn" type="button" data-menu-trigger aria-label="Account menu"><span class="avatar av-32">' + initials + '</span><i data-i="chev" class="chev"></i></button>' +
        '<div class="menu"><a href="settings.html">Account settings</a><a href="screens.html">All screens</a><div class="menu-sep"></div><a href="index.html">Log out</a></div></div>' +
        "</div>" +
        '<div class="drawer">' + items.map(function (it) {
          return '<a class="drawer-link' + (it[0] === active ? " is-active" : "") + '" href="' + it[2] + '">' + it[1] + "</a>";
        }).join("") + '<a class="drawer-link" href="settings.html">Account settings</a>' + roleSwitch(v) + "</div>";
    }
    h.innerHTML = html;
  }

  /* ---------- URL state: ?state=, ?tab=, ?dialog=, ?toast=, ?step= ---------- */
  var params = new URLSearchParams(location.search);
  function applyState() {
    var state = params.get("state") || "default";
    document.querySelectorAll("[data-show-state]").forEach(function (el) {
      var list = el.getAttribute("data-show-state").split(/\s+/);
      el.hidden = list.indexOf(state) === -1;
    });
    if (state === "errors") applyErrorOverrides();
  }
  function applyErrorOverrides() {
    document.querySelectorAll("[data-err-value]").forEach(function (el) { el.value = el.getAttribute("data-err-value"); });
    document.querySelectorAll("[data-err-active]").forEach(function (btn) { activateSeg(btn); });
    document.querySelectorAll("[data-err-unselect]").forEach(function (el) {
      el.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("is-selected"); });
    });
    document.querySelectorAll("[data-err-class]").forEach(function (el) { el.classList.add(el.getAttribute("data-err-class")); });
    document.querySelectorAll("[data-err-placeholder]").forEach(function (el) { el.value = ""; el.placeholder = el.getAttribute("data-err-placeholder"); });
  }

  /* ---------- Toasts ---------- */
  var region;
  function toast(text, opts) {
    opts = opts || {};
    if (!region) { region = document.createElement("div"); region.className = "toast-region"; region.setAttribute("role", "status"); document.body.appendChild(region); }
    var t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = icon("check") + "<span>" + text + "</span>" +
      (opts.undo ? '<button type="button" class="undo">Undo</button>' : "") +
      '<button type="button" aria-label="Dismiss">' + icon("x", 14) + "</button>";
    region.appendChild(t);
    var kill = function () { t.remove(); };
    t.querySelectorAll("button").forEach(function (b) { b.addEventListener("click", kill); });
    if (!opts.sticky) setTimeout(kill, 5000);
  }
  window.LeaLink.toast = toast;
  var DEMO = "Prototype: this action isn't connected yet.";

  /* ---------- Segmented controls ---------- */
  function activateSeg(btn) {
    var group = btn.closest(".seg");
    if (!group) return;
    group.querySelectorAll("button").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
    var ctl = group.getAttribute("data-controls");
    if (ctl) document.querySelectorAll(ctl).forEach(function (el) { el.hidden = !btn.hasAttribute("data-reveal"); });
  }

  /* ---------- Range sliders ---------- */
  function initRange(r) {
    var min = +r.dataset.min, max = +r.dataset.max;
    var vals = [+r.dataset.from, +r.dataset.to];
    var thumbs = r.querySelectorAll(".range-thumb"), fill = r.querySelector(".range-fill");
    var out = document.querySelector(r.dataset.output);
    var suffix = r.dataset.suffix || "";
    function pct(v) { return ((v - min) / (max - min)) * 100; }
    function fmt(v) { return "$" + v + (v >= max ? "+" : ""); }
    function draw() {
      thumbs[0].style.left = pct(vals[0]) + "%"; thumbs[1].style.left = pct(vals[1]) + "%";
      fill.style.left = pct(vals[0]) + "%"; fill.style.width = (pct(vals[1]) - pct(vals[0])) + "%";
      if (out) out.textContent = fmt(vals[0]) + " – " + fmt(vals[1]) + suffix;
    }
    thumbs.forEach(function (th, i) {
      th.addEventListener("pointerdown", function (e) {
        e.preventDefault(); th.setPointerCapture(e.pointerId);
        function move(ev) {
          var rect = r.getBoundingClientRect();
          var v = Math.round(min + Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) * (max - min));
          vals[i] = i === 0 ? Math.min(v, vals[1] - 1) : Math.max(v, vals[0] + 1);
          draw();
        }
        function up() { th.removeEventListener("pointermove", move); th.removeEventListener("pointerup", up); }
        th.addEventListener("pointermove", move); th.addEventListener("pointerup", up);
      });
    });
    draw();
  }

  /* ---------- Textarea / input counters ---------- */
  function initCounter(el) {
    var out = document.querySelector(el.dataset.counter);
    var max = el.dataset.max, min = el.dataset.min;
    function draw() {
      var n = el.value.length;
      out.textContent = n + (max ? " / " + max : "") + (min ? " · min " + min : "");
    }
    el.addEventListener("input", draw); draw();
  }

  /* ---------- Star rating ---------- */
  var STAR_LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
  function initStars(box) {
    var btns = box.querySelectorAll("button"), label = box.querySelector(".star-label");
    function set(n) {
      btns.forEach(function (b, i) { b.classList.toggle("on", i < n); });
      if (label) label.textContent = n + " of 5 · " + STAR_LABELS[n];
    }
    btns.forEach(function (b, i) { b.addEventListener("click", function () { set(i + 1); }); });
    set(+box.dataset.value || 0);
  }

  /* ---------- Wizard ---------- */
  function initWizard(w) {
    var panels = w.querySelectorAll("[data-step-panel]");
    var steps = document.querySelectorAll(".step[data-go]");
    var names = ["Basics", "Subjects", "Experience", "Format", "Price & availability", "Requests", "Preview"];
    var bandLabel = document.querySelector("[data-wizard-label]");
    var bandPct = document.querySelector("[data-wizard-pct]");
    var bar = document.querySelector("[data-wizard-bar]");
    function show(n) {
      n = Math.max(1, Math.min(7, n));
      panels.forEach(function (p) { p.hidden = +p.dataset.stepPanel !== n; });
      steps.forEach(function (s) {
        var k = +s.dataset.go;
        s.classList.toggle("is-current", k === n);
        s.classList.toggle("is-done", k < n);
      });
      var pct = Math.round((Math.min(n, 6) / 6) * 100);
      if (bandLabel) bandLabel.textContent = n === 7 ? "Preview" : "Step " + n + " of 6 · " + names[n - 1];
      if (bandPct) bandPct.textContent = pct + "% complete";
      if (bar) bar.style.width = pct + "%";
      var url = new URL(location.href); url.searchParams.set("step", n); history.replaceState(null, "", url);
      window.scrollTo(0, 0);
    }
    document.addEventListener("click", function (e) {
      var go = e.target.closest("[data-go]");
      if (go) { e.preventDefault(); show(+go.dataset.go); }
    });
    var start = params.get("step");
    show(start === "preview" ? 7 : +start || 1);
  }

  /* ---------- Global click handling ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var el;

    if ((el = t.closest("[data-sheet]"))) {
      document.querySelector(el.dataset.sheet).classList.toggle("is-open");
      return;
    }

    if ((el = t.closest(".seg > button"))) { activateSeg(el); return; }

    if ((el = t.closest(".chip"))) {
      var single = el.closest("[data-single]");
      if (single) single.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("is-selected", c === el); });
      else el.classList.toggle("is-selected");
      var box = el.closest(".is-error"); if (box) box.classList.remove("is-error");
      return;
    }

    if ((el = t.closest(".tag-chip .x"))) { el.closest(".tag-chip").remove(); return; }

    if ((el = t.closest("[data-tab]"))) {
      var scope = el.closest("[data-tabs-scope]") || document;
      scope.querySelectorAll("[data-tab]").forEach(function (b) { b.classList.toggle("is-active", b.dataset.tab === el.dataset.tab); });
      scope.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.dataset.panel !== el.dataset.tab; });
      return;
    }

    if ((el = t.closest("[data-open]"))) {
      e.preventDefault();
      var d = document.getElementById(el.dataset.open);
      if (d && d.showModal) d.showModal();
      return;
    }
    if ((el = t.closest("[data-close]"))) {
      var dlg = el.closest("dialog");
      if (dlg) dlg.close();
      if (el.dataset.toast) toast(el.dataset.toast, { undo: el.hasAttribute("data-undo") });
      return;
    }
    if (t.tagName === "DIALOG") { t.close(); return; }

    if ((el = t.closest("[data-menu-trigger]"))) {
      var menu = el.parentElement.querySelector(".menu");
      var open = menu.classList.contains("is-open");
      closeMenus();
      menu.classList.toggle("is-open", !open);
      return;
    }
    if ((el = t.closest(".menu .menu-item"))) {
      var m = el.closest(".menu");
      m.querySelectorAll(".menu-item").forEach(function (i) { i.classList.toggle("is-selected", i === el); });
      var label = m.parentElement.querySelector("[data-menu-label]");
      if (label) label.textContent = el.dataset.label || el.textContent.trim();
      m.classList.remove("is-open");
      return;
    }
    if (!t.closest(".menu")) closeMenus();

    if ((el = t.closest("[data-drawer]"))) { document.querySelector(".drawer").classList.toggle("is-open"); return; }

    if ((el = t.closest("[data-cell]"))) { el.classList.toggle("on"); return; }

    if ((el = t.closest("[data-role-card]"))) {
      document.querySelectorAll("[data-role-card]").forEach(function (c) { c.classList.toggle("is-selected", c === el); });
      var form = el.closest("[data-role-form]");
      form.classList.toggle("role-learner", el.dataset.roleCard === "learner");
      form.classList.toggle("role-teacher", el.dataset.roleCard === "teacher");
      form.querySelector("[data-role-submit]").setAttribute("href", el.dataset.href);
      return;
    }

    if ((el = t.closest(".conv"))) {
      document.querySelectorAll(".conv").forEach(function (c) { c.classList.toggle("is-active", c === el); });
      var badge = el.querySelector(".unread"); if (badge) badge.remove();
      document.querySelector(".chat").classList.remove("show-list");
      return;
    }
    if ((el = t.closest("[data-chat-back]"))) { document.querySelector(".chat").classList.add("show-list"); return; }

    if ((el = t.closest(".side-nav a"))) {
      document.querySelectorAll(".side-nav a").forEach(function (a) { a.classList.toggle("is-active", a === el); });
      return;
    }

    if ((el = t.closest("[data-remove-row]"))) { el.closest(".input-row, .file-row").remove(); return; }

    if ((el = t.closest("[data-toast]"))) { e.preventDefault(); toast(el.dataset.toast, { undo: el.hasAttribute("data-undo") }); return; }
    if ((el = t.closest("[data-demo]"))) { e.preventDefault(); toast(DEMO); return; }
  });

  function closeMenus() { document.querySelectorAll(".menu.is-open").forEach(function (m) { m.classList.remove("is-open"); }); }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenus();
    var inp = e.target.closest && e.target.closest("[data-tag-input]");
    if (inp && e.key === "Enter" && inp.value.trim()) {
      e.preventDefault();
      var chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = inp.value.trim();
      chip.insertAdjacentHTML("beforeend", '<button class="x" type="button" aria-label="Remove">' + icon("x", 12) + "</button>");
      inp.parentElement.querySelector(".chips").appendChild(chip);
      inp.value = "";
    }
  });

  /* Chat composer */
  document.addEventListener("submit", function (e) {
    var f = e.target;
    e.preventDefault();
    if (f.matches("[data-composer]")) {
      var input = f.querySelector("input"), text = input.value.trim();
      if (!text) return;
      var thread = document.querySelector(".thread");
      var msg = document.createElement("div");
      msg.className = "msg me";
      var now = new Date();
      msg.innerHTML = '<div class="bubble"></div><time>' + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + "</time>";
      msg.querySelector(".bubble").textContent = text;
      thread.appendChild(msg);
      input.value = "";
      thread.scrollTop = thread.scrollHeight;
    } else if (f.dataset.href) {
      location.href = f.dataset.href;
    }
  });

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    brandDefs();
    renderHeader();
    renderLogos();
    applyState();
    decorateBands();
    renderIcons();
    initHero();
    initReveal();

    document.querySelectorAll("[data-range]").forEach(initRange);
    document.querySelectorAll("[data-counter]").forEach(initCounter);
    document.querySelectorAll("[data-stars]").forEach(initStars);
    document.querySelectorAll("[data-wizard]").forEach(initWizard);

    var tab = params.get("tab");
    if (tab) { var tb = document.querySelector('[data-tab="' + tab + '"]'); if (tb) tb.click(); }
    var dialog = params.get("dialog");
    if (dialog) { var dl = document.getElementById(dialog); if (dl && dl.showModal) dl.showModal(); }
    var tst = params.get("toast");
    if (tst) { var src = document.querySelector('[data-toast-id="' + tst + '"]'); if (src) toast(src.textContent.trim(), { sticky: true }); }
    if (params.get("menu") === "sort") { var sm = document.querySelector("#sort-menu"); if (sm) sm.classList.add("is-open"); }
    var thread = document.querySelector(".thread"); if (thread) thread.scrollTop = thread.scrollHeight;
  });
})();
