/* results.html — teachers matching the filters in the URL. */
document.addEventListener("DOMContentLoaded", async () => {
  const F = LL.filters;
  const panel = document.querySelector("[data-filters]");
  const list = document.querySelector("[data-list]");
  const PAGE = 20;
  let filters = F.fromQuery(LL.params);
  if (!filters.subject) return location.replace("search.html");
  let sort = LL.params.get("sort") || "best";
  let items = [];
  let total = 0;
  let relax = [];

  await F.loadOptions(panel);
  F.write(panel, filters);
  setSortLabels();

  function setSortLabels() {
    document.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("is-selected", b.dataset.sort === sort));
    const label = document.querySelector(`[data-sort="${sort}"]`).textContent.trim();
    document.querySelectorAll("[data-menu-label]").forEach((el) => (el.textContent = label));
  }

  function updateChrome() {
    const tags = F.summary(filters).slice(1); // without the subject
    document.querySelector("[data-title]").textContent = `${filters.subject} teachers`;
    document.title = `${filters.subject} teachers · LeaLink`;
    document.querySelector("[data-filter-count]").textContent = tags.length ? `Filters · ${tags.length}` : "Filters";
    const chips = tags.slice(0, 3).map((t) => `<span class="tag-chip">${LL.esc(t)}</span>`).join("");
    const more = tags.length > 3 ? `<button class="chip" type="button" data-sheet="#filters">+ ${tags.length - 3} more</button>` : "";
    document.querySelector("[data-mobile-chips]").innerHTML = chips + more;
  }

  function render() {
    const lead = `${total} ${total === 1 ? "teacher matches" : "teachers match"} your filters`;
    document.querySelector("[data-lead]").textContent = lead;
    document.querySelector("[data-sheet-count]").textContent = total ? `Show ${total} ${total === 1 ? "teacher" : "teachers"}` : "Show results";
    const footer = items.length < total
      ? `<p class="center" style="padding-top:12px"><button class="btn btn-secondary" type="button" data-more>Show more teachers</button></p>`
      : `<p class="center muted" style="padding-top:12px">Showing all ${total} ${total === 1 ? "teacher" : "teachers"}</p>`;
    list.innerHTML = items.map((t) => LL.teacherCard(t)).join("") + footer;
    renderEmpty();
    LL.setState(total ? "default" : "empty");
  }

  function renderEmpty() {
    const counts = Object.fromEntries(relax.map((r) => [r.filter, r.count]));
    const chips = F.strict(filters).sort((a, b) => (counts[b.key] || 0) - (counts[a.key] || 0));
    document.querySelector("[data-relax]").innerHTML = chips
      .map((c) => `<span class="tag-chip">${LL.esc(c.text)}${counts[c.key] ? ` (+${counts[c.key]})` : ""}<button class="x" type="button" data-relax-key="${c.key}" aria-label="Remove ${LL.esc(c.text)}">${LL.icon("x", 12)}</button></span>`)
      .join("");
    document.querySelector("[data-relax-all]").hidden = !chips.length;
    document.querySelector("[data-empty-text]").textContent = chips.length
      ? `No ${filters.subject} teachers match all of your filters right now. Relax a few filters, or we’ll email you when a matching teacher joins.`
      : `There are no ${filters.subject} teachers on LeaLink yet. We’ll email you when one joins.`;
  }

  async function load(append) {
    try {
      const res = await LL.api.get(`/teachers/search?${F.toQuery(filters, { sort, offset: append ? items.length : 0, limit: PAGE })}`);
      items = append ? items.concat(res.items) : res.items;
      total = res.total;
      relax = res.relax;
      render();
    } catch (e) {
      LL.setState("error");
    }
  }

  function apply(next) {
    filters = next;
    F.write(panel, filters);
    changed();
  }

  let lastQuery = F.toQuery(filters, { sort });
  function changed() {
    const query = F.toQuery(filters, { sort });
    if (query === lastQuery) return;
    lastQuery = query;
    history.replaceState(null, "", "?" + query);
    LL.store.set("ll-results", "results.html?" + query, true);
    LL.draft.set("search", filters);
    updateChrome();
    load(false);
  }

  F.watch(panel, () => {
    const next = F.read(panel);
    if (next.subject) {
      filters = next;
      changed();
    }
  });

  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-sort], [data-more], [data-relax-key], [data-relax-all], [data-notify], [data-retry], [data-reset]");
    if (!el) return;
    if (el.dataset.sort) {
      sort = el.dataset.sort;
      setSortLabels();
      changed();
    } else if (el.hasAttribute("data-more")) {
      LL.busy(el, () => load(true));
    } else if (el.dataset.relaxKey) {
      apply(F.without(filters, el.dataset.relaxKey));
    } else if (el.hasAttribute("data-relax-all")) {
      // Remove the filter that brings back the most teachers, or all strict filters.
      const keys = relax.length ? [relax[0].filter] : F.strict(filters).map((c) => c.key);
      apply(keys.reduce((f, key) => F.without(f, key), filters));
    } else if (el.hasAttribute("data-notify")) {
      if (!LL.auth.loggedIn()) {
        LL.toast("Log in so we know where to send the email.");
        setTimeout(() => (location.href = LL.auth.loginUrl()), 900);
        return;
      }
      try {
        await LL.busy(el, () => LL.api.post("/alerts", F.toBody(filters)));
        LL.toast("We’ll email you when a matching teacher joins.");
      } catch (err) {
        LL.fail(err);
      }
    } else if (el.hasAttribute("data-retry")) {
      load(false);
    } else if (el.hasAttribute("data-reset")) {
      apply(Object.assign({}, F.DEFAULTS, { subject: filters.subject }));
      LL.toast("Filters reset.");
    }
  });

  LL.draft.set("search", filters);
  LL.store.set("ll-results", "results.html" + location.search, true);
  updateChrome();
  load(false);
});
