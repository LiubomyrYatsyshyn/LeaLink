/* request.html?teacher=<id> — the request form. Guests fill it in first and create an account right after. */
document.addEventListener("DOMContentLoaded", async () => {
  const $ = (s) => document.querySelector(s);
  const form = $("[data-request]");
  const BOUNDS = { USD: [5, 60, "$"], EUR: [5, 60, "€"], UAH: [200, 2500, "₴"] };
  const teacherId = Number(LL.params.get("teacher"));
  if (!teacherId) return location.replace("search.html");

  let t;
  try {
    t = await LL.api.get(`/teachers/${teacherId}`);
  } catch (e) {
    document.querySelector("main").innerHTML = `<div class="empty"><div class="empty-icon">${LL.icon("search", 20)}</div><h3>${e.status === 404 ? "Teacher not found" : "We couldn’t load this teacher"}</h3>
      <p>${LL.esc(e.status === 404 ? "This profile doesn’t exist or isn’t published." : e.message)}</p>
      <div class="empty-actions"><a class="btn btn-primary" href="search.html">Find a teacher</a></div></div>`;
    document.querySelector(".mobile-bar").hidden = true;
    return;
  }

  /* ---------- Teacher details ---------- */
  const first = LL.firstName(t.display_name);
  document.title = `Send a request to ${first} · LeaLink`;
  $("[data-title]").textContent = `Send a request to ${first}`;
  $("[data-back]").href = `teacher.html?id=${t.id}`;
  $("[data-back-text]").textContent = `Back to ${first}’s profile`;
  $("[data-t-avatar]").outerHTML = LL.avatar({ name: t.display_name, photo_url: t.photo_url }, 48);
  $("[data-t-name]").textContent = t.display_name;
  $("[data-t-sub]").textContent = `${t.subjects.join(", ")} · ${LL.money(t.price, t.currency)} / lesson`;
  $("[data-t-deadline]").textContent = `${first} has 72 hours to accept or decline.`;
  $("[data-msg-label]").innerHTML = `Message to ${LL.esc(first)} <span class="req">*</span>`;
  $("[data-tz-note]").textContent = `Times are in your time zone: ${LL.timezones().own.replace(/_/g, " ")}.`;
  if (t.free_trial) {
    $("[data-trial]").hidden = false;
    $("[data-trial-text]").textContent = `${first} offers a free ${t.trial_minutes}-minute trial.`;
  }
  if (t.questions.length) {
    const note = $("[data-questions-note]");
    note.hidden = false;
    note.textContent = `${first} asks every learner these questions.`;
    $("[data-questions]").innerHTML = t.questions.map((q, i) => `
      <div class="field">
        <div class="label-row"><label class="label" for="r-q${i}">${LL.esc(q)}</label><span class="from-pill">From ${LL.esc(first)}</span></div>
        <input class="input" id="r-q${i}" data-question="${i}" maxlength="500">
      </div>`).join("");
  }

  /* ---------- Controls ---------- */
  const range = $("#r-range");
  const seg = (id) => $(`#${id} .is-active`).dataset.v;
  function setSeg(id, value) {
    const btn = $(`#${id} button[data-v="${value}"]`);
    if (btn && !btn.classList.contains("is-active")) btn.click();
  }
  function setBudget(min, max, currency) {
    const b = BOUNDS[currency] || BOUNDS.USD;
    $("#r-currency").value = currency || "USD";
    range.setRange(min, max, b[0], b[1], b[2]);
    const labels = range.parentElement.querySelectorAll(".range-labels span");
    labels[0].textContent = b[2] + b[0];
    labels[1].textContent = b[2] + b[1] + "+";
  }
  $("#r-currency").addEventListener("change", (e) => setBudget(null, null, e.target.value));
  const markFrom = () => document.querySelectorAll("[data-from]").forEach((el) => (el.hidden = false));

  function fill(p) {
    setSeg("r-for", p.for_whom || "myself");
    $("#r-age").value = p.child_age || "";
    $("#r-parent").value = p.parent_contact || "";
    $("#r-subject").value = p.subject || "";
    $("#r-topic").value = (p.topics || []).join(", ");
    $("#r-level").value = p.level || "";
    $("#r-goal").value = p.goal || "";
    $("#r-details").value = p.goal_details || "";
    $("#r-week").value = String(p.lessons_per_week || 1);
    if (p.lesson_duration) $("#r-duration").value = String(p.lesson_duration);
    document.querySelectorAll("#r-times .chip").forEach((c) => c.classList.toggle("is-selected", (p.preferred_times || []).includes(c.dataset.v)));
    setSeg("r-start", p.start_asap === false ? "date" : "asap");
    $("#r-date").value = p.start_date || "";
    $("#r-planned").value = p.planned_duration || "";
    setSeg("r-format", p.format || "online");
    setBudget(p.budget_min, p.budget_max, p.currency);
    if (p.free_trial === false) $("#r-trial").checked = false;
    (p.answers || []).forEach((a) => {
      const i = t.questions.indexOf(a.question);
      if (i >= 0) $(`[data-question="${i}"]`).value = a.answer;
    });
    $("#r-msg").value = p.message || "";
    $("#r-msg").dispatchEvent(new Event("input"));
  }

  /* ---------- Prefill: an unsent request to this teacher, otherwise the search ---------- */
  const user = LL.auth.user();
  const saved = LL.draft.get("request");
  const search = LL.draft.get("search");
  if (saved && saved.payload.teacher_id === t.id) {
    fill(saved.payload);
  } else if (search) {
    fill({
      for_whom: search.for_whom,
      subject: t.subjects.find((s) => s.toLowerCase() === (search.subject || "").toLowerCase()) || search.subject,
      topics: search.topics, level: search.level, goal: search.goal,
      lessons_per_week: search.lessons_per_week, preferred_times: search.times,
      format: search.format === "both" && !search.city ? "online" : search.format,
      budget_min: search.price_min, budget_max: search.price_max, currency: search.currency,
    });
    markFrom();
  } else {
    fill({ subject: t.subjects[0] });
  }
  $("#r-name").value = (user && user.full_name) || (saved && saved.name) || "";

  if (LL.auth.loggedIn()) {
    $("[data-footer-note]").textContent = `${first} gets your request right away.`;
    LL.api.get("/requests/sent").then((r) => {
      $("[data-limit]").textContent = r.active < r.limit
        ? `This will be ${r.active + 1} of your ${r.limit} active requests.`
        : `You already have ${r.limit} active requests. Withdraw one or wait for replies.`;
    }).catch(() => {});
  } else {
    $("[data-limit]").textContent = "This will be 1 of your 5 active requests.";
  }
  if (!t.accepting_students) showErrors([`${first} isn’t accepting new students right now.`], "You can’t send this request");

  /* ---------- Validation ---------- */
  function showErrors(list, title) {
    const box = $("[data-errors]");
    box.hidden = !list.length;
    $("[data-errors-title]").textContent = title || `Please fix ${list.length} ${list.length === 1 ? "field" : "fields"} before sending`;
    $("[data-errors-list]").textContent = list.join(" · ");
    if (list.length) box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function collect() {
    const r = range.getRange();
    const child = seg("r-for") === "child";
    const asap = seg("r-start") === "asap";
    const payload = {
      teacher_id: t.id,
      for_whom: child ? "child" : "myself",
      child_age: child ? parseInt($("#r-age").value, 10) || null : null,
      parent_contact: child ? $("#r-parent").value.trim() || null : null,
      subject: $("#r-subject").value.trim(),
      topics: $("#r-topic").value.split(",").map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 10),
      level: $("#r-level").value || null,
      goal: $("#r-goal").value,
      goal_details: $("#r-details").value.trim() || null,
      lessons_per_week: Number($("#r-week").value),
      lesson_duration: Number($("#r-duration").value),
      preferred_times: Array.from(document.querySelectorAll("#r-times .chip.is-selected")).map((c) => c.dataset.v),
      start_asap: asap,
      start_date: asap ? null : $("#r-date").value || null,
      planned_duration: $("#r-planned").value || null,
      format: seg("r-format"),
      budget_min: r.from > r.min ? r.from : null,
      budget_max: r.to < r.max ? r.to : null,
      currency: $("#r-currency").value,
      free_trial: t.free_trial && $("#r-trial").checked,
      answers: t.questions.map((q, i) => ({ question: q, answer: $(`[data-question="${i}"]`).value.trim() })).filter((a) => a.answer),
      message: $("#r-msg").value.trim(),
    };
    const errors = {
      name: !$("#r-name").value.trim() && "Enter your name.",
      child_age: child && !(payload.child_age >= 3 && payload.child_age <= 17) && "Enter an age from 3 to 17.",
      parent_contact: child && !payload.parent_contact && "Add a phone number or email so the teacher can reach a parent.",
      subject: !payload.subject && "Enter a subject.",
      goal: !payload.goal && "Choose a goal.",
      preferred_times: !payload.preferred_times.some((x) => ["morning", "afternoon", "evening"].includes(x)) && "Choose at least one time of day.",
      start_date: !asap && !payload.start_date && "Pick a start date.",
      message: payload.message.length < 50 && `Write at least 50 characters so ${first} understands your needs.`,
    };
    const names = {
      name: "Your name", child_age: "Child’s age", parent_contact: "Parent contact", subject: "Subject", goal: "Goal",
      preferred_times: "Preferred schedule", start_date: "Start date", message: `Message to ${first}`,
    };
    const failed = [];
    Object.entries(errors).forEach(([key, msg]) => {
      LL.fieldError(form.querySelector(`[data-field="${key}"]`), msg || null);
      if (msg) failed.push(names[key]);
    });
    return { payload, name: $("#r-name").value.trim(), failed };
  }

  /* ---------- Send ---------- */
  const sendBtn = $("[data-send]");
  $("[data-send-mobile]").addEventListener("click", () => form.requestSubmit());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!t.accepting_students) return;
    const { payload, name, failed } = collect();
    showErrors(failed);
    if (failed.length) return;
    if (!LL.auth.loggedIn()) {
      LL.draft.set("request", {
        payload, name,
        teacher: { id: t.id, name: t.display_name, photo_url: t.photo_url, subjects: t.subjects, questions: t.questions },
      });
      location.href = "signup-learner.html";
      return;
    }
    try {
      await LL.busy(sendBtn, () => LL.api.post("/requests", payload));
      LL.draft.set("request", null);
      LL.flash(`Request sent to ${t.display_name}. ${first} has 72 hours to reply.`);
      location.href = "learner.html";
    } catch (err) {
      showErrors([err.message], "The request wasn’t sent");
    }
  });
});
