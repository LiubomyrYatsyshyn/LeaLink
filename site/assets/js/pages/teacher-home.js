/* teacher-home.html — the teacher's home: profile status, incoming requests, students. */
document.addEventListener("DOMContentLoaded", async () => {
  const { esc, icon } = LL;
  const $ = (s) => document.querySelector(s);
  const user = await LL.auth.require();
  document.querySelectorAll("[data-hello]").forEach((el) => (el.textContent = `Hi, ${LL.firstName(user.full_name)}`));

  let profile;
  try {
    profile = await LL.api.get("/teacher/profile");
  } catch (e) {
    if (e.status === 404) return location.replace("wizard.html");
    LL.setState("error");
    return;
  }

  let incoming = [];
  let students = [];
  let current = null; // request for the decline / end dialogs

  /* ---------- Profile ---------- */
  const STATUS = {
    approved: ["badge-active", "Active"],
    pending: ["badge-pending", "Under review"],
    rejected: ["badge-declined", "Changes needed"],
    draft: ["badge-pending", "Draft"],
  };

  function renderProfile() {
    const p = profile;
    const [cls, text] = STATUS[p.status];
    $("[data-status-badge]").outerHTML = `<span class="badge ${cls}" data-status-badge>${text}</span>`;
    $("[data-p-avatar]").outerHTML = `<span data-p-avatar>${LL.avatar({ name: p.display_name, photo_url: p.photo_url }, 56)}</span>`;
    $("[data-p-name]").textContent = p.display_name || user.full_name;
    $("[data-p-sub]").textContent = [p.subjects.join(", "), p.price ? `${LL.money(p.price, p.currency)} / lesson` : ""].filter(Boolean).join(" · ");
    $("[data-p-headline]").textContent = p.headline || "";
    const toggle = $("[data-accepting]");
    toggle.checked = p.accepting_students;
    toggle.disabled = p.status !== "approved";
    $("[data-accepting-sub]").textContent = p.status !== "approved"
      ? "Available once your profile is published."
      : p.accepting_students ? "Your profile appears in search." : "Hidden from search. Learners can’t send new requests.";
    const note = $("[data-review-note]");
    const notes = {
      pending: "We’re reviewing your profile. You’ll get an email once it’s published.",
      rejected: `Moderator’s note: ${p.review_note || "please update your profile"}. Edit it and submit again.`,
      draft: "Your profile isn’t submitted yet. Finish it and send it for review.",
    };
    note.hidden = !notes[p.status];
    note.textContent = notes[p.status] || "";
    $("[data-pct]").textContent = p.completeness + "%";
    $("[data-pct-bar]").style.width = p.completeness + "%";
    const hint = p.missing.length ? `Still missing: ${p.missing.join(", ").replace(/_/g, " ")}.`
      : !p.video_url && !p.certificates.length ? "Add an intro video or a certificate to reach 100%."
      : !p.video_url ? "Add an intro video to reach 100%."
      : !p.certificates.length ? "Add a certificate to reach 100%." : "Your profile is complete.";
    $("[data-pct-hint]").textContent = p.completeness >= 100 ? "Your profile is complete." : hint;
    $("[data-view-as]").href = `teacher.html?id=${p.id}`;
  }

  $("[data-accepting]").addEventListener("change", async (e) => {
    try {
      profile = await LL.api.put("/teacher/profile", { accepting_students: e.target.checked });
      renderProfile();
      LL.toast(profile.accepting_students ? "You’re visible in search again." : "New requests are paused.");
    } catch (err) {
      e.target.checked = !e.target.checked;
      LL.fail(err);
    }
  });

  /* ---------- Requests and students ---------- */
  const forWhom = (r) => (r.for_whom === "child" ? `For their child, ${r.child_age}` : "For themselves");
  const learnerRating = (r) => (r.learner_reviews_count
    ? ` · ${icon("star", 14).replace('class="i', 'class="star i')}${r.learner_rating.toFixed(1)} from teachers` : "");

  function timer(r) {
    const pct = Math.max(2, Math.min(100, Math.round((r.hours_left / 72) * 100)));
    return `<div class="timer${r.hours_left <= 12 ? " is-urgent" : ""}"><span class="timer-label">${icon("clock", 14)}${r.hours_left}h left</span><span class="timer-bar"><span style="width:${pct}%"></span></span></div>`;
  }

  function details(r) {
    const fact = (label, value) => (value ? `<div class="fact"><small>${label}</small><div>${value}</div></div>` : "");
    const answers = r.answers.map((a) => `<p class="t-small" style="margin-top:12px"><b>${esc(a.question)}</b><br>${esc(a.answer)}</p>`).join("");
    return `<div data-details-box hidden style="margin-top:16px">
      <div class="facts">
        ${fact("Subject", esc(r.subject))}
        ${fact("Topics", esc(r.topics.join(", ")))}
        ${fact("Goal details", esc(r.goal_details))}
        ${fact("Preferred time", esc(LL.timesText(r.preferred_times)))}
        ${fact("Start", r.start_asap ? "As soon as possible" : LL.date(r.start_date))}
        ${fact("Planned duration", esc(r.planned_duration))}
        ${fact("Free trial", r.free_trial ? "Asked for a free trial" : "")}
      </div>${answers}</div>`;
  }

  function requestCard(r) {
    const tags = [
      LL.labels.level[r.level], r.goal, LL.labels.format[r.format], LL.lessonsText(r),
      LL.budget(r.budget_min, r.budget_max, r.currency),
    ].filter(Boolean);
    return `<article class="rcard inreq">
      <div class="rcard-row">
        ${LL.avatar(r.learner, 44)}
        <div class="rcard-info"><div class="rcard-title"><h3>${esc(r.learner.name)}</h3></div><p class="rcard-sub">${forWhom(r)} · Sent ${LL.date(r.created_at)}${learnerRating(r)}</p></div>
        ${timer(r)}
      </div>
      <div class="tags">${LL.tags(tags)}</div>
      <p class="message">${esc(r.message)}</p>
      ${details(r)}
      <div class="inreq-actions"><button class="btn btn-ghost" type="button" data-details>View full request</button><button class="btn btn-secondary" type="button" data-decline="${r.id}">Decline</button><button class="btn btn-primary" type="button" data-accept="${r.id}">Accept</button></div>
    </article>`;
  }

  function studentCard(r) {
    const first = esc(LL.firstName(r.learner.name));
    const chat = (primary) => `<a class="btn ${primary ? "btn-primary" : "btn-secondary"} btn-sm" href="chat-teacher.html?id=${r.id}">${icon("chat")}Open chat</a>`;
    const reviewBtn = `<button class="btn btn-primary btn-sm" type="button" data-review="${r.id}">${icon("edit")}Leave review</button>`;
    let status;
    let actions;
    if (r.status === "closed") {
      status = `Lessons ended ${LL.date(r.finished_at)}`;
      actions = chat(!r.can_review) + (r.can_review ? reviewBtn : "");
    } else if (r.lessons_started) {
      status = r.can_review ? "Lessons started · You can leave a review" : "Lessons started · Review left";
      actions = chat(false) + (r.can_review ? reviewBtn : "");
    } else if (r.teacher_started) {
      status = `You confirmed lessons started · Waiting for ${first}`;
      actions = chat(true);
    } else {
      status = `Accepted ${LL.date(r.answered_at)} · Confirm when your first lesson happens`;
      actions = `<button class="btn btn-secondary btn-sm" type="button" data-started="${r.id}">${icon("check")}We started lessons</button>${chat(true)}`;
    }
    if (r.status === "accepted") actions += `<button class="btn btn-ghost btn-sm" type="button" data-end="${r.id}">End</button>`;
    const topic = r.goal || r.subject;
    return `<article class="scard">
      ${LL.avatar(r.learner, 40)}
      <div class="rcard-info"><h3>${esc(r.learner.name)}</h3><p class="rcard-sub">${esc(topic)}<span class="desk"> · ${status}</span></p></div>
      <p class="note-mobile">${status}</p>
      <div class="rcard-actions">${actions}</div>
    </article>`;
  }

  function renderLists() {
    const n = incoming.length;
    $("[data-count=incoming]").textContent = n;
    $("[data-count=students]").textContent = students.length;
    $("[data-list=incoming]").innerHTML = incoming.map(requestCard).join("");
    $("[data-list=students]").innerHTML = students.map(studentCard).join("");
    $("[data-empty=students]").hidden = students.length > 0;
    const leads = {
      approved: n ? `${n} ${n === 1 ? "learner is" : "learners are"} waiting for your answer.` : "No new requests right now.",
      pending: "Your profile is under review. Here’s what happens next.",
      rejected: "Your profile needs a few changes before it’s published.",
      draft: "Finish your profile and submit it for review.",
    };
    $("[data-lead]").textContent = leads[profile.status];
    $("[data-empty-text]").textContent = profile.status === "approved"
      ? (profile.accepting_students ? "New requests from learners will appear here. You’ll also get an email." : "You’ve paused new requests. Turn on “Accepting new students” to appear in search.")
      : "Requests will appear here once your profile is published. Learners who match your subjects can then find you.";
    LL.setState(n ? "default" : "empty");
  }

  async function load() {
    try {
      [incoming, students] = await Promise.all([LL.api.get("/requests/incoming"), LL.api.get("/requests/students")]);
      renderLists();
    } catch (e) {
      LL.setState("error");
    }
  }

  /* ---------- Actions ---------- */
  const find = (id) => incoming.concat(students).find((r) => r.id === Number(id));

  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-details], [data-accept], [data-decline], [data-confirm-decline], [data-started], [data-end], [data-confirm-end], [data-review]");
    if (!el) return;
    try {
      if (el.hasAttribute("data-details")) {
        const box = el.closest(".inreq").querySelector("[data-details-box]");
        box.hidden = !box.hidden;
        el.textContent = box.hidden ? "View full request" : "Hide details";
      } else if (el.dataset.accept) {
        const r = await LL.busy(el, () => LL.api.post(`/requests/${el.dataset.accept}/accept`));
        LL.flash(`You accepted ${r.learner.name}’s request. Say hello!`);
        location.href = `chat-teacher.html?id=${r.id}`;
      } else if (el.dataset.decline) {
        current = find(el.dataset.decline);
        const first = LL.firstName(current.learner.name);
        $("[data-decline-who]").innerHTML = `${LL.avatar(current.learner, 44)}<div><div class="t-small">${esc(current.learner.name)}</div>
          <div class="t-caption muted" style="font-weight:400">${esc([LL.labels.level[current.level], current.goal, LL.lessonsText(current)].filter(Boolean).join(" · "))}</div></div>`;
        $("[data-note-label]").innerHTML = `Note to ${esc(first)} <span class="opt">(optional)</span>`;
        $("[data-decline-help]").textContent = `${first} will see the reason and your note. The request moves to their Declined tab.`;
        $("#dc-note").value = "";
        $("#dc-note").dispatchEvent(new Event("input"));
        document.querySelector("input[name=reason]").checked = true;
        document.getElementById("decline").showModal();
      } else if (el.hasAttribute("data-confirm-decline")) {
        const body = { reason: $("input[name=reason]:checked").value, note: $("#dc-note").value.trim() || null };
        await LL.busy(el, () => LL.api.post(`/requests/${current.id}/decline`, body));
        document.getElementById("decline").close();
        LL.toast("Request declined.");
        load();
      } else if (el.dataset.started) {
        const r = await LL.busy(el, () => LL.api.post(`/requests/${el.dataset.started}/started`));
        LL.toast(r.lessons_started ? "Lessons confirmed. You can leave a review now." : `Thanks! We’ll ask ${LL.firstName(r.learner.name)} to confirm too.`);
        load();
      } else if (el.dataset.end) {
        current = find(el.dataset.end);
        $("[data-end-text]").textContent = `${current.learner.name} moves out of your students, and the chat becomes read-only. You can still leave a review if lessons started.`;
        document.getElementById("end").showModal();
      } else if (el.hasAttribute("data-confirm-end")) {
        await LL.busy(el, () => LL.api.post(`/requests/${current.id}/close`));
        document.getElementById("end").close();
        LL.toast("Lessons ended.");
        load();
      } else if (el.dataset.review) {
        LL.review.open(find(el.dataset.review), load);
      }
    } catch (err) {
      LL.fail(err);
    }
  });

  renderProfile();
  load();
});
