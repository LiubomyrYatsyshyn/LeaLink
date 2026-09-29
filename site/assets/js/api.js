/* LeaLink API client and helpers shared by the page scripts in assets/js/pages/. Exposed as window.LL. */
(function () {
  "use strict";

  const TOKEN_KEY = "ll-token";
  const USER_KEY = "ll-user"; // also read by lealink.js to draw the header

  const store = {
    get(key, session) {
      try { return JSON.parse((session ? sessionStorage : localStorage).getItem(key)); } catch (e) { return null; }
    },
    set(key, value, session) {
      try {
        const s = session ? sessionStorage : localStorage;
        if (value == null) s.removeItem(key); else s.setItem(key, JSON.stringify(value));
      } catch (e) { /* storage unavailable (private mode) */ }
    },
  };

  /* ---------- HTTP ---------- */

  class ApiError extends Error {
    constructor(status, detail) {
      super(errorText(status, detail));
      this.status = status;
      this.detail = detail;
    }
  }

  function errorText(status, detail) {
    if (status === 0) return "Can’t reach LeaLink. Check your connection and try again.";
    if (typeof detail === "string") return detail;
    if (detail && detail.message) return detail.message;
    if (Array.isArray(detail) && detail.length) {
      const d = detail[0];
      const field = (d.loc || []).filter((x) => typeof x === "string" && x !== "body" && x !== "query").pop();
      const msg = String(d.msg || "").replace(/^Value error, /, "");
      return field ? `${field.replace(/_/g, " ")}: ${msg}` : msg;
    }
    return status >= 500 ? "Something went wrong on our side. Please try again." : `Request failed (${status})`;
  }

  async function request(method, path, body) {
    const headers = {};
    const token = store.get(TOKEN_KEY);
    if (token) headers.Authorization = "Bearer " + token;
    const init = { method, headers };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch("/api" + path, init);
    } catch (e) {
      throw new ApiError(0);
    }
    let data = null;
    if (res.status !== 204) {
      try { data = await res.json(); } catch (e) { /* not JSON (e.g. the API is restarting) */ }
    }
    if (res.status === 401 && token) auth.clear();
    if (!res.ok) throw new ApiError(res.status, data && data.detail);
    return data;
  }

  const api = {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    put: (path, body) => request("PUT", path, body),
    patch: (path, body) => request("PATCH", path, body),
    del: (path) => request("DELETE", path),
  };

  /* ---------- Session ---------- */

  function here() {
    return location.pathname.split("/").pop() + location.search;
  }

  let mePromise = null; // one /auth/me request per page

  const auth = {
    loggedIn: () => !!store.get(TOKEN_KEY),
    user: () => store.get(USER_KEY),
    save(res) {
      store.set(TOKEN_KEY, res.access_token);
      auth.setUser(res.user);
    },
    setUser(user) {
      store.set(USER_KEY, user);
      if (window.LeaLink && window.LeaLink.refreshHeader) window.LeaLink.refreshHeader();
    },
    clear() {
      store.set(TOKEN_KEY, null);
      store.set(USER_KEY, null);
    },
    me() {
      if (!mePromise) {
        mePromise = api.get("/auth/me").then((user) => {
          auth.setUser(user);
          return user;
        });
        mePromise.catch(() => (mePromise = null));
      }
      return mePromise;
    },
    loginUrl: (next) => "login.html?next=" + encodeURIComponent(next || here()),
    /* For pages that need an account: returns the user, or sends the visitor to log in. */
    async require() {
      if (!auth.loggedIn()) return redirect(auth.loginUrl());
      try {
        return await auth.me();
      } catch (e) {
        if (e.status === 401 || e.status === 403) return redirect(auth.loginUrl());
        throw e;
      }
    },
  };

  function redirect(url) {
    location.replace(url);
    return new Promise(() => {}); // the page is leaving
  }

  /* ---------- Formatting ---------- */

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const initials = (name) =>
    (name || "").trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase() || "?";
  const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";
  const icon = (name, size) => window.LeaLink.icon(name, size);

  /* person: {name, photo_url} */
  function avatar(person, size) {
    const inner = person && person.photo_url ? `<img src="${esc(person.photo_url)}" alt="">` : esc(initials(person && person.name));
    return `<span class="avatar av-${size}">${inner}</span>`;
  }

  const SYMBOL = { USD: "$", EUR: "€", UAH: "₴" };
  function num(v) {
    const n = Number(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }
  const money = (v, cur) => (v == null ? "" : (SYMBOL[cur] || "") + num(v) + (SYMBOL[cur] ? "" : " " + cur));
  function budget(min, max, cur) {
    const s = SYMBOL[cur] || "";
    if (min == null && max == null) return "";
    if (min == null) return `up to ${s}${num(max)}`;
    if (max == null) return `from ${s}${num(min)}`;
    return `${s}${num(min)}–${num(max)}`;
  }

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n) => String(n).padStart(2, "0");
  function date(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}` + (d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : "");
  }
  const time = (iso) => {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const dateTime = (iso) => (iso ? `${date(iso)}, ${time(iso)}` : "");
  const monthYear = (iso) => {
    const d = new Date(iso);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };
  const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

  const labels = {
    level: {
      A1: "Beginner (A1)", A2: "Elementary (A2)", B1: "Intermediate (B1)", B2: "Upper-intermediate (B2)",
      C1: "Advanced (C1)", C2: "Proficient (C2)", Native: "Native",
    },
    format: { online: "Online", offline: "In person", both: "Online · In person" },
    lessonType: { individual: "Individual", group: "Group" },
    contact: { telegram: "Telegram", whatsapp: "WhatsApp", email: "Email", phone: "Phone" },
    status: {
      pending: "Pending", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn",
      expired: "Expired", closed: "Ended",
    },
  };

  /* ["evening", "weekdays"] -> "Weekday evenings" */
  function timesText(times) {
    times = times || [];
    const parts = ["morning", "afternoon", "evening"].filter((p) => times.includes(p)).map((p) => p + "s");
    const wd = times.includes("weekdays"), we = times.includes("weekends");
    const days = wd && !we ? "Weekday" : we && !wd ? "Weekend" : "";
    if (!parts.length) return wd && !we ? "Weekdays" : we && !wd ? "Weekends" : "";
    const text = (days ? days + " " : "") + parts.join(" & ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  const lessonsText = (r) => `${r.lessons_per_week} × ${r.lesson_duration} min / week`;

  /* ---------- Page helpers ---------- */

  const params = new URLSearchParams(location.search);

  /* Show the blocks for one state: <div data-show-state="default empty"> (same as ?state= in lealink.js). */
  function setState(name, root) {
    (root || document).querySelectorAll("[data-show-state]").forEach((el) => {
      el.hidden = !el.getAttribute("data-show-state").split(/\s+/).includes(name);
    });
  }

  const toast = (text, opts) => window.LeaLink.toast(esc(text), opts);
  function fail(err) {
    if (!(err instanceof ApiError)) console.error(err);
    toast(err.message || "Something went wrong.");
  }

  /* A message to show as a toast on the next page (e.g. "Request sent"). */
  const flash = (text) => store.set("ll-flash", text, true);
  function showFlash() {
    const text = store.get("ll-flash", true);
    if (text) {
      store.set("ll-flash", null, true);
      toast(text);
    }
  }

  /* Data kept between pages before the visitor has an account (search, request, teacher profile). */
  const draft = {
    get: (name) => store.get("ll-draft-" + name),
    set: (name, value) => store.set("ll-draft-" + name, value),
  };

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* Disable a button while `fn` runs. */
  async function busy(button, fn) {
    if (button) button.disabled = true;
    try {
      return await fn();
    } finally {
      if (button) button.disabled = false;
    }
  }

  function html(el, markup) {
    el.innerHTML = markup;
    return el;
  }

  /* ---------- Shared pieces of markup ---------- */

  const tags = (list) => (list || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");

  function ratingText(t) {
    return t.reviews_count
      ? `<span class="rating">${icon("star", 14).replace('class="i', 'class="star i')}<b>${t.rating.toFixed(1)}</b> (${t.reviews_count})</span>`
      : `<span class="rating">New teacher</span>`;
  }

  /* A teacher in search results (also used for the wizard preview). */
  function teacherCard(t, opts) {
    opts = opts || {};
    const name = esc(t.display_name);
    const link = opts.preview ? name : `<a href="teacher.html?id=${t.id}${t.match != null ? "&match=" + t.match : ""}">${name}</a>`;
    const match = t.match != null ? `<span class="badge badge-match">${t.match}% match</span>` : "<span></span>";
    const meta = [
      ratingText(t),
      t.experience_years != null ? `<span>${t.experience_years} ${t.experience_years === 1 ? "year" : "years"} experience</span>` : "",
      t.format ? `<span>${labels.format[t.format]}</span>` : "",
      t.response_hours ? `<span>Replies in ~${t.response_hours}h</span>` : "",
    ].join("");
    const report = opts.preview
      ? `<span class="link link-muted" style="font-size:13px">${icon("flag", 14)}Report</span>`
      : `<button class="link" type="button" data-report="${t.id}">${icon("flag", 14)}Report</button>`;
    const send = opts.preview
      ? `<span class="btn btn-primary btn-block">Send request</span>`
      : `<a class="btn btn-primary btn-block" href="request.html?teacher=${t.id}">Send request</a>`;
    return `<article class="tcard">
      <div class="tcard-main">
        ${avatar({ name: t.display_name, photo_url: t.photo_url }, 72)}
        <div class="tcard-body">
          <div class="tcard-name"><h3>${link}</h3>${t.free_trial ? '<span class="badge badge-trial">Free trial</span>' : ""}${t.is_verified ? `<span class="badge badge-verified">${icon("check", 12)}Verified</span>` : ""}</div>
          <div class="tcard-rest">
            <p class="tcard-headline">${esc(t.headline)}</p>
            <div class="tags">${tags((t.subjects || []).concat(t.topics || []).slice(0, 4))}</div>
            <div class="meta">${meta}</div>
          </div>
        </div>
      </div>
      <div class="tcard-side">
        <div class="row-between side-top">${match}${report}</div>
        <div class="price-row"><span class="price">${money(t.price, t.currency)}<small>/ lesson</small></span>${t.match != null ? `<span class="badge badge-match show-mobile">${t.match}% match</span>` : ""}</div>
        ${send}
        ${t.id ? `<a class="btn btn-secondary btn-block" href="teacher.html?id=${t.id}">View profile</a>` : '<span class="btn btn-secondary btn-block">View profile</span>'}
        ${opts.preview ? "" : `<button class="link link-muted mobile-report" type="button" data-report="${t.id}">${icon("flag", 14)}Report</button>`}
      </div>
    </article>`;
  }

  /* Weekly availability grid (read-only). */
  function availabilityGrid(slots) {
    const days = [["mon", "Mon", "M"], ["tue", "Tue", "T"], ["wed", "Wed", "W"], ["thu", "Thu", "T"], ["fri", "Fri", "F"], ["sat", "Sat", "S"], ["sun", "Sun", "S"]];
    const parts = [["morning", "Morning", "Mor", "08–12"], ["afternoon", "Afternoon", "Aft", "12–17"], ["evening", "Evening", "Eve", "17–21"]];
    let out = "<span></span>" + days.map((d) => `<span class="day"><span class="d-full">${d[1]}</span><span class="d-short">${d[2]}</span></span>`).join("");
    parts.forEach((p) => {
      out += `<span class="slot"><span class="d-full">${p[1]}</span><span class="d-short">${p[2]}</span><small>${p[3]}</small></span>`;
      out += days.map((d) => `<span class="cell${(slots || []).includes(d[0] + "_" + p[0]) ? " on" : ""}">${icon("check", 14)}</span>`).join("");
    });
    return `<div class="avail">${out}</div>`;
  }

  /* ---------- Report dialog ("Report" on teacher cards, the teacher page and in chats) ---------- */

  const REPORT_REASONS = ["Fake or misleading profile", "Spam or advertising", "Rude or inappropriate behaviour", "Other"];

  function report(target) {
    if (!auth.loggedIn()) {
      toast("Log in to send a report.");
      setTimeout(() => (location.href = auth.loginUrl()), 900);
      return;
    }
    let dlg = document.getElementById("ll-report");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "dialog";
      dlg.id = "ll-report";
      dlg.innerHTML = `
        <div class="dialog-head"><div><h2>Report</h2><p>Tell our moderators what’s wrong. The other person won’t see your name.</p></div>
          <button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div>
        <div class="dialog-body fields" style="gap:16px">
          <div class="options" style="gap:10px">${REPORT_REASONS.map((r, i) => `<label class="radio"><input type="radio" name="ll-report-reason" value="${r}"${i ? "" : " checked"}><span>${r}</span></label>`).join("")}</div>
          <div class="field"><label class="label" for="ll-report-details">Details <span class="opt">(optional)</span></label>
            <textarea class="input" id="ll-report-details" rows="3" maxlength="1000"></textarea></div>
        </div>
        <div class="dialog-foot"><button class="btn btn-secondary" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-send-report>Send report</button></div>`;
      document.body.appendChild(dlg);
      dlg.querySelector("[data-send-report]").addEventListener("click", async (e) => {
        const body = Object.assign({}, dlg._target, {
          reason: dlg.querySelector("input[name=ll-report-reason]:checked").value,
          details: dlg.querySelector("#ll-report-details").value.trim() || null,
        });
        try {
          await busy(e.currentTarget, () => api.post("/reports", body));
          dlg.close();
          toast("Thanks. Our moderators will review your report.");
        } catch (err) {
          fail(err);
        }
      });
    }
    dlg._target = target;
    dlg.querySelector("#ll-report-details").value = "";
    dlg.showModal();
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-report]");
    if (el) report({ teacher_id: +el.dataset.report });
  });

  /* ---------- Form errors ---------- */

  /* Mark a .field as invalid with a message under it; clear it with msg = null. */
  function fieldError(field, msg) {
    if (!field) return;
    field.classList.toggle("is-error", !!msg);
    let p = field.querySelector(":scope > .ll-error");
    if (!msg) {
      if (p) p.remove();
      return;
    }
    if (!p) {
      p = document.createElement("p");
      p.className = "error-msg ll-error";
      field.appendChild(p);
    }
    p.innerHTML = icon("alert", 12) + esc(msg);
  }

  /* Editing a field clears its error message. */
  function clearOwnError(e) {
    const field = e.target.closest && e.target.closest(".field.is-error");
    if (!field) return;
    if (e.type === "click" && !e.target.closest(".chip, .seg button, [data-cell], .combo-option")) return;
    fieldError(field, null);
  }
  ["input", "change", "click"].forEach((type) => document.addEventListener(type, clearOwnError));

  /* Timezone names for <select>s, with the browser's own zone first. */
  function timezones() {
    const own = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    let all = [];
    try { all = Intl.supportedValuesOf("timeZone"); } catch (e) { all = ["UTC", "Europe/Kyiv", "Europe/Warsaw", "Europe/Lisbon", "Europe/London", "Europe/Berlin", "America/New_York"]; }
    if (!all.includes("UTC")) all.unshift("UTC");
    return { own, all };
  }
  function fillTimezones(select, value) {
    const tz = timezones();
    const chosen = value || tz.own;
    select.innerHTML = tz.all.map((z) => `<option value="${esc(z)}"${z === chosen ? " selected" : ""}>${esc(z.replace(/_/g, " "))}</option>`).join("");
    if (!tz.all.includes(chosen)) select.insertAdjacentHTML("afterbegin", `<option selected>${esc(chosen)}</option>`);
  }

  /* Same rule as the API (views.py): required wizard fields + photo + optional extras. */
  const PROFILE_REQUIRED = [
    "display_name", "headline", "about", "country", "city", "timezone", "languages", "offers",
    "experience_years", "occupation", "format", "lesson_types", "durations", "price", "currency",
    "availability", "contact_method", "contact_value",
  ];
  const PROFILE_OPTIONAL = ["video_url", "practical_experience", "education", "links", "platforms", "questions"];
  function profileCompleteness(d, hasPhoto, hasCertificate) {
    const filled = (k) => d[k] != null && d[k] !== "" && !(Array.isArray(d[k]) && !d[k].length);
    const done = PROFILE_REQUIRED.filter(filled).length + (hasPhoto ? 1 : 0) + PROFILE_OPTIONAL.filter(filled).length + (hasCertificate ? 1 : 0);
    return Math.round((100 * done) / (PROFILE_REQUIRED.length + PROFILE_OPTIONAL.length + 2));
  }

  document.addEventListener("DOMContentLoaded", () => {
    showFlash();
    // A stale session (expired token, blocked account) turns the header back into the guest one.
    if (auth.loggedIn()) {
      auth.me().catch((e) => {
        if (e.status === 401 || e.status === 403) {
          auth.clear();
          window.LeaLink.refreshHeader();
        }
      });
    }
  });

  window.LL = {
    api, auth, ApiError, store, draft, params,
    esc, initials, firstName, avatar, icon, money, budget, date, time, dateTime, monthYear, isToday,
    labels, timesText, lessonsText, tags, teacherCard, availabilityGrid,
    setState, toast, fail, flash, debounce, busy, html, report, fieldError, fillTimezones, timezones, profileCompleteness,
  };
})();
