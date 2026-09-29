/* chat.html (learner) and chat-teacher.html (teacher): conversations after a request is accepted.
   New messages are fetched every few seconds. */
document.addEventListener("DOMContentLoaded", async () => {
  const { esc, icon } = LL;
  const role = document.body.dataset.role; // learner | teacher
  const page = role === "teacher" ? "chat-teacher.html" : "chat.html";
  await LL.auth.require();

  const chatEl = document.querySelector(".chat");
  const convsEl = document.querySelector("[data-convs]");
  const mainEl = document.querySelector("[data-chat-main]");
  const searchEl = document.querySelector("[data-chat-search]");
  let chats = [];
  let activeId = Number(LL.params.get("id")) || null;
  let request = null;
  let lastId = 0;
  let pollTimer = null;
  let polls = 0;

  /* ---------- Conversation list ---------- */
  function conv(c) {
    const last = c.last_message;
    const at = last ? last.created_at : c.answered_at;
    const when = LL.isToday(at) ? LL.time(at) : LL.date(at);
    const text = last ? (last.mine ? "You: " : "") + last.text : c.status === "closed" ? "Lessons ended" : "Say hello!";
    const unread = c.unread && c.request_id !== activeId ? `<span class="unread">${c.unread}</span>` : "";
    return `<button class="conv${c.request_id === activeId ? " is-active" : ""}" type="button" data-conv="${c.request_id}">${LL.avatar(c.other, 40)}
      <span class="conv-body"><span class="conv-top"><b>${esc(c.other.name)}</b><time>${when}</time></span><span class="conv-bottom"><span>${esc(text)}</span>${unread}</span></span></button>`;
  }

  function renderList() {
    const q = searchEl.value.trim().toLowerCase();
    const list = chats.filter((c) => !q || c.other.name.toLowerCase().includes(q));
    convsEl.innerHTML = list.length ? list.map(conv).join("") : `<p class="muted" style="padding:12px 16px">${chats.length ? "No conversations match." : "No chats yet."}</p>`;
  }

  async function loadList() {
    chats = await LL.api.get(`/chats?as=${role}`);
    renderList();
  }
  searchEl.addEventListener("input", renderList);

  /* ---------- One conversation ---------- */
  function contactText(r, first) {
    const c = r.teacher_contact;
    if (!c || !c.value) return "";
    const contact = `${LL.labels.contact[c.method] || ""} ${c.value}`.trim();
    return r.my_role === "learner" ? `${first}’s contact: ${contact}` : `${first} can now see your contact: ${contact}`;
  }

  function renderHead() {
    const r = request;
    const learner = r.my_role === "learner";
    const other = learner ? { name: r.teacher.name, photo_url: r.teacher.photo_url } : r.learner;
    const first = esc(LL.firstName(other.name));
    const sub = learner
      ? `${r.subject} teacher · Accepted ${LL.date(r.answered_at)}`
      : `${r.for_whom === "child" ? `For their child, ${r.child_age}` : "For themselves"} · Accepted ${LL.date(r.answered_at)}`;
    const mineStarted = learner ? r.learner_started : r.teacher_started;
    const canStart = !mineStarted && r.status === "accepted";
    const startedBtn = canStart ? `<button class="btn btn-secondary btn-sm" type="button" data-started>${icon("check")}We started lessons</button>` : "";
    const view = learner
      ? `<a class="btn btn-secondary btn-sm" href="teacher.html?id=${r.teacher.id}">View profile</a>`
      : `<button class="btn btn-secondary btn-sm" type="button" data-view-request>View request</button>`;
    const menu = [
      canStart ? `<button class="menu-item" type="button" data-started>We started lessons</button>` : "",
      learner ? `<a href="teacher.html?id=${r.teacher.id}">View profile</a>` : `<button class="menu-item" type="button" data-view-request>View request</button>`,
      `<button class="menu-item" type="button" data-report-chat>Report</button>`,
      !learner && r.status === "accepted" ? `<button class="menu-item" type="button" data-end>End lessons</button>` : "",
    ].join("");
    const summary = [
      r.subject, r.goal, r.level, LL.lessonsText(r), LL.timesText(r.preferred_times),
      LL.labels.format[r.format], LL.budget(r.budget_min, r.budget_max, r.currency),
    ].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("");
    const contact = contactText(r, first);
    let status = "";
    if (r.status === "closed") status = "Lessons ended. The chat is read-only.";
    else if (r.lessons_started) status = "You both confirmed lessons started. You can leave a review on your home page.";
    else if (mineStarted) status = `You confirmed lessons started. Waiting for ${first} to confirm.`;
    else if (learner ? r.teacher_started : r.learner_started) status = `${first} confirmed lessons started. Confirm it too to leave reviews.`;

    document.querySelector("[data-head]").innerHTML = `
      <div class="row">
        <button class="icon-btn back" type="button" data-chat-back aria-label="Back to chats">${icon("back")}</button>
        ${LL.avatar(other, 44)}
        <div class="grow"><h2>${esc(other.name)}</h2><p class="t-small muted">${esc(sub)}</p></div>
        <div class="row head-actions" style="--gap:12px">
          ${startedBtn}${view}
          <button class="icon-btn" type="button" aria-label="Report" data-report-chat>${icon("flag")}</button>
        </div>
        <div style="position:relative"><button class="icon-btn more" type="button" aria-label="More actions" data-menu-trigger>${icon("more")}</button><div class="menu">${menu}</div></div>
      </div>
      <div class="req-summary"><b>Request</b>${summary}</div>
      ${canStart ? `<button class="btn btn-secondary btn-sm btn-block mobile-started" type="button" data-started>${icon("check")}We started lessons</button>` : ""}
      ${contact ? `<p class="contact-line">${icon("lock", 14)}${esc(contact)}</p>` : ""}
      ${status ? `<p class="contact-line">${icon("check", 14)}${esc(status)}</p>` : ""}`;

    document.querySelector("[data-composer-box]").innerHTML = r.status === "accepted"
      ? `<form class="composer" data-send-form><input class="input" placeholder="Write a message…" aria-label="Write a message" autocomplete="off" maxlength="2000"><button class="btn btn-primary" type="submit" aria-label="Send">${icon("send")}<span class="lbl">Send</span></button></form>`
      : `<div class="composer"><p class="muted">This conversation is closed.</p></div>`;
  }

  function stamp(iso) {
    return LL.isToday(iso) ? LL.time(iso) : LL.dateTime(iso);
  }

  function appendMessages(list) {
    const thread = document.querySelector("[data-thread]");
    if (!thread) return;
    const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    let mine = false;
    list.forEach((m) => {
      if (m.id <= lastId) return;
      lastId = m.id;
      mine = mine || m.mine;
      thread.insertAdjacentHTML("beforeend",
        `<div class="msg${m.mine ? " me" : ""}"><div class="bubble">${esc(m.text).replace(/\n/g, "<br>")}</div><time>${stamp(m.created_at)}</time></div>`);
    });
    if (nearBottom || mine) thread.scrollTop = thread.scrollHeight;
  }

  async function open(id) {
    activeId = id;
    lastId = 0;
    clearTimeout(pollTimer);
    history.replaceState(null, "", `${page}?id=${id}`);
    renderList();
    mainEl.innerHTML = `<p class="muted" style="padding:24px">Loading…</p>`;
    let data;
    try {
      data = await LL.api.get(`/chats/${id}`);
    } catch (e) {
      mainEl.innerHTML = `<div class="empty" style="margin:24px"><div class="empty-icon">${icon("chat", 20)}</div><h3>This chat isn’t available</h3><p>${esc(e.message)}</p></div>`;
      return;
    }
    request = data.request;
    const r = request;
    const first = LL.firstName(r.my_role === "learner" ? r.teacher.name : r.learner.name);
    const accepted = r.my_role === "learner" ? `${first} accepted your request` : `You accepted ${first}’s request`;
    const contact = contactText(r, first); // shown here on phones (the header copy is hidden there)
    mainEl.innerHTML = `<div class="chat-head" data-head></div>
      <div class="thread" data-thread>${contact ? `<p class="contact-line">${icon("lock", 14)}${esc(contact)}</p>` : ""}<p class="sys">${icon("check", 14)}${esc(accepted)} · ${LL.dateTime(r.answered_at)}</p></div>
      <div data-composer-box></div>`;
    renderHead();
    appendMessages(data.messages);
    const c = chats.find((x) => x.request_id === id);
    if (c) c.unread = 0;
    renderList();
    poll();
  }

  /* Fetch new messages every 4 s (only while the tab is visible); refresh the list (unread counters) every 20 s. */
  async function tick() {
    const id = activeId;
    if (!document.hidden && id) {
      try {
        const data = await LL.api.get(`/chats/${id}?after_id=${lastId}`);
        if (id === activeId) {
          const before = JSON.stringify([request.status, request.learner_started, request.teacher_started]);
          request = data.request;
          if (JSON.stringify([request.status, request.learner_started, request.teacher_started]) !== before) renderHead();
          appendMessages(data.messages);
        }
        if (++polls % 5 === 0) await loadList();
      } catch (e) { /* try again on the next tick */ }
    }
    clearTimeout(pollTimer);
    pollTimer = setTimeout(tick, 4000);
  }
  function poll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(tick, 4000);
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && activeId) {
      clearTimeout(pollTimer);
      tick();
    }
  });

  function showRequestDetails() {
    const r = request;
    const fact = (label, value) => (value ? `<div class="fact"><small>${label}</small><div>${esc(value)}</div></div>` : "");
    document.querySelector("[data-request-details]").innerHTML = `
      <div class="facts">
        ${fact("Subject", r.subject)}${r.details.map((x) => fact(x.label, x.value)).join("")}
        ${fact("Goal details", r.goal_details)}${fact("Lessons", LL.lessonsText(r))}
        ${fact("Preferred time", LL.timesText(r.preferred_times))}${fact("Start", r.start_asap ? "As soon as possible" : LL.date(r.start_date))}
        ${fact("Planned duration", r.planned_duration)}${fact("Format", LL.labels.format[r.format])}
        ${fact("Budget", LL.budget(r.budget_min, r.budget_max, r.currency))}${fact("Free trial", r.free_trial ? "Asked for a free trial" : "")}
        ${fact("For", r.for_whom === "child" ? `Their child, ${r.child_age}` : "Themselves")}${fact("Parent contact", r.parent_contact)}
      </div>
      ${r.answers.map((a) => `<p class="t-small" style="margin-top:12px"><b>${esc(a.question)}</b><br>${esc(a.answer)}</p>`).join("")}
      <p class="message">${esc(r.message)}</p>`;
    document.getElementById("request-details").showModal();
  }

  /* ---------- Events ---------- */
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-conv], [data-started], [data-view-request], [data-report-chat], [data-end]");
    if (!el) return;
    try {
      if (el.dataset.conv) {
        open(Number(el.dataset.conv));
      } else if (el.hasAttribute("data-started")) {
        request = await LL.busy(el, () => LL.api.post(`/requests/${request.id}/started`));
        const other = LL.firstName(request.my_role === "learner" ? request.teacher.name : request.learner.name);
        LL.toast(request.lessons_started ? "Lessons confirmed. You can leave a review now." : `Thanks! We’ll ask ${other} to confirm too.`);
        renderHead();
      } else if (el.hasAttribute("data-view-request")) {
        showRequestDetails();
      } else if (el.hasAttribute("data-report-chat")) {
        LL.report({ request_id: request.id });
      } else if (el.hasAttribute("data-end")) {
        if (!confirm(`End lessons with ${request.learner.name}? The chat becomes read-only.`)) return;
        request = await LL.api.post(`/requests/${request.id}/close`);
        LL.toast("Lessons ended.");
        renderHead();
        loadList();
      }
    } catch (err) {
      LL.fail(err);
    }
  });

  document.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-send-form]");
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    const button = form.querySelector("button");
    try {
      const message = await LL.busy(button, () => LL.api.post(`/chats/${request.id}/messages`, { text }));
      input.value = "";
      appendMessages([message]);
      const c = chats.find((x) => x.request_id === request.id);
      if (c) {
        c.last_message = message;
        chats = [c].concat(chats.filter((x) => x !== c));
        renderList();
      }
    } catch (err) {
      LL.fail(err);
    }
    input.focus();
  });

  /* ---------- Start ---------- */
  try {
    await loadList();
  } catch (e) {
    convsEl.innerHTML = `<p class="muted" style="padding:12px 16px">${esc(e.message)}</p>`;
  }
  if (!activeId && chats.length) activeId = chats[0].request_id;
  if (!activeId) {
    const text = role === "teacher"
      ? ["A chat opens when you accept a request.", "teacher-home.html", "Go to requests"]
      : ["A chat opens when a teacher accepts your request.", "search.html", "Find a teacher"];
    mainEl.innerHTML = `<div class="empty" style="margin:24px"><div class="empty-icon">${icon("chat", 20)}</div><h3>No chats yet</h3><p>${text[0]}</p>
      <div class="empty-actions"><a class="btn btn-primary" href="${text[1]}">${text[2]}</a></div></div>`;
    return;
  }
  if (!LL.params.get("id") && window.matchMedia("(max-width: 899px)").matches) chatEl.classList.add("show-list");
  open(activeId);
});
