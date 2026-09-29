/* wizard.html — the teacher profile (6 steps + preview).
   Logged in: saved to the API as a draft while you type. Guest: kept in this browser until sign-up. */
document.addEventListener("DOMContentLoaded", async () => {
  const { esc, icon } = LL;
  const S = LL.subjects;
  const $ = (s) => document.querySelector(s);
  const root = $("[data-wizard-form]");

  const LANG_LEVELS = [["Native", "Native"], ["C2", "C2 · Proficient"], ["C1", "C1 · Advanced"], ["B2", "B2 · Upper-intermediate"], ["B1", "B1 · Intermediate"], ["A2", "A2 · Elementary"], ["A1", "A1 · Beginner"]];
  const SYMBOL = { USD: "$", EUR: "€", UAH: "₴" };
  const LABELS = {
    display_name: "Display name", photo: "Photo", headline: "Headline", about: "About me (200+ characters)", country: "Country",
    city: "City", timezone: "Time zone", languages: "Languages", subjects: "Subjects", experience_years: "Years of teaching",
    occupation: "Current occupation", format: "Format", offline_location: "Offline location", travel_radius_km: "Travel radius",
    lesson_types: "Lesson type", durations: "Lesson duration", price: "Price per lesson", currency: "Currency",
    availability: "Weekly availability", trial_minutes: "Trial length", contact_method: "Contact method", contact_value: "Contact",
  };
  const STEP = {
    display_name: 1, photo: 1, headline: 1, about: 1, country: 1, city: 1, timezone: 1, languages: 1,
    subjects: 2, experience_years: 3, occupation: 3,
    format: 4, offline_location: 4, travel_radius_km: 4, lesson_types: 4, durations: 4,
    price: 5, currency: 5, availability: 5, trial_minutes: 5, contact_method: 6, contact_value: 6,
  };

  /* ---------- Load: API profile (logged in) or browser draft (guest) ---------- */
  let user = null;
  let profile = null;
  if (LL.auth.loggedIn()) {
    try { user = await LL.auth.me(); } catch (e) { /* treat as guest */ }
  }
  if (user) {
    try {
      profile = await LL.api.get("/teacher/profile");
    } catch (e) {
      if (e.status !== 404) LL.fail(e);
    }
  }
  const guestDraft = LL.draft.get("profile");
  let guestPhoto = !user && guestDraft ? guestDraft.photo : null;
  let photo = user ? user.photo_url : guestPhoto;
  const start = profile || (guestDraft && guestDraft.data) || {};
  if (!start.display_name && user) start.display_name = user.full_name;
  const published = () => profile && profile.status === "approved";

  if (user && profile) {
    const exit = document.querySelector(".header-right a[href='index.html']");
    if (exit) exit.href = "teacher-home.html";
  }
  try {
    await S.load();
  } catch (e) {
    LL.fail(e);
  }

  /* ---------- Subjects: one card per subject with its own fields (catalog from the API) ---------- */
  const offersBox = $("[data-w-offers]");
  const offerNames = () => Array.from(offersBox.querySelectorAll("[data-offer]")).map((c) => c.dataset.offer);
  const OWN = { Native: "native" }; // Basics → Languages level -> the subject's own_level key

  /* A language subject's own level comes from Basics → Languages, so it isn't typed twice. */
  function prefill(subject) {
    const own = subject.by.own_level;
    if (!own) return {};
    const lang = subject.name === "Business English" ? "English" : subject.name;
    const row = collectLanguages().find((l) => l.language.toLowerCase() === lang.toLowerCase());
    const key = row && (OWN[row.level] || row.level);
    return key && own.options.some((o) => o.key === key) ? { own_level: key } : {};
  }

  function addOffer(name, attrs) {
    const subject = S.get(name);
    if (!subject || offerNames().includes(subject.name)) return null;
    if (offerNames().length >= 3) {
      LL.toast("Up to 3 subjects.");
      return null;
    }
    const card = document.createElement("section");
    card.className = "card fields";
    card.dataset.offer = subject.name;
    card.innerHTML = `<div class="subject-card-head"><div><p class="eyebrow">${esc(subject.category)}</p><h2 class="card-title">${esc(subject.name)}</h2></div>
      <button class="icon-btn" type="button" aria-label="Remove ${esc(subject.name)}" data-offer-remove>${icon("trash")}</button></div>
      <div class="fields" data-offer-fields></div>`;
    offersBox.appendChild(card);
    S.render(card.querySelector("[data-offer-fields]"), subject, "teacher", attrs || prefill(subject));
    return card;
  }

  function setOffers(offers) {
    offersBox.innerHTML = "";
    (offers || []).forEach((o) => addOffer(o.subject, o.attrs || {}));
  }

  const readOffers = () => Array.from(offersBox.querySelectorAll("[data-offer]")).map((card) => ({
    subject: card.dataset.offer,
    attrs: S.read(card.querySelector("[data-offer-fields]")),
  }));

  /* Drafts saved before fields per subject had one list of subjects, levels and age groups. */
  function legacyOffers(d) {
    return (d.subjects || []).map((name) => ({ subject: name, attrs: { level: d.levels || [], age: d.age_groups || [] } }));
  }

  const picker = S.picker($("[data-w-picker]"), {
    multiple: true,
    placeholder: "Add a subject, e.g. English, Math or Guitar",
    taken: offerNames,
    onPick: (name) => {
      const card = addOffer(name);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  });

  /* ---------- Rows (languages, education, links, questions) ---------- */
  const trash = (label) => `<button class="icon-btn" type="button" aria-label="${label}" data-remove-row>${icon("trash")}</button>`;
  const ROWS = {
    language: {
      box: "[data-w-languages]", max: 10,
      html: (l = {}) => `<div class="input-row" data-lang-row><input class="input" list="ll-languages" placeholder="Language" maxlength="40" style="flex:1" value="${esc(l.language || "")}">
        <select class="input" aria-label="Level" style="width:220px;max-width:45%">${LANG_LEVELS.map(([v, t]) => `<option value="${v}"${l.level === v ? " selected" : ""}>${t}</option>`).join("")}</select>${trash("Remove language")}</div>`,
    },
    education: {
      box: "[data-w-education]", max: 5,
      html: (e = {}) => `<div class="input-row" data-edu-row><input class="input" aria-label="University" placeholder="University or school" maxlength="100" style="flex:1" value="${esc(e.institution || "")}">
        <input class="input" aria-label="Degree and year" placeholder="Degree and year" maxlength="100" style="flex:1" value="${esc(e.degree || "")}">${trash("Remove education")}</div>`,
    },
    link: {
      box: "[data-w-links]", max: 5,
      html: (v = "") => `<div class="input-row" data-link-row><div class="input-icon" style="flex:1">${icon("link")}<input class="input" aria-label="Link" placeholder="linkedin.com/in/your-name" maxlength="200" value="${esc(v)}"></div>${trash("Remove link")}</div>`,
    },
    question: {
      box: "[data-w-questions]", max: 3,
      html: (q = "") => `<div class="input-row" data-q-row><div class="input-group" style="flex:1"><input aria-label="Question" placeholder="e.g. Have you taken lessons before?" maxlength="200" value="${esc(q)}">${trash("Delete question")}</div></div>`,
    },
  };
  function setRows(kind, values, keepOne) {
    const list = values && values.length ? values : keepOne ? [undefined] : [];
    $(ROWS[kind].box).innerHTML = list.map((v) => ROWS[kind].html(v)).join("");
  }
  function addRow(kind) {
    const box = $(ROWS[kind].box);
    if (box.children.length >= ROWS[kind].max) return LL.toast(`Up to ${ROWS[kind].max}.`);
    box.insertAdjacentHTML("beforeend", ROWS[kind].html());
    box.lastElementChild.querySelector("input").focus();
    refresh();
  }

  /* ---------- Fill the form ---------- */
  function setSeg(id, value) {
    const btn = $(`#${id} button[data-v="${value}"]`);
    if (btn && !btn.classList.contains("is-active")) btn.click();
  }
  function setValue(sel, v) {
    const el = $(sel);
    el.value = v == null ? "" : String(v);
    el.dispatchEvent(new Event("input"));
  }

  function fill(d) {
    setValue("#w-name", d.display_name);
    setValue("#w-headline", d.headline);
    setValue("#w-about", d.about);
    setValue("#w-country", d.country);
    setValue("#w-city", d.city);
    LL.fillTimezones($("#w-tz"), d.timezone);
    setRows("language", d.languages, true);
    setValue("#w-video", d.video_url);
    setOffers(d.offers || legacyOffers(d));
    root.querySelectorAll("[data-w-chips]").forEach((box) => {
      const values = (d[box.dataset.wChips] || []).map(String);
      box.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-selected", values.includes(c.dataset.v)));
    });
    setValue("#w-years", d.experience_years);
    setValue("#w-occ", d.occupation);
    setValue("#w-practical", d.practical_experience);
    setRows("education", d.education, false);
    setRows("link", d.links, true);
    setSeg("w-format", d.format || "online");
    setValue("#w-loc", d.offline_location);
    if (d.travel_radius_km) setValue("#w-radius", d.travel_radius_km);
    setValue("#w-group", d.max_group_size);
    setValue("#w-price", d.price);
    setValue("#w-cur", d.currency || "USD");
    $("#w-trial").checked = !!d.free_trial;
    if (d.trial_minutes) setValue("#w-trial-min", d.trial_minutes);
    root.querySelectorAll("[data-cell]").forEach((c) => c.classList.toggle("on", (d.availability || []).includes(c.dataset.slot)));
    $("#w-accepting").checked = d.accepting_students !== false;
    setValue("#w-gprice", d.group_price);
    setValue("#w-min", d.min_commitment || "");
    setValue("#w-pack", d.package_size || "");
    setValue("#w-disc", d.package_discount);
    setValue("#w-contact-method", d.contact_method || "telegram");
    setValue("#w-contact", d.contact_value);
    setRows("question", d.questions, false);
    setSeg("w-response", String(d.response_time_hours || 24));
    renderPhoto();
    renderCerts();
    refresh();
  }

  /* ---------- Read the form ---------- */
  const val = (sel) => $(sel).value.trim();
  const int = (sel, min, max) => {
    const n = parseInt(val(sel), 10);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const money = (sel) => {
    const n = Math.round(parseFloat(val(sel).replace(",", ".")) * 100) / 100;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const chipsOf = (key) => Array.from(root.querySelectorAll(`[data-w-chips="${key}"] .chip.is-selected`)).map((c) => c.dataset.v);
  const rowsOf = (sel, read) => Array.from(root.querySelectorAll(sel)).map(read).filter(Boolean);
  const collectLanguages = () => rowsOf("[data-lang-row]", (r) => {
    const language = r.querySelector("input").value.trim();
    return language ? { language, level: r.querySelector("select").value } : null;
  });

  function collect() {
    const format = $("#w-format .is-active").dataset.v;
    const offline = format !== "online";
    const trial = $("#w-trial").checked;
    const types = chipsOf("lesson_types");
    const pack = int("#w-pack", 2, 100);
    const offers = readOffers();
    return {
      display_name: val("#w-name") || null,
      headline: val("#w-headline") || null,
      about: val("#w-about") || null,
      country: val("#w-country") || null,
      city: val("#w-city") || null,
      timezone: $("#w-tz").value,
      languages: collectLanguages(),
      video_url: val("#w-video") || null,
      offers,
      subjects: offers.map((o) => o.subject), // for the preview; the API takes `offers`
      experience_years: int("#w-years", 0, 70),
      occupation: val("#w-occ") || null,
      practical_experience: val("#w-practical") || null,
      education: rowsOf("[data-edu-row]", (r) => {
        const [a, b] = r.querySelectorAll("input");
        return a.value.trim() ? { institution: a.value.trim(), degree: b.value.trim() } : null;
      }),
      links: rowsOf("[data-link-row] input", (i) => i.value.trim() || null),
      format,
      offline_location: offline ? val("#w-loc") || null : null,
      travel_radius_km: offline ? Number($("#w-radius").value) : null,
      lesson_types: types,
      durations: chipsOf("durations").map(Number),
      platforms: chipsOf("platforms"),
      max_group_size: types.includes("group") ? int("#w-group", 2, 50) : null,
      price: money("#w-price"),
      currency: $("#w-cur").value,
      free_trial: trial,
      trial_minutes: trial ? Number($("#w-trial-min").value) : null,
      availability: Array.from(root.querySelectorAll("[data-cell].on")).map((c) => c.dataset.slot),
      accepting_students: $("#w-accepting").checked,
      group_price: types.includes("group") ? money("#w-gprice") : null,
      min_commitment: int("#w-min", 1, 100),
      package_size: pack,
      package_discount: pack ? int("#w-disc", 1, 90) : null,
      contact_method: $("#w-contact-method").value,
      contact_value: val("#w-contact") || null,
      questions: rowsOf("[data-q-row] input", (i) => i.value.trim() || null).slice(0, 3),
      response_time_hours: Number($("#w-response .is-active").dataset.v),
    };
  }

  /* Same rules as the API (views.missing_fields). */
  function missingFields(d) {
    const empty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
    const missing = Object.keys(STEP).filter((k) => !["photo", "offline_location", "travel_radius_km", "trial_minutes"].includes(k) && empty(d[k]));
    if (!photo) missing.push("photo");
    if (d.about && d.about.length < 200 && !missing.includes("about")) missing.push("about");
    if (d.format !== "online") ["offline_location", "travel_radius_km"].forEach((k) => empty(d[k]) && missing.push(k));
    if (d.free_trial && !d.trial_minutes) missing.push("trial_minutes");
    d.offers.forEach((o) => {
      const subject = S.get(o.subject);
      if (subject) S.teacherMissing(subject, o.attrs).forEach((m) => missing.push(`${o.subject}: ${m}`));
    });
    return missing.sort((a, b) => stepOf(a) - stepOf(b));
  }

  /* "English: Student levels" (a subject's field) belongs to step 2. */
  const stepOf = (name) => (name.includes(": ") ? 2 : STEP[name.split(" ")[0]] || 1);

  /* ---------- Small live updates ---------- */
  function refresh() {
    const count = offerNames().length;
    $("[data-w-subject-count]").textContent = `${count} / 3`;
    picker.setDisabled(count >= 3, count >= 3 ? "You’ve chosen 3 subjects" : "Add a subject, e.g. English, Math or Guitar");
    $("[data-w-question-count]").textContent = `${root.querySelectorAll("[data-q-row]").length} / 3`;
    document.querySelectorAll("[data-w-symbol]").forEach((el) => (el.textContent = SYMBOL[$("#w-cur").value]));
    $("#w-trial-min").disabled = !$("#w-trial").checked;
    $("[data-w-tz-note]").textContent = `Shown in your time zone: ${$("#w-tz").value.replace(/_/g, " ")}.`;
  }

  function renderPhoto() {
    $("[data-w-avatar]").innerHTML = LL.avatar({ name: val("#w-name") || (user && user.full_name), photo_url: photo }, 72);
    $("[data-w-photo-label]").textContent = photo ? "Replace photo" : "Upload photo";
    $("[data-w-photo-remove]").hidden = !photo;
  }

  function status(text) {
    const el = document.querySelector("[data-draft-status]");
    if (el) el.textContent = text;
  }

  function showNotice() {
    const box = $("[data-w-status]");
    const notes = {
      approved: "Your profile is published. Changes are checked again before they go live — press “Submit for review” on the Preview step when you’re done.",
      pending: "Your profile is under review. You can still edit it — changes are saved automatically.",
      rejected: `Moderator’s note: ${profile && profile.review_note}. Fix it and submit your profile again.`,
    };
    const text = profile && notes[profile.status];
    box.hidden = !text;
    box.innerHTML = text ? icon("shield") + esc(text) : "";
    status(!user ? "Draft is kept in this browser" : published() ? "Published" : profile ? "Saved as draft" : "Not saved yet");
    $("[data-w-submit]").textContent = published() ? "Submit changes for review" : "Submit for review";
    $("[data-w-submit-note]").innerHTML = icon("shield") + (user
      ? "We review every profile before it goes live. We’ll email you when it’s published."
      : "We review every profile before it goes live. Next, you’ll create an account to submit it.");
  }

  /* ---------- Saving ---------- */
  async function save() {
    const d = collect();
    if (!user) {
      LL.draft.set("profile", { data: d, photo: guestPhoto });
      status("Draft is kept in this browser");
      return;
    }
    if (published()) return; // a published profile is sent back to review only on submit
    profile = await LL.api.put("/teacher/profile", d);
    showNotice();
    status(`Saved as draft · ${LL.time(new Date().toISOString())}`);
  }
  const saveLater = LL.debounce(() => save().catch(LL.fail), 1500);
  let ready = false; // no autosave while the form is being filled in on load
  const autosave = () => ready && saveLater();

  root.addEventListener("input", () => { refresh(); autosave(); });
  root.addEventListener("change", () => { refresh(); autosave(); });
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-tag-input]")) setTimeout(() => { refresh(); autosave(); }); });
  root.addEventListener("click", (e) => {
    const remove = e.target.closest("[data-offer-remove]");
    if (remove) remove.closest("[data-offer]").remove();
    if (e.target.closest(".chip, [data-cell], .seg button, .x, [data-remove-row], [data-offer-remove]")) setTimeout(() => { refresh(); autosave(); });
    const add = e.target.closest("[data-w-add]");
    if (add) addRow(add.dataset.wAdd);
  });
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (!go || !ready) return;
    save().catch(LL.fail);
    if (go.dataset.go === "7") renderPreview();
  });

  /* ---------- Photo ---------- */
  function resize(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 512 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("This file isn’t an image."));
      img.src = URL.createObjectURL(file);
    });
  }

  $("[data-w-photo]").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (user) {
        const body = new FormData();
        body.append("file", file);
        user = await LL.api.post("/auth/me/photo", body);
        LL.auth.setUser(user);
        photo = user.photo_url;
      } else {
        guestPhoto = photo = await resize(file);
        await save();
      }
      renderPhoto();
      LL.toast("Photo updated.");
    } catch (err) {
      LL.fail(err);
    }
  });

  $("[data-w-photo-remove]").addEventListener("click", async () => {
    try {
      if (user) {
        user = await LL.api.del("/auth/me/photo");
        LL.auth.setUser(user);
      } else {
        guestPhoto = null;
        await save();
      }
      photo = null;
      renderPhoto();
    } catch (err) {
      LL.fail(err);
    }
  });

  /* ---------- Certificates (after sign-up) ---------- */
  function renderCerts() {
    const certs = profile ? profile.certificates : [];
    $("[data-w-certs]").innerHTML = certs.map((c) => `<div class="file-row">${icon("file", 18).replace("<svg", '<svg style="color:var(--text-2)"')}
      <div class="grow"><strong>${esc(c.title)}</strong><span>${c.content_type === "application/pdf" ? "PDF" : "Image"} · ${c.size < 104858 ? Math.max(1, Math.round(c.size / 1024)) + " KB" : (c.size / 1048576).toFixed(1) + " MB"} · Uploaded</span></div>
      <button class="icon-btn" type="button" aria-label="Open file" data-cert-open="${c.id}">${icon("eye")}</button>
      <button class="icon-btn" type="button" aria-label="Delete file" data-cert-delete="${c.id}">${icon("trash")}</button></div>`).join("");
    const input = $("[data-w-cert]");
    input.disabled = !user;
    $("[data-w-cert-upload]").style.opacity = user ? "" : ".6";
    $("[data-w-cert-note]").textContent = user
      ? "PDF, JPG or PNG, up to 10 MB. Verified certificates earn a Verified badge."
      : "You can upload certificates after creating your account.";
  }

  $("[data-w-cert]").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (!profile) await save();
      const body = new FormData();
      body.append("file", file);
      body.append("title", file.name.replace(/\.[^.]+$/, "").slice(0, 120));
      await LL.api.post("/teacher/certificates", body);
      profile = await LL.api.get("/teacher/profile");
      renderCerts();
      LL.toast("Certificate uploaded.");
    } catch (err) {
      LL.fail(err);
    }
  });

  document.addEventListener("click", async (e) => {
    const open = e.target.closest("[data-cert-open]");
    const del = e.target.closest("[data-cert-delete]");
    try {
      if (open) {
        const res = await fetch(`/api/teacher/certificates/${open.dataset.certOpen}/file`, {
          headers: { Authorization: "Bearer " + LL.store.get("ll-token") },
        });
        if (!res.ok) throw new Error("Couldn’t open the file.");
        window.open(URL.createObjectURL(await res.blob()), "_blank");
      } else if (del) {
        await LL.api.del(`/teacher/certificates/${del.dataset.certDelete}`);
        profile = await LL.api.get("/teacher/profile");
        renderCerts();
      }
    } catch (err) {
      LL.fail(err);
    }
  });

  /* ---------- Preview and submit ---------- */
  function renderPreview() {
    const d = collect();
    $("[data-w-preview]").innerHTML = LL.teacherCard({
      id: profile ? profile.id : 0, display_name: d.display_name || "Your name", photo_url: photo,
      headline: d.headline || "Your headline", subjects: d.subjects, topics: S.tags(d.offers),
      is_verified: profile ? profile.is_verified : false, free_trial: d.free_trial, rating: null, reviews_count: 0,
      experience_years: d.experience_years, format: d.format, price: d.price, currency: d.currency,
      response_hours: d.response_time_hours, match: null,
    }, { preview: true });
    const join = (list) => list.filter(Boolean).join(" · ") || "Not filled in yet";
    const slots = d.availability.length;
    const sums = {
      1: join([d.display_name, [d.city, d.country].filter(Boolean).join(", "), d.languages.map((l) => l.language).join(", ")]),
      2: join(d.offers.map((o) => {
        const levels = S.labels(S.get(o.subject), "level", o.attrs.level, "teacher");
        return levels.length ? `${o.subject} (${levels.length > 2 ? levels[0] + " – " + levels[levels.length - 1] : levels.join(", ")})` : o.subject;
      })),
      3: join([d.experience_years != null ? `${d.experience_years} years` : "", profile && profile.certificates.length ? `${profile.certificates.length} certificate(s)` : "", d.links.length ? `${d.links.length} link(s)` : ""]),
      4: join([LL.labels.format[d.format], d.lesson_types.map((t) => LL.labels.lessonType[t]).join(", "), d.durations.length ? d.durations.join("/") + " min" : ""]),
      5: join([d.price ? `${LL.money(d.price, d.currency)} / lesson` : "", d.free_trial ? `Free ${d.trial_minutes}-min trial` : "", slots ? `${slots} slots / week` : ""]),
      6: join([LL.labels.contact[d.contact_method], `${d.questions.length} questions`, `Replies within ${d.response_time_hours}h`]),
    };
    Object.entries(sums).forEach(([n, text]) => ($(`[data-w-sum="${n}"]`).textContent = text));
  }

  function goStep(n) {
    const btn = document.querySelector(`.step[data-go="${n}"]`);
    if (btn) btn.click();
  }

  $("[data-w-submit]").addEventListener("click", async (e) => {
    const d = collect();
    const missing = missingFields(d);
    if (missing.length) {
      LL.toast(`Fill in first: ${missing.map((m) => LABELS[m] || m).join(", ")}.`);
      goStep(stepOf(missing[0]));
      return;
    }
    if (!user) {
      LL.draft.set("profile", { data: d, photo: guestPhoto });
      location.href = "signup-teacher.html";
      return;
    }
    try {
      await LL.busy(e.currentTarget, async () => {
        profile = await LL.api.put("/teacher/profile", d);
        if (profile.status === "draft" || profile.status === "rejected") await LL.api.post("/teacher/profile/submit");
      });
      LL.draft.set("profile", null);
      location.href = "under-review.html";
    } catch (err) {
      const list = err.detail && err.detail.missing;
      LL.toast(list ? `Fill in first: ${list.join(", ")}.` : err.message);
      if (list) goStep(stepOf(list[0]));
    }
  });

  /* ---------- Start ---------- */
  fill(start);
  showNotice();
  if (user && !profile && guestDraft) {
    // A draft made before logging in: save it to the account (with its photo).
    try {
      if (guestDraft.photo && !user.photo_url) {
        const body = new FormData();
        body.append("file", await (await fetch(guestDraft.photo)).blob(), "photo.jpg");
        user = await LL.api.post("/auth/me/photo", body);
        LL.auth.setUser(user);
        photo = user.photo_url;
        renderPhoto();
      }
      await save();
      LL.draft.set("profile", null);
    } catch (err) {
      LL.fail(err);
    }
  }
  if (LL.params.get("step") === "preview") renderPreview();
  ready = true;
});
