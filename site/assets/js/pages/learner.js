/* learner.html — "My requests": sent, accepted and declined requests. */
document.addEventListener("DOMContentLoaded", async () => {
  const { esc, icon } = LL;
  const $ = (s) => document.querySelector(s);
  const user = await LL.auth.require();
  $("[data-hello]").textContent = `Hi, ${LL.firstName(user.full_name)}`;

  const GROUPS = { sent: ["pending", "expired", "withdrawn"], accepted: ["accepted", "closed"], declined: ["declined"] };
  const EMPTY = { sent: "No sent requests right now.", accepted: "No accepted requests yet.", declined: "No declined requests." };
  const BADGE = { pending: "badge-pending", accepted: "badge-accepted" };
  let items = [];
  let withdrawId = null;

  const note = (iconName, text) => `<p class="note">${icon(iconName, 14)}${text}</p>`;

  function timer(r) {
    const pct = Math.max(2, Math.min(100, Math.round((r.hours_left / 72) * 100)));
    return `<div class="timer${r.hours_left <= 12 ? " is-urgent" : ""}"><span class="timer-label">${icon("clock", 14)}${r.hours_left}h left</span><span class="timer-bar"><span style="width:${pct}%"></span></span></div>`;
  }

  function card(r) {
    const name = r.teacher.name;
    const first = esc(LL.firstName(name));
    const opened = r.status === "accepted" || r.status === "closed";
    const when = opened ? `Accepted ${LL.date(r.answered_at)}` : r.status === "declined" ? `Declined ${LL.date(r.answered_at)}` : `Sent ${LL.date(r.created_at)}`;
    let actions = "";
    let extra = "";
    if (r.status === "pending") {
      actions = `${timer(r)}<button class="btn btn-secondary" type="button" data-withdraw="${r.id}">Withdraw</button>`;
    } else if (r.status === "expired") {
      extra = note("alert", "The teacher didn’t reply within 72 hours. This request no longer counts toward your limit.");
    } else if (r.status === "withdrawn") {
      extra = note("alert", "You withdrew this request.");
    } else if (r.status === "declined") {
      extra = note("alert", `Reason: ${esc(r.decline_reason)}${r.decline_note ? ` — “${esc(r.decline_note)}”` : ""}`);
    } else {
      const started = r.learner_started ? "" : `<button class="btn btn-secondary btn-sm" type="button" data-started="${r.id}">${icon("check")}We started lessons</button>`;
      const review = r.can_review ? `<button class="btn btn-primary btn-sm" type="button" data-review="${r.id}">${icon("edit")}Leave review</button>`
        : r.my_review ? `<button class="btn btn-ghost btn-sm" type="button" data-review="${r.id}">${icon("edit")}Edit review</button>` : "";
      actions = `${started}<a class="btn ${r.can_review ? "btn-secondary" : "btn-primary"} btn-sm" href="chat.html?id=${r.id}">${icon("chat")}Open chat</a>${review}`;
      if (r.status === "closed") extra = note("alert", `${first} ended the lessons. The chat is read-only now.`);
      else if (r.lessons_started) extra = note("check", r.my_review ? "You both confirmed lessons started. Thanks for your review." : "You both confirmed lessons started. Share how it’s going.");
      else if (r.learner_started) extra = note("check", `You confirmed lessons started. Waiting for ${first} to confirm.`);
      else if (r.teacher_started) extra = note("alert", `${first} confirmed lessons started. Confirm it too to leave reviews.`);
      else extra = note("alert", "Agree on the details in chat. When your first lesson happens, confirm it here.");
    }
    const badge = `<span class="badge ${BADGE[r.status] || "badge-declined"}">${LL.labels.status[r.status]}</span>`;
    return `<article class="rcard">
      <div class="rcard-row">
        <a href="teacher.html?id=${r.teacher.id}">${LL.avatar(r.teacher, 48)}</a>
        <div class="rcard-info">
          <div class="rcard-title"><h3>${esc(name)}</h3>${badge}</div>
          <p class="rcard-sub">${esc([r.subject, r.goal, when].join(" · "))}</p>
        </div>
        ${actions ? `<div class="rcard-actions">${actions}</div>` : ""}
      </div>
      ${extra}
    </article>`;
  }

  function render(data) {
    items = data.items;
    $("[data-active-count]").textContent = data.active;
    $("[data-limit]").textContent = data.limit;
    $("[data-active-bar]").style.width = `${Math.round((100 * data.active) / data.limit)}%`;
    Object.entries(GROUPS).forEach(([tab, statuses]) => {
      const list = items.filter((r) => statuses.includes(r.status));
      $(`[data-count="${tab}"]`).textContent = list.length;
      let markup = list.length ? list.map(card).join("") : `<p class="muted">${EMPTY[tab]}</p>`;
      if (tab === "declined" && list.length) markup += `<p class="muted">Declined requests don’t count toward your limit. You can send a request to another teacher at any time.</p>`;
      $(`[data-list="${tab}"]`).innerHTML = markup;
    });
    LL.setState(items.length ? "default" : "empty");
  }

  async function load() {
    try {
      render(await LL.api.get("/requests/sent"));
    } catch (e) {
      document.querySelectorAll("[data-count]").forEach((el) => (el.textContent = "–"));
      LL.setState("error");
    }
  }

  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-withdraw], [data-confirm-withdraw], [data-started], [data-review]");
    if (!el) return;
    const find = (id) => items.find((r) => r.id === Number(id));
    try {
      if (el.dataset.withdraw) {
        withdrawId = Number(el.dataset.withdraw);
        $("[data-withdraw-text]").textContent = `${find(withdrawId).teacher.name} won’t see your request anymore, and a slot frees up in your limit.`;
        document.getElementById("withdraw").showModal();
      } else if (el.hasAttribute("data-confirm-withdraw")) {
        await LL.busy(el, () => LL.api.post(`/requests/${withdrawId}/withdraw`));
        document.getElementById("withdraw").close();
        LL.toast("Request withdrawn.");
        load();
      } else if (el.dataset.started) {
        const r = await LL.busy(el, () => LL.api.post(`/requests/${el.dataset.started}/started`));
        LL.toast(r.lessons_started ? "Lessons confirmed. You can leave a review now." : `Thanks! We’ll ask ${LL.firstName(r.teacher.name)} to confirm too.`);
        load();
      } else if (el.dataset.review) {
        LL.review.open(find(el.dataset.review), load);
      }
    } catch (err) {
      LL.fail(err);
    }
  });

  load();
});
