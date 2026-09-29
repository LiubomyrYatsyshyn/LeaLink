/* search.html — "Find a teacher": pick a subject first, then its fields; live count of matching teachers, then results.html. */
document.addEventListener("DOMContentLoaded", async () => {
  const F = LL.filters;
  const form = document.querySelector("[data-filters]");
  await F.loadOptions(form);
  F.write(form, LL.draft.get("search") || F.DEFAULTS);

  let last = "";
  async function update() {
    const f = F.read(form);
    const query = F.toQuery(f);
    LL.draft.set("search", f);
    document.querySelector("[data-summary]").innerHTML = LL.tags(F.summary(f));
    document.querySelectorAll("[data-show-results]").forEach((a) => (a.href = f.subject ? "results.html?" + query : "#"));
    if (query === last) return;
    last = query;
    let total = null;
    if (f.subject) {
      try {
        total = (await LL.api.get(`/teachers/search?${query}&limit=1`)).total;
      } catch (e) { /* the count is optional; results.html shows the error */ }
    }
    document.querySelectorAll("[data-count]").forEach((el) => (el.textContent = total == null ? "–" : total));
    document.querySelectorAll("[data-show-results]").forEach((a) => {
      a.textContent = !f.subject ? "Show teachers" : total ? `Show ${total} ${total === 1 ? "teacher" : "teachers"}` : "Show results";
    });
  }

  /* "Show teachers" opens the results only when the required fields are filled in. */
  document.querySelectorAll("[data-show-results]").forEach((a) =>
    a.addEventListener("click", (e) => {
      const missing = F.validate(form);
      if (!missing.length) return;
      e.preventDefault();
      LL.toast(`Fill in the required fields: ${missing.join(", ")}.`);
      const first = form.querySelector(".field.is-error");
      if (first) {
        first.scrollIntoView({ behavior: "smooth", block: "center" });
        const control = first.querySelector("input, select");
        if (control && control.type !== "checkbox") setTimeout(() => control.focus({ preventScroll: true }), 300);
      }
    })
  );

  F.watch(form, update);
  document.querySelector("[data-reset]").addEventListener("click", () => {
    F.write(form, Object.assign({}, F.DEFAULTS, { subject: F.read(form).subject }));
    LL.toast("Filters reset.");
    update();
  });
  update();
});
