/* teacher.html?id=<teacher id> — the public teacher page. */
document.addEventListener("DOMContentLoaded", async () => {
  const { esc, icon, labels } = LL;
  const main = document.querySelector("[data-profile]");
  const id = LL.params.get("id");
  const match = LL.params.get("match");
  const back = LL.store.get("ll-results", true); // the last results page, saved by results.js
  if (back) document.querySelector("[data-back]").href = back;

  let t;
  try {
    if (!id) throw new LL.ApiError(404, "Teacher not found");
    t = await LL.api.get(`/teachers/${id}`);
  } catch (e) {
    main.innerHTML = `<div class="empty"><div class="empty-icon">${icon("search", 20)}</div><h3>${e.status === 404 ? "Teacher not found" : "We couldn’t load this teacher"}</h3>
      <p>${e.status === 404 ? "This profile doesn’t exist or isn’t published." : esc(e.message)}</p>
      <div class="empty-actions"><a class="btn btn-primary" href="search.html">${icon("search")}Find a teacher</a></div></div>`;
    return;
  }

  const first = LL.firstName(t.display_name);
  document.title = `${t.display_name} · ${t.subjects[0] || ""} teacher · LeaLink`;
  // For search engines: a description and one canonical address per teacher.
  document.querySelector('meta[name="description"]').content = `${t.display_name}: ${t.headline || t.subjects.join(", ")}. ${t.subjects.join(", ")} lessons on LeaLink.`;
  const canonical = document.createElement("link");
  canonical.rel = "canonical";
  canonical.href = `${location.origin}/teacher.html?id=${t.id}`;
  document.head.appendChild(canonical);
  const price = `${LL.money(t.price, t.currency)}<small>/ lesson</small>`;
  const sendUrl = `request.html?teacher=${t.id}`;
  const matchBadge = match ? `<span class="badge badge-match">${esc(match)}% match</span>` : "";

  const features = [
    t.free_trial ? `<li>${icon("check").replace('class="i', 'class="ok i')}Free ${t.trial_minutes}-minute trial lesson</li>` : "",
    t.package_size && t.package_discount ? `<li>${icon("check").replace('class="i', 'class="ok i')}${t.package_discount}% off a package of ${t.package_size} lessons</li>` : "",
    t.response_hours ? `<li>${icon("clock")}Usually replies within ${t.response_hours} hours</li>` : "",
  ].join("");
  const accepting = t.accepting_students
    ? `<li>${icon("users")}Accepting new students</li>`
    : `<li>${icon("users")}Not accepting new students right now</li>`;

  const location = [t.city, t.country].filter(Boolean).join(", ");
  const langs = t.languages.map((l) => `${esc(l.language)} (${esc(l.level)})`).join(", ");
  const fact = (label, value, wide) => (value ? `<div class="fact"${wide ? ' style="grid-column:span 2"' : ""}><small>${label}</small><div>${value}</div></div>` : "");
  const years = (n) => `${n} ${n === 1 ? "year" : "years"}`;
  const education = t.education.map((e) => esc([e.degree, e.institution].filter(Boolean).join(", "))).join("<br>");
  const certificates = t.certificates.map((c) => esc(c.title)).join(" · ") + (t.certificates.length && t.is_verified ? " · Verified" : "");
  const format = t.format === "online" ? "Online"
    : `${t.format === "both" ? "Online · " : ""}In person in ${esc(t.offline_location || t.city || "")}${t.travel_radius_km ? ` (up to ${t.travel_radius_km} km)` : ""}`;
  const types = t.lesson_types.map((x) => labels.lessonType[x]).join(", ").toLowerCase().replace(/^./, (c) => c.toUpperCase())
    + (t.lesson_types.includes("group") && t.max_group_size ? ` (up to ${t.max_group_size})` : "");
  const links = t.links.map((l) => {
    const url = /^https?:\/\//.test(l) ? l : "https://" + l;
    return `<a class="link" href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(l.replace(/^https?:\/\//, ""))}</a>`;
  }).join("<br>");
  const video = t.video_url && /^https?:\/\//.test(t.video_url) ? `<p style="margin-top:12px"><a class="link" href="${esc(t.video_url)}" target="_blank" rel="noopener nofollow">${icon("video")}Watch intro video</a></p>` : "";

  main.innerHTML = `
  <div class="split split-profile">
    <div>
      <div class="profile-head">
        ${LL.avatar({ name: t.display_name, photo_url: t.photo_url }, 112)}
        <div class="tcard-name"><h1 class="t-h1">${esc(t.display_name)}</h1>${t.is_verified ? `<span class="badge badge-verified">${icon("check", 12)}Verified</span>` : ""}${t.free_trial ? '<span class="badge badge-trial">Free trial</span>' : ""}</div>
        <div class="profile-rest">
          <p class="tcard-headline" style="font-size:18px;line-height:26px">${esc(t.headline)}</p>
          <div class="profile-meta">
            ${t.reviews_count ? `<span class="rating" style="font-size:15px">${icon("star", 14).replace('class="i', 'class="star i')}<b>${t.rating.toFixed(1)}</b> (${t.reviews_count})</span>` : '<span class="rating" style="font-size:15px">New teacher</span>'}
            ${location ? `<span class="row" style="--gap:6px">${icon("pin")}${esc(location)}</span>` : ""}
            ${langs ? `<span class="row" style="--gap:6px">${icon("globe")}${langs}</span>` : ""}
          </div>
        </div>
      </div>

      <div class="card card-sm show-mobile" style="margin-top:20px;padding:16px 20px">
        <ul class="feature-list">${features}${accepting}</ul>
        ${matchBadge ? `<div style="margin-top:12px">${matchBadge}</div>` : ""}
      </div>

      <section class="tp-section">
        <h2>About me</h2>
        <p class="about">${esc(t.about)}</p>
        ${video}
      </section>

      <section class="tp-section">
        <h2>Subjects</h2>
        ${t.offers_view.map((o, i) => `<h3 class="t-h3" style="margin-top:${i ? 28 : 20}px">${esc(o.subject)}</h3>
          <div class="facts" style="margin-top:12px">${o.facts.map((x) => fact(esc(x.label), esc(x.value))).join("")}</div>`).join("")}
      </section>

      <section class="tp-section">
        <h2>Experience</h2>
        <div class="facts">
          ${fact("Teaching", t.experience_years != null ? years(t.experience_years) : "")}
          ${fact("Current occupation", esc(t.occupation))}
          ${fact("Previously", esc(t.practical_experience))}
          ${fact("Education", education, true)}
          ${fact("Certificates", certificates)}
          ${fact("Links", links)}
        </div>
      </section>

      <section class="tp-section">
        <h2>Lessons</h2>
        <div class="facts">
          ${fact("Format", format)}
          ${fact("Platforms", esc(t.platforms.join(", ")))}
          ${fact("Lesson type", types)}
          ${fact("Duration", t.durations.length ? t.durations.join(" or ") + " min" : "")}
          ${fact("Free trial", t.free_trial ? `${t.trial_minutes} min` : "")}
          ${fact("Minimum commitment", t.min_commitment ? `${t.min_commitment} lessons` : "")}
          ${fact("Group price", t.group_price ? `${LL.money(t.group_price, t.currency)} per learner` : "")}
        </div>
      </section>

      <section class="tp-section">
        <h2>Availability</h2>
        <p class="muted" style="margin:-8px 0 16px">Shown in ${esc(first)}’s time zone${t.timezone ? `: ${esc(t.timezone.replace(/_/g, " "))}` : ""}.</p>
        ${LL.availabilityGrid(t.availability)}
      </section>

      <section class="tp-section">
        <div class="row-between review-head" style="padding-bottom:16px;border-bottom:1px solid var(--border)">
          <h2 style="margin:0">Reviews</h2>
          ${t.reviews_count ? `<span class="rating" style="font-size:15px">${icon("star", 18).replace('class="i', 'class="star i')}<b style="font-size:22px">${t.rating.toFixed(1)}</b>&nbsp;${t.reviews_count} ${t.reviews_count === 1 ? "review" : "reviews"}</span>` : ""}
        </div>
        <div data-reviews>${t.reviews_count ? "" : '<p class="muted" style="padding-top:20px">No reviews yet. Reviews appear after learners start lessons with this teacher.</p>'}</div>
        <button class="btn btn-secondary" type="button" style="margin-top:20px" data-more-reviews hidden>Show all ${t.reviews_count} reviews</button>
        <p class="center show-mobile" style="margin-top:24px"><button class="link link-muted" type="button" data-report="${t.id}">${icon("flag", 14)}Report this profile</button></p>
      </section>
    </div>

    <aside class="card sticky hide-mobile" style="padding:24px">
      <div class="row-between" style="align-items:flex-start"><span class="price price-lg">${price}</span><span style="margin-top:10px">${matchBadge}</span></div>
      <ul class="feature-list" style="margin-top:16px">${features}${accepting}</ul>
      ${t.accepting_students ? `<a class="btn btn-primary btn-lg btn-block" href="${sendUrl}" style="margin-top:20px">Send request</a>` : ""}
      <p class="t-micro muted" style="margin-top:16px;font-size:13px;line-height:18px">${esc(first)} has 72 hours to accept. Chat opens after ${esc(first)} accepts. No payments on LeaLink — you agree on them directly.</p>
      <p class="center" style="margin-top:20px"><button class="link link-muted" type="button" data-report="${t.id}">${icon("flag", 14)}Report this profile</button></p>
    </aside>
  </div>`;

  const bar = document.querySelector("[data-mobile-bar]");
  bar.hidden = false;
  document.querySelector("[data-mobile-price]").innerHTML = price;
  const send = bar.querySelector("[data-send]");
  send.href = sendUrl;
  send.hidden = !t.accepting_students;

  // Reviews: 3 first, then all.
  const box = main.querySelector("[data-reviews]");
  const more = main.querySelector("[data-more-reviews]");
  const stars = (n) => [1, 2, 3, 4, 5].map((i) => icon("star", 14).replace('class="i', i <= n ? 'class="i' : 'class="off i')).join("");
  const reviewHtml = (r) => `<div class="review">
      <div class="row-between"><div class="row">${LL.avatar(r.author, 40)}<div><div>${esc(r.author.name)}</div><div class="t-caption muted" style="font-weight:400">${esc([r.subject, r.level].filter(Boolean).join(", "))} · ${LL.monthYear(r.created_at)}</div></div></div><span class="stars">${stars(r.rating)}</span></div>
      <p>${esc(r.text)}</p></div>`;
  async function loadReviews(offset, limit) {
    const list = await LL.api.get(`/teachers/${t.id}/reviews?offset=${offset}&limit=${limit}`);
    box.insertAdjacentHTML("beforeend", list.map(reviewHtml).join(""));
    more.hidden = box.children.length >= t.reviews_count;
  }
  if (t.reviews_count) loadReviews(0, 3).catch(LL.fail);
  more.addEventListener("click", () => LL.busy(more, () => loadReviews(box.children.length, 50)).catch(LL.fail));
});
