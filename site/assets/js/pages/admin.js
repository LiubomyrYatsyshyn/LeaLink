/* admin.html — moderation: teacher profiles, reports, users. Moderators only. */
document.addEventListener("DOMContentLoaded", async () => {
  const { esc, icon, labels } = LL;
  const $ = (s) => document.querySelector(s);
  const user = await LL.auth.require();
  if (!user.is_admin) {
    document.querySelector("main").innerHTML = `<div class="empty"><div class="empty-icon">${icon("lock", 20)}</div><h3>Moderators only</h3><p>Ask the site owner to give your account moderator rights.</p></div>`;
    return;
  }

  let rejectId = null;
  const fact = (label, value) => (value ? `<div class="fact"><small>${label}</small><div>${value}</div></div>` : "");

  /* ---------- Profiles ---------- */
  function profileCard(p) {
    const certs = p.certificates.map((c) => `<button class="link" type="button" data-cert="${c.id}">${icon("file", 14)}${esc(c.title)}</button>`).join("<br>");
    const edu = p.education.map((e) => esc([e.degree, e.institution].filter(Boolean).join(", "))).join("<br>");
    return `<article class="rcard">
      <div class="rcard-row">
        ${LL.avatar({ name: p.display_name, photo_url: p.photo_url }, 56)}
        <div class="rcard-info">
          <div class="rcard-title"><h3>${esc(p.display_name)}</h3><span class="badge badge-pending">Submitted ${LL.dateTime(p.submitted_at)}</span></div>
          <p class="rcard-sub">${esc(p.headline)}</p>
        </div>
        <a class="btn btn-secondary btn-sm" href="teacher.html?id=${p.id}" target="_blank">${icon("eye")}View as learner</a>
      </div>
      <p class="message">${esc(p.about)}</p>
      <div class="facts" style="margin-top:16px">
        ${fact("Subjects", esc(p.subjects.join(", ")))}
        ${fact("Topics", esc(p.topics.join(", ")))}
        ${fact("Levels", LL.levelRange(p.levels))}
        ${fact("Age groups", p.age_groups.map((a) => labels.age[a]).join(", "))}
        ${fact("Location", esc([p.city, p.country].filter(Boolean).join(", ")))}
        ${fact("Languages", esc(p.languages.map((l) => `${l.language} (${l.level})`).join(", ")))}
        ${fact("Experience", p.experience_years != null ? `${p.experience_years} years · ${esc(p.occupation || "")}` : "")}
        ${fact("Previously", esc(p.practical_experience))}
        ${fact("Education", edu)}
        ${fact("Certificates", certs)}
        ${fact("Links", esc(p.links.join(", ")))}
        ${fact("Video", p.video_url ? esc(p.video_url) : "")}
        ${fact("Format", esc(labels.format[p.format] + (p.offline_location ? ` · ${p.offline_location}` : "")))}
        ${fact("Price", `${LL.money(p.price, p.currency)} / lesson${p.free_trial ? ` · free ${p.trial_minutes}-min trial` : ""}`)}
        ${fact("Contact", esc(`${labels.contact[p.contact_method] || ""} ${p.contact_value || ""}`))}
        ${fact("Questions", esc(p.questions.join(" · ")))}
      </div>
      <div class="inreq-actions">
        <label class="check"><input type="checkbox" data-verified="${p.id}"${p.is_verified ? " checked" : ""}><span>Verified (certificates checked)</span></label>
        <button class="btn btn-secondary" type="button" data-reject="${p.id}">Send back</button>
        <button class="btn btn-primary" type="button" data-approve="${p.id}">Approve and publish</button>
      </div>
    </article>`;
  }

  async function loadProfiles() {
    const list = await LL.api.get("/admin/teachers?status=pending");
    $("[data-count=profiles]").textContent = list.length;
    $("[data-list=profiles]").innerHTML = list.length ? list.map(profileCard).join("")
      : `<div class="empty"><div class="empty-icon">${icon("check", 20)}</div><h3>Nothing to review</h3><p>New and edited teacher profiles appear here.</p></div>`;
  }

  /* ---------- Reports ---------- */
  function reportCard(r) {
    const target = r.teacher_id ? `<a class="link" href="teacher.html?id=${r.teacher_id}" target="_blank">teacher profile</a>` : r.request_id ? "a chat" : "";
    return `<article class="rcard">
      <div class="rcard-row">
        ${LL.avatar(r.reported, 44)}
        <div class="rcard-info">
          <div class="rcard-title"><h3>${esc(r.reported.name)}</h3><span class="badge badge-declined">${esc(r.reason)}</span></div>
          <p class="rcard-sub">Reported by ${esc(r.reporter.name)} · ${LL.dateTime(r.created_at)}${target ? ` · from ${target}` : ""}</p>
        </div>
      </div>
      ${r.details ? `<p class="message">${esc(r.details)}</p>` : ""}
      <div class="inreq-actions">
        <input class="input" placeholder="Note (optional)" style="max-width:320px" data-note="${r.id}">
        <button class="btn btn-secondary" type="button" data-block="${r.reported.id}">Block user</button>
        <button class="btn btn-primary" type="button" data-resolve="${r.id}">Resolve</button>
      </div>
    </article>`;
  }

  async function loadReports() {
    const list = await LL.api.get("/admin/reports?status=open");
    $("[data-count=reports]").textContent = list.length;
    $("[data-list=reports]").innerHTML = list.length ? list.map(reportCard).join("")
      : `<div class="empty"><div class="empty-icon">${icon("check", 20)}</div><h3>No open reports</h3><p>Reports from “Report” buttons appear here.</p></div>`;
  }

  /* ---------- Users ---------- */
  function userRow(u) {
    const badges = [
      u.is_admin ? '<span class="badge badge-role">Moderator</span>' : "",
      u.teacher_status ? `<span class="badge badge-active">Teacher · ${esc(u.teacher_status)}</span>` : "",
      u.is_blocked ? '<span class="badge badge-declined">Blocked</span>' : "",
    ].join(" ");
    const action = u.id === user.id ? "" : u.is_blocked
      ? `<button class="btn btn-secondary btn-sm" type="button" data-unblock="${u.id}">Unblock</button>`
      : `<button class="btn btn-secondary btn-sm" type="button" data-block="${u.id}">Block</button>`;
    return `<article class="scard">${LL.avatar({ name: u.full_name }, 40)}
      <div class="rcard-info"><h3>${esc(u.full_name)} ${badges}</h3><p class="rcard-sub">${esc(u.email)} · joined ${LL.date(u.created_at)}</p></div>
      <div class="rcard-actions">${action}</div></article>`;
  }

  async function loadUsers() {
    const q = $("[data-user-search]").value.trim();
    const list = await LL.api.get("/admin/users" + (q ? `?q=${encodeURIComponent(q)}` : ""));
    $("[data-list=users]").innerHTML = list.length ? list.map(userRow).join("") : '<p class="muted">No users found.</p>';
  }
  $("[data-user-search]").addEventListener("input", LL.debounce(() => loadUsers().catch(LL.fail), 300));

  /* ---------- Actions ---------- */
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-approve], [data-reject], [data-confirm-reject], [data-resolve], [data-block], [data-unblock], [data-cert]");
    if (!el) return;
    try {
      if (el.dataset.approve) {
        const verified = $(`[data-verified="${el.dataset.approve}"]`).checked;
        await LL.busy(el, () => LL.api.post(`/admin/teachers/${el.dataset.approve}/approve`, { verified }));
        LL.toast("Profile published. The teacher got an email.");
        loadProfiles();
      } else if (el.dataset.reject) {
        rejectId = el.dataset.reject;
        $("#reject-note").value = "";
        document.getElementById("reject").showModal();
      } else if (el.hasAttribute("data-confirm-reject")) {
        const note = $("#reject-note").value.trim();
        LL.fieldError($('[data-field="note"]'), note.length >= 5 ? null : "Write at least 5 characters.");
        if (note.length < 5) return;
        await LL.busy(el, () => LL.api.post(`/admin/teachers/${rejectId}/reject`, { note }));
        document.getElementById("reject").close();
        LL.toast("Sent back to the teacher.");
        loadProfiles();
      } else if (el.dataset.resolve) {
        const note = $(`[data-note="${el.dataset.resolve}"]`).value.trim() || null;
        await LL.busy(el, () => LL.api.post(`/admin/reports/${el.dataset.resolve}/resolve`, { note }));
        LL.toast("Report resolved.");
        loadReports();
      } else if (el.dataset.block || el.dataset.unblock) {
        const id = el.dataset.block || el.dataset.unblock;
        if (el.dataset.block && !confirm("Block this user? They can’t log in, and their teacher profile disappears from search.")) return;
        await LL.busy(el, () => LL.api.post(`/admin/users/${id}/${el.dataset.block ? "block" : "unblock"}`));
        LL.toast(el.dataset.block ? "User blocked." : "User unblocked.");
        loadUsers();
      } else if (el.dataset.cert) {
        const res = await fetch(`/api/teacher/certificates/${el.dataset.cert}/file`, { headers: { Authorization: "Bearer " + LL.store.get("ll-token") } });
        if (!res.ok) throw new Error("Couldn’t open the file.");
        window.open(URL.createObjectURL(await res.blob()), "_blank");
      }
    } catch (err) {
      LL.fail(err);
    }
  });

  Promise.all([loadProfiles(), loadReports(), loadUsers()]).catch(LL.fail);
});
