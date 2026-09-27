/* login.html, signup.html, signup-learner.html (then send the saved request),
   signup-teacher.html (then save and submit the saved teacher profile). */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("[data-form]");
  const kind = form.dataset.form;
  const $ = (s) => document.querySelector(s);
  const submitBtn = form.querySelector('button[type="submit"]');

  // Only local pages are allowed as ?next= targets.
  const next = LL.params.get("next");
  const safeNext = next && /^[a-z-]+\.html([?#].*)?$/.test(next) ? next : null;
  if (safeNext) {
    document.querySelectorAll("[data-keep-next]").forEach((a) => (a.href += "?next=" + encodeURIComponent(safeNext)));
  }

  function formError(msg) {
    const box = $("[data-form-error]");
    box.hidden = !msg;
    box.innerHTML = msg ? LL.icon("alert", 12) + LL.esc(msg) : "";
  }

  function check() {
    const rules = [
      ["#name", (v) => !v && "Enter your name."],
      ["#email", (v) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && "Enter a valid email."],
      ["#password", (v) => (kind === "login" ? !v && "Enter your password." : v.length < 8 && "Use 8 or more characters.")],
    ];
    let ok = true;
    rules.forEach(([sel, rule]) => {
      const input = $(sel);
      if (!input) return;
      const msg = rule(sel === "#password" ? input.value : input.value.trim());
      LL.fieldError(input.closest(".field"), msg || null);
      if (msg) ok = false;
    });
    return ok;
  }

  async function register() {
    const res = await LL.api.post("/auth/register", {
      full_name: $("#name").value.trim(),
      email: $("#email").value.trim(),
      password: $("#password").value,
      timezone: LL.timezones().own,
      notify_requests: $("#notify") ? $("#notify").checked : true,
    });
    LL.auth.save(res);
    return res.user;
  }

  /* ---------- Page-specific setup ---------- */
  const request = LL.draft.get("request");
  const profile = LL.draft.get("profile");

  if (kind === "signup-learner") {
    if (!request) return location.replace("search.html");
    const t = request.teacher;
    const p = request.payload;
    const first = LL.firstName(t.name);
    $("[data-sub]").textContent = `Your request to ${first} is ready. We’ve filled in what we know.`;
    $("[data-notify-text]").textContent = `Email me when ${first} replies`;
    $("[data-login-back]").href = LL.auth.loginUrl(`request.html?teacher=${t.id}`);
    $("#name").value = request.name || "";
    $("[data-t-avatar]").outerHTML = LL.avatar({ name: t.name, photo_url: t.photo_url }, 40);
    $("[data-t-name]").textContent = t.name;
    $("[data-t-sub]").textContent = [p.subject, p.topics.join(", ")].filter(Boolean).join(" · ");
    const cell = (label, value) => (value ? `<div><small>${label}</small>${LL.esc(value)}</div>` : "");
    $("[data-summary]").innerHTML = [
      cell("Level", LL.labels.level[p.level]),
      cell("Goal", p.goal),
      cell("Lessons", LL.lessonsText(p)),
      cell("Schedule", LL.timesText(p.preferred_times)),
      cell("Start", p.start_asap ? "As soon as possible" : LL.date(p.start_date)),
      cell("Budget", LL.budget(p.budget_min, p.budget_max, p.currency) + (p.budget_min != null || p.budget_max != null ? " " + p.currency : "")),
    ].join("");
    $("[data-quote]").textContent = `“${p.message.length > 110 ? p.message.slice(0, 110) + "…" : p.message}”`;
  }

  if (kind === "signup-teacher") {
    if (!profile) return location.replace("wizard.html");
    const d = profile.data;
    $("#name").value = d.display_name || "";
    $("[data-t-avatar]").outerHTML = LL.avatar({ name: d.display_name, photo_url: profile.photo }, 40);
    $("[data-t-name]").textContent = d.display_name || "";
    $("[data-t-sub]").textContent = [(d.subjects || []).join(", "), d.price ? `${LL.money(d.price, d.currency)} / lesson` : ""].filter(Boolean).join(" · ");
    const pct = LL.profileCompleteness(d, !!profile.photo);
    $("[data-pct]").textContent = pct + "%";
    $("[data-pct-bar]").style.width = pct + "%";
  }

  /* ---------- Submit ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError(null);
    if (!check()) return;
    try {
      await LL.busy(submitBtn, handlers[kind]);
    } catch (err) {
      formError(err.message);
    }
  });

  const handlers = {
    async login() {
      const res = await LL.api.post("/auth/login", { email: $("#email").value.trim(), password: $("#password").value });
      LL.auth.save(res);
      location.href = safeNext || (res.user.teacher_id ? "teacher-home.html" : "learner.html");
    },

    async signup() {
      const role = form.querySelector(".role-card.is-selected").dataset.roleCard;
      await register();
      location.href = safeNext
        || (role === "teacher" ? "wizard.html" : request ? `request.html?teacher=${request.payload.teacher_id}` : "search.html");
    },

    async "signup-learner"() {
      await register();
      try {
        await LL.api.post("/requests", request.payload);
      } catch (err) {
        LL.flash(`Your account is ready, but the request wasn’t sent: ${err.message}`);
        location.href = `request.html?teacher=${request.payload.teacher_id}`;
        return;
      }
      LL.draft.set("request", null);
      LL.flash(`Request sent to ${request.teacher.name}. ${LL.firstName(request.teacher.name)} has 72 hours to reply.`);
      location.href = "learner.html";
    },

    async "signup-teacher"() {
      await register();
      await LL.api.put("/teacher/profile", profile.data);
      if (profile.photo) {
        const blob = await (await fetch(profile.photo)).blob();
        const body = new FormData();
        body.append("file", blob, "photo.jpg");
        await LL.api.post("/auth/me/photo", body);
      }
      try {
        await LL.api.post("/teacher/profile/submit");
      } catch (err) {
        LL.draft.set("profile", null);
        const missing = err.detail && err.detail.missing ? ": " + err.detail.missing.join(", ") : "";
        LL.flash(`Your account and draft are saved. Fill in the missing fields${missing}.`);
        location.href = "wizard.html";
        return;
      }
      LL.draft.set("profile", null);
      location.href = "under-review.html";
    },
  };
});
