/* The teacher search form: search.html and the filter panel on results.html.
   The subject box ([data-f="subject"]) comes first; the chosen subject's own fields appear in
   [data-subject-fields] (LL.subjects). Other controls are marked with data-f="<filter>" and, for custom
   controls, data-type: seg (segmented buttons), one (single chip), many (chips), range (budget slider). */
(function () {
  "use strict";

  const S = LL.subjects;
  const DEFAULTS = {
    subject: "", attrs: {}, for_whom: "myself",
    format: "both", city: "", radius: "5", language: "", lesson_type: "", lessons_per_week: "1",
    min_experience: "", price_min: null, price_max: null, currency: "USD", times: [],
    min_rating: "", free_trial: false, verified: false,
  };
  const LISTS = ["times"];
  const BOOLS = ["free_trial", "verified"];
  // Slider bounds per currency; the top value means "no upper limit".
  const BOUNDS = { USD: [5, 60, "$"], EUR: [5, 60, "€"], UAH: [200, 2500, "₴"] };
  const asList = (v) => (v == null || v === "" || v === false ? [] : Array.isArray(v) ? v : [v]);

  function read(root) {
    const f = Object.assign({}, DEFAULTS, { times: [], attrs: {} });
    const picker = root.querySelector('[data-f="subject"]');
    if (picker && picker.getValue) f.subject = picker.getValue();
    const box = root.querySelector("[data-subject-fields]");
    if (box && box._subject) f.attrs = S.read(box);
    root.querySelectorAll("[data-f]").forEach((el) => {
      const key = el.dataset.f;
      const type = el.dataset.type;
      if (type === "subject") return;
      if (type === "seg") {
        const on = el.querySelector(".is-active");
        f[key] = on ? on.dataset.v : "";
      } else if (type === "one") {
        const on = el.querySelector(".chip.is-selected");
        f[key] = on ? on.dataset.v : "";
      } else if (type === "many") {
        el.querySelectorAll(".chip.is-selected").forEach((c) => f[key].push(c.dataset.v));
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

  /* The subject's fields under the subject box, keeping the answers that still fit. */
  function renderSubject(root, attrs, forWhom) {
    const picker = root.querySelector('[data-f="subject"]');
    const box = root.querySelector("[data-subject-fields]");
    if (!picker || !box) return;
    const subject = S.get(picker.getValue());
    S.render(box, subject, "learner", attrs, { forWhom: true, forWhomValue: forWhom });
    root.querySelectorAll("[data-subject-only]").forEach((el) => (el.hidden = !subject));
  }

  function write(root, f) {
    f = Object.assign({}, DEFAULTS, f);
    const picker = root.querySelector('[data-f="subject"]');
    if (picker && picker.setValue) {
      picker.setValue(f.subject);
      renderSubject(root, f.attrs, f.for_whom);
    }
    root.querySelectorAll("[data-f]").forEach((el) => {
      const key = el.dataset.f;
      const type = el.dataset.type;
      const value = f[key];
      if (type === "subject") return;
      if (type === "seg") {
        const btn = el.querySelector(`button[data-v="${value || ""}"]`) || el.querySelector("button");
        if (!btn.classList.contains("is-active")) btn.click(); // lealink.js also shows/hides dependent fields
      } else if (type === "one") {
        el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-selected", c.dataset.v === String(value || "")));
      } else if (type === "many") {
        el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-selected", (value || []).includes(c.dataset.v)));
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
    const box = root.querySelector("[data-subject-fields]");
    if (box) S.sync(box);
  }

  /* Query string for the API and for results.html: subject answers go as attr=key:value (extra keys are ignored by the API). */
  function toQuery(f, extra) {
    const q = new URLSearchParams();
    Object.entries(Object.assign({}, f, extra || {})).forEach(([key, value]) => {
      if (key === "attrs") {
        Object.entries(value || {}).forEach(([k, v]) => asList(v).forEach((x) => q.append("attr", `${k}:${x === true ? 1 : x}`)));
      } else if (Array.isArray(value)) value.forEach((v) => q.append(key, v));
      else if (value === true) q.set(key, "true");
      else if (value !== null && value !== undefined && value !== "" && value !== false) q.set(key, value);
    });
    if (!f.city) q.delete("radius");
    return q.toString();
  }

  /* JSON body for POST /api/alerts: the same filters, with the subject answers as attr=["key:value"]. */
  function toBody(f) {
    const body = Object.assign({}, f, { attr: [] });
    delete body.attrs;
    Object.entries(f.attrs || {}).forEach(([k, v]) => asList(v).forEach((x) => body.attr.push(`${k}:${x === true ? 1 : x}`)));
    return body;
  }

  function fromQuery(q) {
    const f = Object.assign({}, DEFAULTS, { attrs: {} });
    Object.keys(DEFAULTS).forEach((key) => {
      if (key === "attrs") return;
      if (LISTS.includes(key)) f[key] = q.getAll(key);
      else if (BOOLS.includes(key)) f[key] = q.get(key) === "true";
      else if (q.has(key)) f[key] = key.startsWith("price_") ? Number(q.get(key)) : q.get(key);
    });
    q.getAll("attr").forEach((item) => {
      const i = item.indexOf(":");
      if (i > 0) (f.attrs[item.slice(0, i)] = f.attrs[item.slice(0, i)] || []).push(item.slice(i + 1));
    });
    return f;
  }

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

  /* The learner's subject answers as short texts, in the order of the subject's fields. */
  function attrTexts(f, onlyStrict) {
    const subject = S.get(f.subject);
    if (!subject) return [];
    return S.fieldsFor(subject, "learner")
      .filter((fd) => S.labels(subject, fd.key, f.attrs[fd.key], "learner").length && (!onlyStrict || fd.strict))
      .map((fd) => {
        const value = S.labels(subject, fd.key, f.attrs[fd.key], "learner").join(", ");
        if (fd.match === "has") return { key: "attr:" + fd.key, text: fd.learner, value: fd.learner };
        const short = ["level", "goal", "topics"].includes(fd.key) || fd.match === "overlap";
        return { key: "attr:" + fd.key, text: `${fd.key === "age" ? "Child’s age" : fd.learner}: ${value}`, value: short ? value : `${fd.learner}: ${value}` };
      });
  }

  /* Filters that can hide teachers, as chips that can be removed (empty result). */
  function strict(f) {
    return [
      ...attrTexts(f, true).map((a) => [a.key, a.text]),
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
    const g = Object.assign({}, f, { attrs: Object.assign({}, f.attrs) });
    if (key.startsWith("attr:")) delete g.attrs[key.slice(5)];
    else if (key === "format") Object.assign(g, { format: "both", city: "" });
    else if (key === "price") Object.assign(g, { price_min: null, price_max: null });
    else g[key] = DEFAULTS[key];
    return g;
  }

  /* Short tags describing the search ("English", "B1", "$15–$35", ...). */
  function summary(f) {
    if (!f.subject) return [];
    const subject = S.get(f.subject);
    return [
      f.subject,
      subject && subject.kids_only ? "" : f.for_whom === "child" ? "My child" : "Myself",
      ...attrTexts(f).map((a) => a.value),
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

  /* Required before showing results: the subject, its required fields (level, goal, child's age),
     and the city for offline-only lessons. Marks the fields and returns the names of the empty ones. */
  function validate(root) {
    const f = read(root);
    const missing = [];
    const subjectField = root.querySelector('[data-f="subject"]').closest(".field");
    LL.fieldError(subjectField, f.subject ? null : "Choose a subject.");
    if (!f.subject) missing.push("Subject");
    const box = root.querySelector("[data-subject-fields]");
    if (box && box._subject) missing.push(...S.validate(box));
    const city = root.querySelector('[data-f="city"]');
    if (city) {
      const need = f.format === "offline" && !f.city;
      LL.fieldError(city.closest(".field"), need ? "Enter a city for offline lessons." : null);
      if (need) missing.push("City");
    }
    return missing;
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

  /* The catalog from the API, then the subject box. A new subject keeps the answers its fields share. */
  async function loadOptions(root) {
    try {
      await S.load();
    } catch (e) {
      return null;
    }
    root.querySelectorAll('[data-f="subject"]').forEach((el) => {
      S.picker(el, {
        onPick: () => {
          const f = read(root);
          renderSubject(root, f.attrs, f.for_whom);
        },
      });
    });
    return true;
  }

  window.LL.filters = { DEFAULTS, read, write, toQuery, toBody, fromQuery, strict, without, summary, watch, loadOptions, validate };
})();
