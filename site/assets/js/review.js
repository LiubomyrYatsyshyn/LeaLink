/* The "Leave a review" dialog (#review) on learner.html and teacher-home.html. */
(function () {
  "use strict";
  let current = null;
  let onDone = null;

  function open(r, done) {
    const dlg = document.getElementById("review");
    current = r;
    onDone = done;
    const other = r.my_role === "learner" ? { name: r.teacher.name, photo_url: r.teacher.photo_url } : r.learner;
    const first = LL.firstName(other.name);
    dlg.querySelector("[data-review-who]").innerHTML = `${LL.avatar(other, 44)}<div><div class="strong" style="font-size:17px">${LL.esc(other.name)}</div>
      <div class="t-caption muted" style="font-weight:400">${LL.esc(r.subject)} · lessons since ${LL.monthYear(r.answered_at)}</div></div>`;
    dlg.querySelector("[data-review-visible]").textContent = r.my_role === "learner"
      ? `Visible on ${first}’s profile.`
      : `Teachers see it when ${first} sends them a request.`;
    const review = r.my_review;
    dlg.querySelector("#review-title").textContent = review ? "Edit your review" : "Leave a review";
    dlg.querySelector("[data-publish-review]").textContent = review ? "Save review" : "Publish review";
    const stars = dlg.querySelectorAll(".star-input button");
    stars[(review ? review.rating : 5) - 1].click();
    const text = dlg.querySelector("#rv-text");
    text.value = review ? review.text : "";
    text.dispatchEvent(new Event("input"));
    LL.fieldError(dlg.querySelector('[data-field="review"]'), null);
    dlg.showModal();
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-publish-review]");
    if (!btn || !current) return;
    const dlg = document.getElementById("review");
    const rating = dlg.querySelectorAll(".star-input button.on").length;
    const text = dlg.querySelector("#rv-text").value.trim();
    if (text.length < 20) {
      LL.fieldError(dlg.querySelector('[data-field="review"]'), "Write at least 20 characters.");
      return;
    }
    const path = `/requests/${current.id}/review`;
    try {
      await LL.busy(btn, () => (current.my_review ? LL.api.patch(path, { rating, text }) : LL.api.post(path, { rating, text })));
      dlg.close();
      LL.toast(current.my_review ? "Review updated." : "Review published. Thank you!");
      if (onDone) onDone();
    } catch (err) {
      LL.fail(err);
    }
  });

  window.LL.review = { open };
})();
