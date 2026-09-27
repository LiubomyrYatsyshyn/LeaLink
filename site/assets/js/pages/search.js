/* search.html — "Find a teacher": live count of matching teachers, then results.html. */
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
    document.querySelectorAll("[data-show-results]").forEach((a) => (a.href = "results.html?" + query));
    if (query === last) return;
    last = query;
    let total = null;
    try {
      total = (await LL.api.get(`/teachers/search?${query}&limit=1`)).total;
    } catch (e) { /* the count is optional; results.html shows the error */ }
    document.querySelectorAll("[data-count]").forEach((el) => (el.textContent = total == null ? "–" : total));
    document.querySelectorAll("[data-show-results]").forEach((a) => {
      a.textContent = total ? `Show ${total} ${total === 1 ? "teacher" : "teachers"}` : "Show results";
    });
  }

  F.watch(form, update);
  document.querySelector("[data-reset]").addEventListener("click", () => {
    F.write(form, Object.assign({}, F.DEFAULTS, { subject: F.read(form).subject }));
    LL.toast("Filters reset.");
    update();
  });
  update();
});
