// Add Box: pick a box type, create a physical box (auto 10-digit code), preview
// the QR label, submit a print job, and follow it through its statuses. The box
// exists in Supabase even if printing fails — the UI makes that clear.
import { boxTypes, boxes, printJobs, locations, heartbeats } from "../api.js";
import { qrDataUrl } from "../qr.js";
import { CONFIG } from "../supabase.js";
import { $, el, clear, toast, fmtDate } from "../ui.js";
import { navigate } from "../router.js";

export async function renderAddBox(root) {
  const card = el("div", { class: "card" }, [el("h2", { text: "Add a box" })]);
  root.append(card);
  const body = el("div", { class: "steps" });
  card.append(body);

  const [types, hbRows] = await Promise.all([boxTypes.list(), heartbeats.latest()]);
  if (!types.length) {
    clear(body);
    body.append(
      el("p", { class: "muted", text: "No box types yet. Create one in Setup first." }),
      el("button", { class: "btn", text: "Go to Setup", onClick: () => navigate("setup") })
    );
    return;
  }

  const select = el("select", {}, types.map((t) => el("option", { value: t.id }, t.name)));
  const detail = el("div", { class: "card", style: "background:var(--panel-2)" });

  function showDetail() {
    const t = types.find((x) => x.id === select.value);
    clear(detail);
    detail.append(
      el("div", { class: "grow" }, [
        el("div", { class: "title", text: t.name }),
        el("div", { class: "sub", text: [t.manufacturer, t.capacity].filter(Boolean).join(" · ") }),
        el("div", { class: "sub", text: dimText(t) }),
      ])
    );
  }
  select.addEventListener("change", showDetail);

  body.append(
    el("label", { class: "field" }, ["Box type", select]),
    detail,
    el("div", { class: "row end" }, [
      el("button", { class: "btn", text: "Create box", onClick: () => createBox(select.value, body, hbRows) }),
    ])
  );
  showDetail();
}

function dimText(t) {
  const i = [t.internal_width_mm, t.internal_depth_mm, t.internal_height_mm];
  if (i.every((x) => x == null)) return "";
  return "Internal " + i.map((x) => x ?? "–").join(" × ") + " mm";
}

async function createBox(boxTypeId, body, hbRows) {
  let box;
  try {
    box = await boxes.create(boxTypeId);
  } catch (e) {
    return toast(e.message || "Could not create box.", "bad");
  }
  toast(`Box created: ${box.box_code}`);
  await showBoxLabel(box, body, hbRows);
}

async function showBoxLabel(box, body, hbRows) {
  clear(body);
  const qr = await qrDataUrl(box.box_code, 260);

  const hb = hbRows && hbRows[0];
  const online =
    hb && (Date.now() - new Date(hb.last_seen_at)) / 1000 < CONFIG.HEARTBEAT_ONLINE_SECONDS && hb.status === "online";

  const statusLine = el("div", { class: "row" }, [
    el("span", { class: "muted", text: "Print service:" }),
    el("span", { class: `pill ${online ? "ok" : "bad"}`, text: online ? "online" : "offline" }),
  ]);

  const jobStatus = el("div", { class: "row" });

  body.append(
    el("div", { class: "row between" }, [
      el("h3", { text: `Box ${box.box_code}` }),
      el("span", { class: "pill warn", text: "label not printed yet" }),
    ]),
    el("div", { class: "qr-box" }, [el("img", { src: qr, alt: "QR preview" })]),
    statusLine,
    el("div", { class: "row" }, [
      el("button", { class: "btn", text: "Print label", onClick: () => enqueue(box, jobStatus) }),
      el("button", { class: "btn secondary", text: "View box record", onClick: () => navigate(`browse?box=${box.box_code}`) }),
      el("button", { class: "btn secondary", text: "Add another box", onClick: () => navigate("addbox") }),
    ]),
    jobStatus
  );
}

async function enqueue(box, jobStatus) {
  clear(jobStatus);
  jobStatus.append(el("span", { class: "muted", text: "Submitting print job…" }));
  let job;
  try {
    job = await printJobs.enqueue(box.box_code, box.id, { source: "webapp" });
  } catch (e) {
    clear(jobStatus);
    jobStatus.append(el("span", { class: "pill bad", text: "Failed to queue: " + (e.message || "error") }));
    return;
  }
  followJob(job.id, box, jobStatus);
}

async function followJob(jobId, box, jobStatus) {
  let tries = 0;
  const tick = async () => {
    tries += 1;
    let job;
    try {
      job = await printJobs.get(jobId);
    } catch (e) {
      return;
    }
    clear(jobStatus);
    jobStatus.append(
      el("div", { class: "row" }, [
        el("span", { class: "muted", text: "Print job:" }),
        el("span", { class: `pill ${job.status}`, text: job.status }),
        job.error ? el("span", { class: "muted", text: job.error }) : null,
      ])
    );
    if (job.status === "completed") {
      jobStatus.append(el("div", { class: "row" }, [el("span", { class: "pill ok", text: "Label printed ✓" })]));
      return;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      jobStatus.append(
        el("div", { class: "row" }, [
          el("button", { class: "btn small", text: "Reprint", onClick: () => enqueue(box, jobStatus) }),
        ])
      );
      return;
    }
    if (tries < 40) setTimeout(tick, 1500);
  };
  tick();
}
