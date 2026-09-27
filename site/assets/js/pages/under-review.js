/* under-review.html — where the teacher profile is in moderation. */
document.addEventListener("DOMContentLoaded", async () => {
  const $ = (s) => document.querySelector(s);
  const user = await LL.auth.require();
  let p;
  try {
    p = await LL.api.get("/teacher/profile");
  } catch (e) {
    if (e.status === 404) return location.replace("wizard.html");
    $("[data-lead]").textContent = e.message;
    return;
  }
  if (p.status === "draft") return location.replace("wizard.html?step=preview");

  const first = LL.firstName(user.full_name);
  const submitted = p.submitted_at ? (LL.isToday(p.submitted_at) ? `Today, ${LL.time(p.submitted_at)}` : LL.dateTime(p.submitted_at)) : "";
  $("[data-submitted]").textContent = submitted;

  const done = (dot) => {
    dot.className = "tl-dot done";
    dot.innerHTML = LL.icon("check", 14);
  };
  if (p.status === "pending") {
    $("[data-lead]").textContent = `Thanks, ${first}! We check every profile before learners can see it. We’ll email you at ${user.email} as soon as it’s published.`;
  } else if (p.status === "approved") {
    $("[data-badge]").className = "badge badge-active badge-wide";
    $("[data-badge]").textContent = "Published";
    $("[data-heading]").textContent = "Your profile is published";
    $("[data-lead]").textContent = `Congratulations, ${first}! Learners can now find you in search and send you requests.`;
    done($("[data-review-dot]"));
    $("[data-review-title]").textContent = "Reviewed";
    $("[data-review-text]").textContent = "Your profile passed moderation";
    done($("[data-publish-dot]"));
    $("[data-publish-text]").textContent = p.published_at ? `Since ${LL.date(p.published_at)}` : "";
    $("[data-foot]").textContent = "Changes to a published profile are checked again before they go live.";
  } else if (p.status === "rejected") {
    $("[data-badge]").className = "badge badge-declined badge-wide";
    $("[data-badge]").textContent = "Changes needed";
    $("[data-heading]").textContent = "Your profile needs a few changes";
    $("[data-lead]").textContent = `Moderator’s note: ${p.review_note || "please update your profile."}`;
    $("[data-review-title]").textContent = "Reviewed — changes needed";
    $("[data-review-text]").textContent = "Edit your profile and submit it again";
    $("[data-foot]").textContent = "After you fix it, press “Submit for review” in the profile editor.";
  }
});
