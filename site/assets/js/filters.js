/* The teacher search form: search.html and the filter panel on results.html.
   Controls are marked with data-f="<filter>" and, for custom controls, data-type:
   seg (segmented buttons), one (single chip), many (chips), tags (typed tags), range (budget slider). */
(function () {
  "use strict";

  const DEFAULTS = {
    subject: "English", topics: [], for_whom: "myself", level: "", goal: "",
    format: "both", city: "", radius: "5", language: "", lesson_type: "", lessons_per_week: "1",
    min_experience: "", price_min: null, price_max: null, currency: "USD", times: [],
    min_rating: "", free_trial: false, verified: false,
  };
  const LISTS = ["topics", "times"];
  const BOOLS = ["free_trial", "verified"];
  // Slider bounds per currency; the top value means "no upper limit".
  const BOUNDS = { USD: [5, 60, "$"], EUR: [5, 60, "€"], UAH: [200, 2500, "₴"] };

  function read(root) {
    const f = Object.assign({}, DEFAULTS, { topics: [], times: [] });
    root.querySelectorAll("[data-f]").forEach((el) => {
      const key = el.dataset.f;
      const type = el.dataset.type;
      if (type === "seg") {
        const on = el.querySelector(".is-active");
        f[key] = on ? on.dataset.v : "";
      } else if (type === "one") {
        const on = el.querySelector(".chip.is-selected");
        f[key] = on ? on.dataset.v : "";
      } else if (type === "many") {
        el.querySelectorAll(".chip.is-selected").forEach((c) => f[key].push(c.dataset.v));
      } else if (type === "tags") {
        el.querySelectorAll(".tag-chip").forEach((c) => f[key].push(c.textContent.trim()));
      } else if (type === "range") {
        const r = el.getRange();
        f.price_min = r.from > r.min ? r.from : null;
        f.price_max = r.to < r.max ? r.to : null;
      } else if (el.type === "checkbox") {
        f[key] = el.checked;
      } else {
        f[key] = el.value.trim();
      }
    });
    return f;
  }

  function tagChip(text) {
    const t = LL.esc(text);
    return `<span class="tag-chip">${t}<button class="x" type="button" aria-label="Remove ${t}">${LL.icon("x", 12)}</button></span>`;
  }

  function write(root, f) {
    f = Object.assign({}, DEFAULTS, f);
    root.querySelectorAll("[data-f]").forEach((el) => {
      const key = el.dataset.f;
      const type = el.dataset.type;
      const value = f[key];
      if (type === "seg") {
        const btn = el.querySelector(`button[data-v="${value || ""}"]`) || el.querySelector("button");
        if (!btn.classList.contains("is-active")) btn.click(); // lealink.js also shows/hides dependent fields
      } else if (type === "one") {
        el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-selected", c.dataset.v === String(value || "")));
      } else if (type === "many") {
        el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-selected", (value || []).includes(c.dataset.v)));
      } else if (type === "tags") {
        el.querySelector(".chips").innerHTML = (value || []).map(tagChip).join("");
      } else if (type === "range") {
        const b = BOUNDS[f.currency] || BOUNDS.USD;
        el.setRange(f.price_min, f.price_max, b[0], b[1], b[2]);
        const labels = el.parentElement.querySelectorAll(".range-labels span");
        if (labels.length === 2) {
          labels[0].textContent = b[2] + b[0];
          labels[1].textContent = b[2] + b[1] + "+";
        }
      } else if (el.type === "checkbox") {
        el.checked = !!value;
      } else if (el.tagName === "SELECT" && value && !Array.from(el.options).some((o) => o.value === String(value))) {
        el.insertAdjacentHTML("beforeend", `<option>${LL.esc(value)}</option>`);
        el.value = value;
      } else {
        el.value = value == null ? "" : value;
      }
    });
  }

  /* Query string for the API and for results.html (extra keys are ignored by the API). */
  function toQuery(f, extra) {
    const q = new URLSearchParams();
    Object.entries(Object.assign({}, f, extra || {})).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach((v) => q.append(key, v));
      else if (value === true) q.set(key, "true");
      else if (value !== null && value !== undefined && value !== "" && value !== false) q.set(key, value);
    });
    if (!f.city) q.delete("radius");
    return q.toString();
  }

  function fromQuery(q) {
    const f = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach((key) => {
      if (LISTS.includes(key)) f[key] = q.getAll(key);
      else if (BOOLS.includes(key)) f[key] = q.get(key) === "true";
      else if (q.has(key)) f[key] = key.startsWith("price_") ? Number(q.get(key)) : q.get(key);
    });
    return f;
  }

  const LEVEL = { A1: "A1", A2: "A2", B1: "B1", B2: "B2", C1: "C1", C2: "C2" };

  function formatText(f) {
    const city = f.city ? `${f.city}${f.radius ? " " + f.radius + " km" : ""}` : "";
    if (f.format === "online") return "Online";
    if (f.format === "offline") return city ? `Offline · ${city}` : "Offline";
    return city ? `Online or ${city}` : "";
  }
  function priceText(f) {
    const s = (BOUNDS[f.currency] || BOUNDS.USD)[2];
    if (f.price_min == null && f.price_max == null) return "";
    if (f.price_max == null) return `${s}${f.price_min}+`;
    return `${s}${f.price_min == null ? (BOUNDS[f.currency] || BOUNDS.USD)[0] : f.price_min}–${s}${f.price_max}`;
  }

  /* Filters that can hide teachers, as chips that can be removed (empty result). */
  function strict(f) {
    return [
      ["format", formatText(f)],
      ["price", priceText(f)],
      ["language", f.language ? `Lessons in ${f.language}` : ""],
      ["lesson_type", f.lesson_type ? LL.labels.lessonType[f.lesson_type] : ""],
      ["min_experience", f.min_experience ? `${f.min_experience}+ years` : ""],
      ["min_rating", f.min_rating ? `${f.min_rating}+` : ""],
      ["free_trial", f.free_trial ? "Free trial only" : ""],
      ["verified", f.verified ? "Verified only" : ""],
    ].filter((x) => x[1]).map(([key, text]) => ({ key, text }));
  }

  function without(f, key) {
    const g = Object.assign({}, f);
    if (key === "format") Object.assign(g, { format: "both", city: "" });
    else if (key === "price") Object.assign(g, { price_min: null, price_max: null });
    else g[key] = DEFAULTS[key];
    return g;
  }

  /* Short tags describing the search ("English", "B1", "$15–$35", ...). */
  function summary(f) {
    return [
      f.subject,
      ...f.topics,
      f.for_whom === "child" ? "My child" : f.for_whom === "myself" ? "Myself" : "",
      LEVEL[f.level] || "",
      f.goal,
      formatText(f),
      priceText(f),
      LL.timesText(f.times),
      f.lessons_per_week ? `${f.lessons_per_week} / week` : "",
      f.lesson_type ? LL.labels.lessonType[f.lesson_type] : "",
      f.language ? `In ${f.language}` : "",
      f.min_experience ? `${f.min_experience}+ years` : "",
      f.min_rating ? `${f.min_rating}+` : "",
      f.free_trial ? "Free trial" : "",
      f.verified ? "Verified" : "",
    ].filter(Boolean);
  }

  /* Call `fn` after any change in the form. */
  function watch(root, fn) {
    const later = LL.debounce(fn, 300);
    ["click", "change", "input"].forEach((type) => root.addEventListener(type, later));
    root.addEventListener("keydown", (e) => { if (e.key === "Enter") later(); });
    root.querySelectorAll('[data-f="currency"]').forEach((sel) =>
      sel.addEventListener("change", () => {
        const f = read(root);
        write(root, Object.assign(f, { price_min: null, price_max: null }));
      })
    );
  }

  /* Subject and goal options from the API (keeps the static ones if the API is unavailable). */
  async function loadOptions(root) {
    try {
      const meta = await LL.api.get("/meta");
      root.querySelectorAll('select[data-f="subject"]').forEach((sel) => {
        sel.innerHTML = meta.subjects.map((s) => `<option>${LL.esc(s)}</option>`).join("");
      });
      return meta;
    } catch (e) {
      return null;
    }
  }

  window.LL.filters = { DEFAULTS, read, write, toQuery, fromQuery, strict, without, summary, watch, loadOptions };
})();
