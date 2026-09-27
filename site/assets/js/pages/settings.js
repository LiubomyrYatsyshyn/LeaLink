/* settings.html — account settings. */
document.addEventListener("DOMContentLoaded", async () => {
  const $ = (s) => document.querySelector(s);
  let user = await LL.auth.require();

  function render() {
    $("[data-avatar]").innerHTML = LL.avatar({ name: user.full_name, photo_url: user.photo_url }, 72);
    $("[data-photo-remove]").hidden = !user.photo_url;
    $("#s-name").value = user.full_name;
    $("#s-email").value = user.email;
    $("#s-country").value = user.country || "";
    LL.fillTimezones($("#s-tz"), user.timezone);
    document.querySelectorAll("[data-notify]").forEach((el) => (el.checked = user[el.dataset.notify]));
    const changed = new Date(user.password_changed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    $("[data-pwd-date]").textContent = `Last changed ${changed}`;
    const box = $("[data-teacher-box]");
    if (user.teacher_id) {
      const status = { draft: "Draft — not submitted yet", pending: "Under review", approved: "Published", rejected: "Needs changes" }[user.teacher_status];
      box.innerHTML = `<span>Teacher</span><p class="t-small muted" style="margin-top:4px">Your teacher profile: ${status}.</p>
        <a class="btn btn-secondary btn-sm" href="teacher-home.html" style="margin-top:10px">${LL.icon("swap")}Go to teaching</a>`;
    }
  }

  async function save(changes, message) {
    user = await LL.api.patch("/auth/me", changes);
    LL.auth.setUser(user);
    render();
    if (message) LL.toast(message);
  }

  $("[data-save-profile]").addEventListener("click", (e) => {
    const fields = { name: $("#s-name").closest(".field"), email: $("#s-email").closest(".field") };
    const name = $("#s-name").value.trim();
    const email = $("#s-email").value.trim();
    LL.fieldError(fields.name, name ? null : "Enter your name.");
    LL.fieldError(fields.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : "Enter a valid email.");
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    LL.busy(e.currentTarget, () => save({ full_name: name, email, timezone: $("#s-tz").value, country: $("#s-country").value.trim() || null }, "Changes saved.")).catch(LL.fail);
  });

  document.querySelectorAll("[data-notify]").forEach((el) =>
    el.addEventListener("change", () => save({ [el.dataset.notify]: el.checked }, "Notification settings saved.").catch((err) => {
      el.checked = !el.checked;
      LL.fail(err);
    }))
  );

  $("[data-photo-input]").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    try {
      user = await LL.api.post("/auth/me/photo", body);
      LL.auth.setUser(user);
      render();
      LL.toast("Photo updated.");
    } catch (err) {
      LL.fail(err);
    }
  });

  $("[data-photo-remove]").addEventListener("click", async () => {
    try {
      user = await LL.api.del("/auth/me/photo");
      LL.auth.setUser(user);
      render();
      LL.toast("Photo removed.");
    } catch (err) {
      LL.fail(err);
    }
  });

  $("[data-change-password]").addEventListener("click", async (e) => {
    const current = $("#pwd-current").value;
    const next = $("#pwd-new").value;
    LL.fieldError($('[data-field="new"]'), next.length >= 8 ? null : "Use 8 or more characters.");
    if (next.length < 8) return;
    try {
      const res = await LL.busy(e.currentTarget, () => LL.api.post("/auth/change-password", { current_password: current, new_password: next }));
      LL.auth.save(res);
      user = res.user;
      render();
      $("#pwd-current").value = $("#pwd-new").value = "";
      document.getElementById("password").close();
      LL.toast("Password changed.");
    } catch (err) {
      LL.fieldError($('[data-field="current"]'), err.message);
    }
  });

  render();
});
