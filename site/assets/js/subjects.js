/* Subjects and their fields (the catalog from GET /api/meta, built in backend/app/catalog.py).
   LL.subjects.picker()  — the subject box: a dropdown list with search by name.
   LL.subjects.render()  — the fields of one subject, for the teacher (wizard) or the learner (search, request).
   Every field is a pair: the teacher describes themselves, the learner says whom they look for,
   both from the same options, so the API can compare them. Values are option keys. */
(function () {
  "use strict";

  const { esc, icon } = LL;
  let loading = null;
  let meta = null;
  const byName = new Map();

  /* ---------- Catalog ---------- */

  function load() {
    if (!loading) {
      loading = LL.api.get("/meta").then((m) => {
        meta = m;
        m.catalog.subjects.forEach((s) => {
          s.by = Object.fromEntries(s.fields.map((f) => [f.key, f]));
          [s.name, ...s.aliases].forEach((n) => byName.set(fold(n), s));
        });
        return m;
      });
      loading.catch(() => (loading = null));
    }
    return loading;
  }

  const fold = (s) => String(s || "").trim().toLowerCase().replace(/[’ʼ`]/g, "'");
  const get = (name) => byName.get(fold(name)) || null;
  const all = () => (meta ? meta.catalog.subjects : []);

  const choices = (f, side) => (side !== "teacher" && f.learner_options ? f.learner_options : f.options);
  const optionOf = (list, key) => list.find((o) => o.key === key);
  const rank = (list, key) => {
    const o = optionOf(list, key);
    return !o ? null : o.n != null ? o.n : list.indexOf(o);
  };
  const asList = (v) => (v == null || v === "" || v === false ? [] : Array.isArray(v) ? v : [v]);

  /* Readable text of an answer: labels of the chosen options. */
  function labels(subject, key, value, side) {
    const f = subject && subject.by[key];
    if (!f) return [];
    if (value === true) return ["Yes"];
    return asList(value).map((v) => optionOf(choices(f, side), v)).filter(Boolean).map((o) => o.label);
  }

  /* A `when` field is shown only if the controlling answer has the value (teachers pick several goals). */
  function shown(f, answers) {
    if (!f.when) return true;
    const v = answers[f.when[0]];
    return Array.isArray(v) ? v.includes(f.when[1]) : v === f.when[1];
  }

  /* Which fields a side answers: the teacher, the learner in the search, the learner in a request. */
  function fieldsFor(subject, side) {
    return subject.fields.filter((f) => {
      if (side === "teacher") return !!f.teacher;
      if (!f.learner) return false;
      if (side === "request") return f.request && f.key !== "age";
      return f.match !== "info";
    });
  }

  /* Required answers the teacher hasn't given yet (the same rule as catalog.teacher_missing). */
  function teacherMissing(subject, attrs) {
    const missing = subject.fields
      .filter((f) => f.teacher && f.required && shown(f, attrs) && !asList(attrs[f.key]).length)
      .map((f) => f.teacher);
    subject.fields.forEach((f) => {
      if (!f.cap || !attrs[f.key] || !attrs[f.cap]) return;
      const top = rank(subject.by[f.cap].options, attrs[f.cap]);
      if (asList(attrs[f.key]).some((v) => rank(f.options, v) > top)) missing.push(`${f.teacher} (not above your own level)`);
    });
    return missing;
  }

  /* Tags for the teacher card: labels of the topic-like fields. */
  function tags(offers) {
    const out = [];
    (offers || []).forEach((o) => {
      const s = get(o.subject);
      if (s) s.fields.filter((f) => f.tags).forEach((f) => out.push(...labels(s, f.key, (o.attrs || {})[f.key], "teacher")));
    });
    return out;
  }

  /* ---------- Subject picker ---------- */

  /* el: an empty container. opts: {multiple, max, placeholder, onPick(name), taken() -> names already chosen} */
  function picker(el, opts) {
    opts = opts || {};
    let value = "";
    let active = -1;
    const id = "combo-" + Math.random().toString(36).slice(2, 8);
    el.classList.add("combo");
    el.innerHTML = `<div class="input-icon">${icon("search")}<input class="input" role="combobox" aria-expanded="false" aria-controls="${id}" aria-autocomplete="list" autocomplete="off" placeholder="${esc(opts.placeholder || "Search subjects, e.g. English or Math")}" aria-label="Subject"></div>
      <button class="combo-toggle" type="button" tabindex="-1" aria-label="Show all subjects">${icon("chev")}</button>
      <div class="combo-list" role="listbox" id="${id}" hidden></div>`;
    const input = el.querySelector("input");
    const list = el.querySelector(".combo-list");
    const taken = () => (opts.taken ? opts.taken() : []);

    function matches(s, q) {
      if (!q) return true;
      return [s.name, ...s.aliases].some((n) => fold(n).includes(q));
    }

    function draw() {
      const q = input.value === value && !opts.multiple ? "" : fold(input.value);
      const chosen = opts.multiple ? taken() : [value];
      let html = "";
      let i = 0;
      meta.catalog.categories.forEach((cat) => {
        const items = all().filter((s) => s.category === cat && matches(s, q));
        if (!items.length) return;
        html += `<div class="combo-group">${esc(cat)}</div>`;
        items.forEach((s) => {
          const on = chosen.includes(s.name);
          const alias = q && !fold(s.name).includes(q) ? s.aliases.find((a) => fold(a).includes(q)) : "";
          const disabled = on && opts.multiple;
          html += `<button class="combo-option" type="button" role="option" data-i="${i++}" data-name="${esc(s.name)}" aria-selected="${on}"${disabled ? ' aria-disabled="true"' : ""}>
            <span>${esc(s.name)}${alias ? ` <small>${esc(alias)}</small>` : ""}</span>${on ? icon("check", 16).replace('class="i', 'class="check-mark i') : ""}</button>`;
        });
      });
      list.innerHTML = html || `<div class="combo-empty">No subjects match “${esc(input.value.trim())}”.</div>`;
      active = -1;
      const first = q ? list.querySelector(".combo-option:not([aria-disabled])") : null;
      if (first) setActive(+first.dataset.i);
      const current = !q && !opts.multiple && list.querySelector('.combo-option[aria-selected="true"]');
      list.scrollTop = current ? current.offsetTop - 40 : 0;
    }

    function setActive(i) {
      const items = list.querySelectorAll(".combo-option");
      if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach((b, k) => b.classList.toggle("is-active", k === active));
      items[active].scrollIntoView({ block: "nearest" });
    }

    function open() {
      if (!meta || !list.hidden) return;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      draw();
    }
    function close() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      if (!opts.multiple) input.value = value;
    }

    function pick(name) {
      if (opts.multiple && taken().includes(name)) return;
      if (!opts.multiple) value = name;
      input.value = opts.multiple ? "" : name;
      close();
      if (opts.onPick) opts.onPick(name);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    input.addEventListener("focus", () => {
      if (!opts.multiple) input.select();
      open();
    });
    input.addEventListener("click", open);
    input.addEventListener("input", () => {
      if (list.hidden) open();
      else draw();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        open();
        setActive(active + (e.key === "ArrowDown" ? 1 : -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation(); // not a tag input, not a form submit
        const b = list.querySelector(`.combo-option[data-i="${active}"]`);
        if (b && !b.hasAttribute("aria-disabled")) pick(b.dataset.name);
      } else if (e.key === "Escape") {
        close();
      } else if (e.key === "Tab") {
        close();
      }
    });
    el.querySelector(".combo-toggle").addEventListener("click", () => {
      if (list.hidden) {
        input.focus();
        open();
      } else close();
    });
    list.addEventListener("mousedown", (e) => e.preventDefault()); // keep the focus in the input
    list.addEventListener("click", (e) => {
      const b = e.target.closest(".combo-option");
      if (b && !b.hasAttribute("aria-disabled")) pick(b.dataset.name);
    });
    document.addEventListener("click", (e) => {
      if (!el.contains(e.target) && !list.hidden) close();
    });

    el.getValue = () => value;
    el.setValue = (name) => {
      const s = get(name);
      value = s ? s.name : "";
      input.value = opts.multiple ? "" : value;
    };
    el.setDisabled = (off, placeholder) => {
      input.disabled = off;
      if (placeholder) input.placeholder = placeholder;
    };
    return el;
  }

  /* ---------- Fields of one subject ---------- */

  const chip = (o, sel) => `<button class="chip${sel ? " is-selected" : ""}" type="button" data-v="${esc(o.key)}">${esc(o.label)}</button>`;

  function control(subject, f, side) {
    const teacher = side === "teacher";
    const label = teacher ? f.teacher : f.learner;
    const mark = teacher ? (f.required ? ' <span class="req">*</span>' : ' <span class="opt">(optional)</span>') : "";
    const opts = choices(f, side);
    const id = `sf-${side}-${subject.name.replace(/\W+/g, "")}-${f.key}`;
    const attrs = `data-attr="${f.key}"${f.when ? ` data-when="${f.when.join(":")}"` : ""}`;
    const hint = teacher && f.hint ? `<p class="helper">${esc(f.hint)}</p>` : "";
    if (f.match === "has" && (!teacher || !opts.length)) {
      return { full: true, html: `<div class="field" ${attrs} data-kind="check"><label class="check"><input type="checkbox" id="${id}"><span>${esc(label)}${mark}</span></label>${hint}</div>` };
    }
    const many = teacher ? f.match !== "min" : f.match === "overlap";
    if (many) {
      return { full: true, html: `<div class="field" ${attrs} data-kind="chips"><span class="label">${esc(label)}${mark}</span><div class="chips">${opts.map((o) => chip(o)).join("")}</div>${hint}</div>` };
    }
    const empty = teacher ? "Choose…" : side === "request" ? "Not sure" : ["Level", "Grade", "Goal"].includes(label) ? `Any ${label.toLowerCase()}` : f.key === "age" ? "Any age" : "Any";
    return { full: false, html: `<div class="field" ${attrs} data-kind="select"><label class="label" for="${id}">${esc(label)}${mark}</label>
      <select class="input" id="${id}"><option value="">${empty}</option>${opts.map((o) => `<option value="${esc(o.key)}">${esc(o.label)}</option>`).join("")}</select>${hint}</div>` };
  }

  /* Half-width controls (selects) share a row; chips and checkboxes take the full width. */
  function layout(items) {
    let html = "";
    let row = [];
    const flush = () => {
      if (row.length) html += `<div class="grid-2">${row.join("")}</div>`;
      row = [];
    };
    items.forEach((it) => {
      if (it.full) {
        flush();
        html += it.html;
      } else row.push(it.html);
    });
    flush();
    return html;
  }

  /* In the learner's search, what they ask of the teacher (own level, certificates) goes in its own box. */
  const REQUIREMENTS = "Teacher requirements";
  const isRequirement = (f) => (f.match === "min" && !f.against) || (f.match === "has" && /^(Only|I want)/.test(f.learner));

  /* container: an element to fill. side: "teacher" | "learner" | "request".
     opts.forWhom (learner): render the "Looking for" switch; opts.onChange: called after any change. */
  function render(container, subject, side, values, opts) {
    opts = opts || {};
    container._subject = subject;
    container._side = side;
    if (!subject) {
      container.innerHTML = "";
      return;
    }
    const fields = fieldsFor(subject, side);
    const top = [];
    const sections = {};
    if (side === "learner" && opts.forWhom) {
      top.push({ full: false, html: `<div class="field"${subject.kids_only ? " hidden" : ""}><span class="label">Looking for</span>
        <div class="seg" data-f="for_whom" data-type="seg"><button type="button" class="is-active" data-v="myself">Myself</button><button type="button" data-v="child">My child</button></div></div>` });
    }
    fields.forEach((f) => {
      let item;
      if (f.key === "age" && side === "learner") {
        const kids = f.options.filter((o) => o.min_age < 18);
        item = control(subject, Object.assign({}, f, { learner: "Child’s age", options: kids }), side);
        item.html = item.html.replace('class="field"', 'class="field" data-age');
      } else item = control(subject, f, side);
      const section = f.section || (side === "learner" && isRequirement(f) ? REQUIREMENTS : null);
      if (section) (sections[section] = sections[section] || []).push(item);
      else top.push(item);
    });
    let html = layout(top);
    Object.entries(sections).sort((a, b) => (a[0] === REQUIREMENTS) - (b[0] === REQUIREMENTS)).forEach(([title, items]) => {
      html += `<div class="subfields" data-section><p class="eyebrow">${esc(title)}</p>${layout(items)}</div>`;
    });
    container.innerHTML = html;
    write(container, values || {}, opts.forWhomValue);
    if (!container._wired) {
      container._wired = true;
      const later = () => setTimeout(() => {
        sync(container);
        if (container._onChange) container._onChange();
      });
      container.addEventListener("click", (e) => {
        if (e.target.closest(".chip, .seg button")) later();
      });
      container.addEventListener("change", later);
    }
    container._onChange = opts.onChange || null;
    sync(container);
  }

  /* Hidden inside the fields container (a `when` field, the child's age for "Myself")? */
  function hiddenIn(el, container) {
    for (let n = el; n && n !== container; n = n.parentElement) if (n.hidden) return true;
    return false;
  }

  /* Answers from the rendered fields: {key: "value" | ["values"] | true}. Hidden fields are left out. */
  function read(container, withHidden) {
    const out = {};
    container.querySelectorAll("[data-attr]").forEach((el) => {
      if (!withHidden && hiddenIn(el, container)) return;
      const key = el.dataset.attr;
      const kind = el.dataset.kind;
      if (kind === "check") {
        if (el.querySelector("input").checked) out[key] = true;
      } else if (kind === "chips") {
        const v = Array.from(el.querySelectorAll(".chip.is-selected")).map((c) => c.dataset.v);
        if (v.length) out[key] = v;
      } else {
        const v = el.querySelector("select").value;
        if (v) out[key] = v;
      }
    });
    return out;
  }

  function write(container, values, forWhom) {
    values = values || {};
    const seg = container.querySelector('[data-f="for_whom"]');
    const subject = container._subject;
    if (seg) {
      const want = subject && subject.kids_only ? "child" : forWhom || "myself";
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.v === want));
    }
    container.querySelectorAll("[data-attr]").forEach((el) => {
      const v = values[el.dataset.attr];
      const kind = el.dataset.kind;
      if (kind === "check") el.querySelector("input").checked = v === true || asList(v)[0] === "1" || asList(v)[0] === true;
      else if (kind === "chips") {
        const list = asList(v).map(String);
        el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-selected", list.includes(c.dataset.v)));
      } else {
        const sel = el.querySelector("select");
        const one = asList(v)[0];
        sel.value = one != null && Array.from(sel.options).some((o) => o.value === String(one)) ? String(one) : "";
      }
    });
    sync(container);
  }

  /* Show `when` fields, hide the child's age for "Myself", keep the teacher's levels within their own level. */
  function sync(container) {
    const subject = container._subject;
    if (!subject) return;
    const answers = read(container, true);
    container.querySelectorAll("[data-when]").forEach((el) => {
      const [key, value] = el.dataset.when.split(":");
      el.hidden = !shown({ when: [key, value] }, answers);
    });
    container.querySelectorAll("[data-section]").forEach((box) => {
      box.hidden = !box.querySelector("[data-attr]:not([hidden])");
    });
    const seg = container.querySelector('[data-f="for_whom"] .is-active');
    const age = container.querySelector("[data-age]");
    if (age) age.hidden = !!seg && seg.dataset.v !== "child";
    if (container._side === "teacher") {
      subject.fields.filter((f) => f.cap).forEach((f) => {
        const own = answers[f.cap];
        const top = own ? rank(subject.by[f.cap].options, own) : null;
        container.querySelectorAll(`[data-attr="${f.key}"] .chip`).forEach((c) => {
          const over = top != null && rank(f.options, c.dataset.v) > top;
          c.disabled = over;
          if (over) c.classList.remove("is-selected");
        });
      });
    }
  }

  /* Readable facts for a set of answers (used before the API has saved them, e.g. in a draft). */
  function describe(subject, attrs, side) {
    return fieldsFor(subject, side)
      .filter((f) => attrs[f.key] != null && attrs[f.key] !== "" && !(Array.isArray(attrs[f.key]) && !attrs[f.key].length))
      .map((f) => ({ label: side === "teacher" ? f.teacher : f.learner, value: labels(subject, f.key, attrs[f.key], side).join(", ") }))
      .filter((x) => x.value);
  }

  /* Facts [{label, value}] as the .facts grid used on profile and request pages. */
  function facts(list) {
    return (list || []).map((x) => `<div class="fact"><small>${esc(x.label)}</small><div>${esc(x.value)}</div></div>`).join("");
  }

  LL.subjects = { load, get, all, labels, picker, render, read, write, sync, teacherMissing, tags, describe, facts, fieldsFor, rank };
})();
