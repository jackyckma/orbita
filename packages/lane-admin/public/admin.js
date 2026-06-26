const app = document.getElementById("app");

async function api(path, options = {}) {
  const res = await fetch(`/v1/admin${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = body?.error?.message || body?.message || res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return body;
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderLogin() {
  app.innerHTML = `
    <div class="wrap">
      <h1>Orbita Admin</h1>
      <p class="lead">Sign in with your deployment <code>ORBITA_ADMIN_TOKEN</code>.</p>
      <div class="panel">
        <label for="token">Admin token</label>
        <input id="token" type="password" autocomplete="current-password" placeholder="Paste admin token" />
        <div class="row">
          <button id="login-btn">Sign in</button>
        </div>
        <div id="login-error" class="error hidden"></div>
        <p class="hint">Session cookie lasts 12 hours. LLM keys remain in server <code>.env</code>.</p>
      </div>
    </div>`;

  document.getElementById("login-btn").onclick = async () => {
    const token = document.getElementById("token").value.trim();
    const err = document.getElementById("login-error");
    err.classList.add("hidden");
    try {
      await api("/session", {
        method: "POST",
        body: JSON.stringify({ admin_token: token }),
      });
      await renderDashboard();
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove("hidden");
    }
  };
}

async function renderDeviceApprove(userCode) {
  app.innerHTML = `
    <div class="wrap">
      <h1>Approve device</h1>
      <p class="lead">Confirm admin access for code <span class="mono">${esc(userCode)}</span></p>
      <div id="device-panel" class="panel">Checking session…</div>
    </div>`;

  const panel = document.getElementById("device-panel");
  try {
    const session = await api("/session");
    if (!session.authenticated) {
      panel.innerHTML = `
        <p>Sign in first to approve this device.</p>
        <label for="token">Admin token</label>
        <input id="token" type="password" />
        <button id="login-btn">Sign in</button>
        <div id="login-error" class="error hidden"></div>`;
      document.getElementById("login-btn").onclick = async () => {
        const token = document.getElementById("token").value.trim();
        try {
          await fetch("/v1/admin/session", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ admin_token: token }),
          }).then(async (r) => {
            if (!r.ok) throw new Error("Login failed");
          });
          await approveDevice(userCode, panel);
        } catch (e) {
          const err = document.getElementById("login-error");
          err.textContent = e.message;
          err.classList.remove("hidden");
        }
      };
      return;
    }
    await approveDevice(userCode, panel);
  } catch (e) {
    panel.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

async function approveDevice(userCode, panel) {
  const res = await fetch("/v1/auth/device/approve", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_code: userCode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || "Approval failed");
  }
  panel.innerHTML = `<p class="flash">Device approved. You can close this tab.</p>`;
}

async function renderDashboard() {
  const session = await api("/session");
  if (!session.authenticated) {
    renderLogin();
    return;
  }

  app.innerHTML = `
    <div class="wrap">
      <div class="topbar">
        <div>
          <h1>Orbita Admin</h1>
          <p class="lead">Manage API keys, credentials, and HTTP tool policy.</p>
        </div>
        <div class="row">
          <span class="badge">single-user</span>
          <button class="secondary" id="logout-btn">Sign out</button>
        </div>
      </div>
      <div id="flash"></div>

      <div class="panel">
        <h2>Usage</h2>
        <p class="hint">Deployment-wide counts from Postgres (sessions, messages, trajectory, scheduler).</p>
        <div id="usage-summary">Loading…</div>
      </div>

      <div class="panel">
        <h2>Recent sessions</h2>
        <p class="hint">Read-only view across all client IDs. Trajectory replay for debugging.</p>
        <div id="sessions-table">Loading…</div>
        <pre id="session-replay" class="replay hidden"></pre>
      </div>

      <div class="panel">
        <h2>Scheduler jobs</h2>
        <p class="hint">Cron / interval jobs across all clients (read-only).</p>
        <div id="scheduler-table">Loading…</div>
      </div>

      <div class="panel">
        <h2>HTTP allowed domains</h2>
        <p class="hint">Comma-separated hostnames for <code>http_get</code> / <code>http_post</code>. Empty = allow any HTTPS host.</p>
        <label for="domains">Domains</label>
        <textarea id="domains" placeholder="api.firecrawl.dev, api.example.com"></textarea>
        <div class="row">
          <button id="save-domains">Save domains</button>
          <span id="domains-source" class="hint"></span>
        </div>
      </div>

      <div class="panel">
        <h2>LLM providers</h2>
        <div id="llm-status"></div>
      </div>

      <div class="panel">
        <h2>Create API key</h2>
        <label for="client-ids">Allowed client IDs (comma-separated)</label>
        <input id="client-ids" value="default-client" />
        <label for="scopes">Scopes (comma-separated)</label>
        <input id="scopes" value="sessions:create, sessions:use" />
        <button id="create-key">Create key</button>
        <div id="new-key" class="flash hidden"></div>
      </div>

      <div class="panel">
        <h2>API keys</h2>
        <div id="keys-table">Loading…</div>
      </div>

      <div class="panel">
        <h2>Add credential</h2>
        <label for="cred-client">Client ID</label>
        <input id="cred-client" value="default-client" />
        <label for="cred-name">Name (credential_ref)</label>
        <input id="cred-name" placeholder="firecrawl" />
        <label for="cred-secret">Secret</label>
        <input id="cred-secret" type="password" autocomplete="off" />
        <button id="add-cred">Store credential</button>
      </div>

      <div class="panel">
        <h2>Waitlist</h2>
        <p class="hint">Phase 1 hosted API signups from get-orbita.com/waitlist.</p>
        <div id="waitlist-table">Loading…</div>
      </div>

      <div class="panel">
        <h2>Credentials</h2>
        <div id="creds-table">Loading…</div>
      </div>
    </div>`;

  document.getElementById("logout-btn").onclick = async () => {
    await api("/session", { method: "DELETE" });
    renderLogin();
  };

  document.getElementById("save-domains").onclick = async () => {
    const raw = document.getElementById("domains").value;
    const domains = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api("/settings/http-domains", {
        method: "PUT",
        body: JSON.stringify({ domains }),
      });
      flash("HTTP domains updated.");
      await loadSettings();
    } catch (e) {
      flash(e.message, true);
    }
  };

  document.getElementById("create-key").onclick = async () => {
    const allowed_client_ids = document
      .getElementById("client-ids")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const scopes = document
      .getElementById("scopes")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await api("/api-keys", {
        method: "POST",
        body: JSON.stringify({ allowed_client_ids, scopes }),
      });
      const box = document.getElementById("new-key");
      box.classList.remove("hidden");
      box.innerHTML = `<strong>Copy now — shown once:</strong><br><span class="mono">${esc(res.key)}</span>`;
      await loadKeys();
    } catch (e) {
      flash(e.message, true);
    }
  };

  document.getElementById("add-cred").onclick = async () => {
    const client_id = document.getElementById("cred-client").value.trim();
    const name = document.getElementById("cred-name").value.trim();
    const secret = document.getElementById("cred-secret").value;
    try {
      await api("/credentials", {
        method: "POST",
        body: JSON.stringify({ client_id, name, secret, scope: [] }),
      });
      document.getElementById("cred-secret").value = "";
      flash(`Credential "${esc(name)}" stored.`);
      await loadCreds();
    } catch (e) {
      flash(e.message, true);
    }
  };

  await loadUsage();
  await loadSessions();
  await loadScheduler();
  await loadSettings();
  await loadKeys();
  await loadWaitlist();
  await loadCreds();
}

function flash(message, isError = false) {
  const el = document.getElementById("flash");
  if (!el) return;
  el.className = isError ? "error" : "flash";
  el.textContent = message;
}

async function loadUsage() {
  const el = document.getElementById("usage-summary");
  try {
    const { summary } = await api("/usage/summary");
  const p24 = summary.periods.hours_24;
  const p7 = summary.periods.days_7;
  const all = summary.periods.all;
  const fmt = (n) => Number(n).toLocaleString();
  const clientRows = (summary.top_clients || [])
    .map(
      (c) =>
        `<tr><td class="mono">${esc(c.client_id)}</td><td>${fmt(c.session_count)}</td><td>${fmt(c.message_count)}</td></tr>`,
    )
    .join("");
  const providerRows = (summary.providers || [])
    .map((p) => `<tr><td>${esc(p.provider)}</td><td>${fmt(p.turn_count)}</td></tr>`)
    .join("");
  el.innerHTML = `
    <table>
      <thead>
        <tr><th>Window</th><th>Sessions</th><th>Messages</th><th>Turns</th><th>Tool calls</th><th>Token est.</th><th>Failover</th></tr>
      </thead>
      <tbody>
        <tr><td>24h</td><td>${fmt(p24.sessions_created)}</td><td>${fmt(p24.messages)}</td><td>${fmt(p24.assistant_turns)}</td><td>${fmt(p24.tool_calls)}</td><td>${fmt(p24.token_estimate)}</td><td>${fmt(p24.failover_turns)}</td></tr>
        <tr><td>7d</td><td>${fmt(p7.sessions_created)}</td><td>${fmt(p7.messages)}</td><td>${fmt(p7.assistant_turns)}</td><td>${fmt(p7.tool_calls)}</td><td>${fmt(p7.token_estimate)}</td><td>${fmt(p7.failover_turns)}</td></tr>
        <tr><td>All</td><td>${fmt(all.sessions_created)}</td><td>${fmt(all.messages)}</td><td>${fmt(all.assistant_turns)}</td><td>${fmt(all.tool_calls)}</td><td>${fmt(all.token_estimate)}</td><td>${fmt(all.failover_turns)}</td></tr>
      </tbody>
    </table>
    <p class="hint">Scheduler: ${fmt(summary.scheduler.enabled_jobs)} enabled / ${fmt(summary.scheduler.total_jobs)} total jobs · Waitlist: ${fmt(summary.waitlist.pending)} pending, ${fmt(summary.waitlist.approved)} approved</p>
    <h3>Top clients</h3>
    <table>
      <thead><tr><th>Client ID</th><th>Sessions</th><th>Messages</th></tr></thead>
      <tbody>${clientRows || '<tr><td colspan="3">No sessions yet.</td></tr>'}</tbody>
    </table>
    <h3>Providers (turns)</h3>
    <table>
      <thead><tr><th>Provider</th><th>Turns</th></tr></thead>
      <tbody>${providerRows || '<tr><td colspan="2">No turns yet.</td></tr>'}</tbody>
    </table>`;

    const { keys } = await api("/usage/keys");
    const keyRows = keys
      .map((k) => {
        const u = k.usage_24h || {};
        const limit = k.effective_rate_limit_per_minute;
        const rpm = k.requests_this_minute;
        const hot = rpm >= limit * 0.8 ? " style=\"color:var(--danger)\"" : "";
        return `<tr>
        <td class="mono">${esc(k.key_prefix)}…</td>
        <td class="mono">${esc((k.allowed_client_ids || []).join(", "))}</td>
        <td${hot}>${rpm} / ${limit}</td>
        <td>${fmt(u.sessions || 0)}</td>
        <td>${fmt(u.messages || 0)}</td>
        <td>${fmt(u.turns || 0)}</td>
        <td>${k.revoked_at ? "revoked" : "active"}</td>
      </tr>`;
      })
      .join("");
    el.innerHTML += `
    <h3>API key metering (24h, W17 prep)</h3>
    <p class="hint">Usage attributed by allowed client_id(s). RPM = requests this minute vs effective limit.</p>
    <table>
      <thead><tr><th>Key</th><th>Client IDs</th><th>RPM</th><th>Sessions</th><th>Msgs</th><th>Turns</th><th>Status</th></tr></thead>
      <tbody>${keyRows || '<tr><td colspan="7">No API keys.</td></tr>'}</tbody>
    </table>`;
  } catch (e) {
    el.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

async function loadSessions() {
  const tableEl = document.getElementById("sessions-table");
  try {
    const { sessions } = await api("/sessions?limit=40");
  const rows = sessions
    .map(
      (s) => `<tr>
        <td class="mono">${esc(s.id.slice(0, 8))}…</td>
        <td class="mono">${esc(s.client_id)}</td>
        <td>${esc(s.agent_profile_id)}</td>
        <td>${esc(s.status)}</td>
        <td>${s.message_count}</td>
        <td>${esc(s.updated_at)}</td>
        <td><button class="secondary" data-replay="${esc(s.id)}">Replay</button></td>
      </tr>`,
    )
    .join("");
  tableEl.innerHTML = `
    <table>
      <thead><tr><th>Session</th><th>Client</th><th>Profile</th><th>Status</th><th>Msgs</th><th>Updated</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7">No sessions yet.</td></tr>'}</tbody>
    </table>`;
  document.querySelectorAll("[data-replay]").forEach((btn) => {
    btn.onclick = async () => {
      const replayEl = document.getElementById("session-replay");
      replayEl.classList.remove("hidden");
      replayEl.textContent = "Loading trajectory…";
      try {
        const { replay } = await api(`/sessions/${btn.dataset.replay}/trajectory/replay`);
        replayEl.textContent = replay.timeline_text || "No trajectory events.";
      } catch (e) {
        replayEl.textContent = e.message;
      }
    };
  });
  } catch (e) {
    tableEl.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

async function loadScheduler() {
  const el = document.getElementById("scheduler-table");
  try {
    const { jobs } = await api("/scheduler/jobs?limit=40");
    const rows = jobs
      .map(
        (j) => `<tr>
        <td class="mono">${esc(j.id.slice(0, 8))}…</td>
        <td class="mono">${esc(j.client_id)}</td>
        <td>${esc(j.task_kind)}</td>
        <td>${esc(j.schedule)}</td>
        <td>${j.enabled ? "on" : "off"}</td>
        <td>${esc(j.last_run_at || "—")}</td>
        <td>${esc(j.next_run_at || "—")}</td>
      </tr>`,
      )
      .join("");
    el.innerHTML = `
    <table>
      <thead><tr><th>Job</th><th>Client</th><th>Task</th><th>Schedule</th><th>Enabled</th><th>Last run</th><th>Next run</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7">No scheduler jobs.</td></tr>'}</tbody>
    </table>`;
  } catch (e) {
    el.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

async function loadSettings() {
  const s = await api("/settings");
  const domains = s.http_allowed_domains.domains.join(", ");
  document.getElementById("domains").value = domains;
  document.getElementById("domains-source").textContent = `Source: ${s.http_allowed_domains.source}`;
  document.getElementById("llm-status").innerHTML = `
    <p>MiniMax: ${s.llm_keys.configured.minimax ? "configured" : "missing"}</p>
    <p>Anthropic fallback: ${s.llm_keys.configured.anthropic ? "configured" : "missing"}</p>
    <p class="hint">${esc(s.llm_keys.note)}</p>`;
}

async function loadKeys() {
  const { keys } = await api("/api-keys");
  const rows = keys
    .map(
      (k) => `<tr>
        <td class="mono">${esc(k.key_prefix)}…</td>
        <td class="mono">${esc(k.allowed_client_ids.join(", "))}</td>
        <td>${k.revoked_at ? '<span style="color:var(--danger)">revoked</span>' : "active"}</td>
        <td>${k.revoked_at ? "" : `<button class="danger" data-revoke="${esc(k.id)}">Revoke</button>`}</td>
      </tr>`,
    )
    .join("");
  document.getElementById("keys-table").innerHTML = `
    <table>
      <thead><tr><th>Prefix</th><th>Client IDs</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No keys yet.</td></tr>'}</tbody>
    </table>`;
  document.querySelectorAll("[data-revoke]").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Revoke this API key?")) return;
      await api(`/api-keys/${btn.dataset.revoke}`, { method: "DELETE" });
      await loadKeys();
    };
  });
}

async function loadWaitlist() {
  const { entries } = await api("/waitlist?status=pending");
  const rows = entries
    .map(
      (e) => `<tr>
        <td class="mono">${esc(e.email)}</td>
        <td>${esc(e.message || "—")}</td>
        <td>${esc(e.created_at)}</td>
        <td>
          <button data-approve="${esc(e.id)}">Approve</button>
          <button class="secondary" data-reject="${esc(e.id)}">Reject</button>
        </td>
      </tr>`,
    )
    .join("");
  document.getElementById("waitlist-table").innerHTML = `
    <table>
      <thead><tr><th>Email</th><th>Message</th><th>Created</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No pending entries.</td></tr>'}</tbody>
    </table>`;
  document.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const res = await api(`/waitlist/${btn.dataset.approve}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "approved", send_invite: true }),
        });
        let msg = `Approved ${btn.dataset.approve}`;
        if (res.invite_sent) {
          msg += " — invite email sent.";
        } else {
          msg += " — invite email not sent (check ZSend env). Copy API key below.";
        }
        if (res.api_key) {
          msg += ` Key: ${res.api_key}`;
        }
        flash(msg);
        await loadKeys();
        await loadWaitlist();
      } catch (e) {
        flash(e.message, true);
      }
    };
  });
  document.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.onclick = async () => {
      await api(`/waitlist/${btn.dataset.reject}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rejected" }),
      });
      flash(`Rejected ${btn.dataset.reject}`);
      await loadWaitlist();
    };
  });
}

async function loadCreds() {
  const { credentials } = await api("/credentials");
  const rows = credentials
    .map(
      (c) => `<tr>
        <td class="mono">${esc(c.client_id)}</td>
        <td class="mono">${esc(c.name)}</td>
        <td>${esc(c.created_at)}</td>
      </tr>`,
    )
    .join("");
  document.getElementById("creds-table").innerHTML = `
    <table>
      <thead><tr><th>Client</th><th>Name</th><th>Created</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3">No credentials.</td></tr>'}</tbody>
    </table>`;
}

(async () => {
  const params = new URLSearchParams(window.location.search);
  const userCode = params.get("user_code");
  if (userCode && window.location.pathname.includes("/device")) {
    await renderDeviceApprove(userCode);
    return;
  }
  try {
    const session = await api("/session");
    if (session.authenticated) {
      await renderDashboard();
    } else {
      renderLogin();
    }
  } catch {
    renderLogin();
  }
})();
