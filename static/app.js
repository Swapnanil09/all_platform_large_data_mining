/* QueryDeck — client logic */
(function () {
  "use strict";

  // ── tiny helpers ───────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escapeAttr = escapeHtml;
  const debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  async function api(path, opts) {
    const res = await fetch(path, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = data && data.detail ? data.detail
        : (typeof data === "string" && data ? data : res.statusText);
      throw new Error(msg);
    }
    return data;
  }

  // ── element refs ───────────────────────────────────────────
  const el = {
    connSelect: $("connSelect"), engineBadge: $("engineBadge"), liveDot: $("liveDot"),
    manageBtn: $("manageBtn"),
    schemaTree: $("schemaTree"), schemaSearch: $("schemaSearch"), refreshSchema: $("refreshSchema"),
    runBtn: $("runBtn"), pageSize: $("pageSize"),
    countBtn: $("countBtn"), csvBtn: $("csvBtn"), xlsxBtn: $("xlsxBtn"),
    resultStatus: $("resultStatus"), resultScroll: $("resultScroll"),
    pager: $("pager"), prevPage: $("prevPage"), nextPage: $("nextPage"), pageLabel: $("pageLabel"),
    connModal: $("connModal"), closeModal: $("closeModal"), connList: $("connList"),
    connForm: $("connForm"), engineSeg: $("engineSeg"),
    f_name: $("f_name"), f_host: $("f_host"), f_port: $("f_port"), f_user: $("f_user"),
    f_password: $("f_password"), f_database: $("f_database"), dbHint: $("dbHint"),
    f_secure: $("f_secure"), f_skip: $("f_skip"), secureLabel: $("secureLabel"),
    testBtn: $("testBtn"), saveBtn: $("saveBtn"), formMsg: $("formMsg"),
    exportForm: $("exportForm"), dlframe: $("dlframe"), toasts: $("toasts"),
  };

  const state = { connections: [], activeConn: null, engine: "mysql", hints: {}, page: 0 };
  let editor = null;
  let formEngine = "mysql";

  // ── editor ─────────────────────────────────────────────────
  function initEditor() {
    editor = CodeMirror.fromTextArea($("sql"), {
      mode: "text/x-sql",
      lineNumbers: true,
      lineWrapping: true,
      matchBrackets: true,
      autofocus: true,
      styleActiveLine: true,
      hintOptions: { tables: state.hints, completeSingle: false },
      extraKeys: {
        "Cmd-Enter": () => runQuery(0),
        "Ctrl-Enter": () => runQuery(0),
        "Ctrl-Space": "autocomplete",
      },
    });
    editor.on("inputRead", (cm, ch) => {
      if (!ch.text || !ch.text[0]) return;
      if (/[a-zA-Z0-9_.]/.test(ch.text[0])) {
        cm.showHint({ hint: CodeMirror.hint.sql, tables: state.hints, completeSingle: false });
      }
    });
    editor.on("change", debounce(() => {
      try { localStorage.setItem("qd:sql", editor.getValue()); } catch {}
    }, 400));
  }

  function insertText(txt) { editor.replaceSelection(txt); editor.focus(); }

  // ── connection selection ───────────────────────────────────
  function engineLabel(c) {
    if (c.provider) return c.provider;
    return c.engine === "clickhouse" ? "ClickHouse" : "MySQL";
  }
  function setLive(s) { el.liveDot.dataset.state = s; }

  function populateSelect() {
    // 1. Populate the hidden native select for compatibility
    el.connSelect.innerHTML = "";
    
    // 2. Populate the custom dropdown
    const optionsContainer = $("connPickerOptions");
    if (optionsContainer) {
      optionsContainer.innerHTML = "";
    }
    
    state.connections.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name + (c.provider ? ` · ${c.provider}` : "");
      el.connSelect.appendChild(o);
      
      if (optionsContainer) {
        const item = document.createElement("div");
        item.className = "conn-option-item";
        item.dataset.value = c.id;
        if (c.id === state.activeConn) {
          item.classList.add("is-active");
        }
        
        const engineIcon = c.engine === "clickhouse" 
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="conn-item-icon color-ch"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="conn-item-icon color-mysql"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
          
        item.innerHTML = `
          <div class="conn-item-main">
            ${engineIcon}
            <div class="conn-item-info">
              <span class="conn-item-title">${escapeHtml(c.name)}</span>
              <span class="conn-item-subtitle">${escapeHtml(c.user || 'no-user')}@${escapeHtml(c.host)}</span>
            </div>
          </div>
          <span class="conn-item-badge">${escapeHtml(c.provider || (c.engine === 'clickhouse' ? 'ClickHouse' : 'MySQL'))}</span>
        `;
        
        item.addEventListener("click", () => {
          selectConnection(c.id);
          optionsContainer.classList.remove("is-open");
          $("connPickerBtn").setAttribute("aria-expanded", "false");
        });
        
        optionsContainer.appendChild(item);
      }
    });
  }

  async function selectConnection(id, remember) {
    state.activeConn = id;
    const c = state.connections.find((x) => x.id === id);
    state.engine = c ? c.engine : "mysql";
    
    // Update trigger UI
    const triggerText = $("connPickerName");
    if (c) {
      if (triggerText) triggerText.textContent = c.name;
      el.engineBadge.textContent = engineLabel(c);
      el.engineBadge.className = "engine-badge " + (c.engine === "clickhouse" ? "engine-ch" : "engine-mysql");
    } else {
      if (triggerText) triggerText.textContent = "Select database...";
      el.engineBadge.textContent = "";
    }
    
    // Update active class in custom option list
    const optionsContainer = $("connPickerOptions");
    if (optionsContainer) {
      Array.from(optionsContainer.children).forEach((item) => {
        if (item.dataset.value === id) {
          item.classList.add("is-active");
        } else {
          item.classList.remove("is-active");
        }
      });
    }

    el.connSelect.value = id;
    if (remember !== false) { try { localStorage.setItem("qd:lastConn", id); } catch {} }
    await loadSchema();
  }

  async function loadSchema() {
    setLive("busy");
    el.schemaTree.innerHTML = `<div class="tree-empty">Loading schema…</div>`;
    try {
      const data = await api("/api/schema?conn=" + encodeURIComponent(state.activeConn));
      state.hints = data.hints || {};
      editor.setOption("hintOptions", { tables: state.hints, completeSingle: false });
      renderTree(data.tables);
      setLive("live");
    } catch (e) {
      state.hints = {};
      editor.setOption("hintOptions", { tables: {}, completeSingle: false });
      el.schemaTree.innerHTML =
        `<div class="tree-empty">Couldn't load schema.<br><span style="color:#8a94a3">${escapeHtml(e.message)}</span></div>`;
      setLive("error");
    }
  }

  function renderTree(tables) {
    if (!tables || !tables.length) {
      el.schemaTree.innerHTML = `<div class="tree-empty">No tables found in this database.</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    tables.forEach((t) => {
      const wrap = document.createElement("div");
      wrap.className = "tbl";
      wrap.dataset.name = t.name.toLowerCase();

      const head = document.createElement("div");
      head.className = "tbl-head";
      head.innerHTML =
        `<span class="chev">▶</span>` +
        `<span class="tbl-name">${escapeHtml(t.name)}</span>` +
        `<span class="tbl-count">${t.columns.length}</span>` +
        `<button class="tbl-insert" title="Insert table name">↳</button>`;

      const cols = document.createElement("div");
      cols.className = "cols";
      t.columns.forEach((c) => {
        const col = document.createElement("div");
        col.className = "col";
        col.dataset.name = c.toLowerCase();
        col.textContent = c;
        col.addEventListener("click", () => {
          let insertVal = c;
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c)) {
            insertVal = `\`${c}\``;
          }
          insertText(insertVal);
        });
        cols.appendChild(col);
      });

      head.addEventListener("click", (e) => {
        if (e.target.classList.contains("tbl-insert")) {
          e.stopPropagation();
          let insertVal = t.name;
          const conn = state.connections.find((x) => x.id === state.activeConn);
          if (conn && !conn.database && t.name.includes(".")) {
            const idx = t.name.indexOf(".");
            const dbPart = t.name.substring(0, idx);
            const tblPart = t.name.substring(idx + 1);
            insertVal = `\`${dbPart}\`.\`${tblPart}\``;
          } else {
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t.name)) {
              insertVal = `\`${t.name}\``;
            }
          }
          insertText(insertVal);
          return;
        }
        wrap.classList.toggle("open");
      });

      wrap.appendChild(head);
      wrap.appendChild(cols);
      frag.appendChild(wrap);
    });
    el.schemaTree.innerHTML = "";
    el.schemaTree.appendChild(frag);
  }

  function filterTree() {
    const q = el.schemaSearch.value.trim().toLowerCase();
    document.querySelectorAll(".tree .tbl").forEach((tbl) => {
      const nameMatch = tbl.dataset.name.includes(q);
      let anyCol = false;
      tbl.querySelectorAll(".col").forEach((col) => {
        const m = !q || col.dataset.name.includes(q);
        col.style.display = q ? (col.dataset.name.includes(q) || nameMatch ? "" : "none") : "";
        if (q && col.dataset.name.includes(q)) anyCol = true;
      });
      tbl.style.display = !q || nameMatch || anyCol ? "" : "none";
      if (q && anyCol && !nameMatch) tbl.classList.add("open");
    });
  }

  // ── query + render ─────────────────────────────────────────
  function pageSize() { return parseInt(el.pageSize.value, 10) || 200; }
  function setBusy(b) {
    el.runBtn.disabled = b;
    setLive(b ? "busy" : (state.activeConn ? "live" : "idle"));
  }

  function setStatus(chips, text, cls) {
    el.resultStatus.className = "result-status" + (cls ? " is-" + cls : "");
    let html = "";
    (chips || []).forEach((c) => { html += `<span class="stat-chip"><b>${c.v}</b> ${c.k}</span>`; });
    if (text) html += `<span class="status-text">${escapeHtml(text)}</span>`;
    el.resultStatus.innerHTML = html || `<span class="status-text">Ready.</span>`;
  }

  async function runQuery(page) {
    const sql = editor.getValue().trim();
    if (!sql) { toast("Write a query to run.", "info"); return; }
    if (!state.activeConn) { toast("Select a connection first.", "info"); return; }
    setBusy(true);
    setStatus([], "Running…", "");
    try {
      const data = await api("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conn: state.activeConn, sql, page: page || 0, page_size: pageSize() }),
      });
      state.page = data.page || 0;
      renderResult(data);
    } catch (e) {
      renderError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function renderResult(data) {
    if (data.columns && data.columns.length) {
      buildGrid(data.columns, data.rows, data.page || 0);
      const chips = [
        { v: (data.rows.length).toLocaleString(), k: data.has_next || data.page ? "rows on page" : "rows" },
        { v: (data.elapsed_ms).toLocaleString(), k: "ms" },
      ];
      setStatus(chips, data.note || "", "ok");
      updatePager(data);
    } else {
      showMessage(data.message || "Statement executed.", "ok");
      setStatus([{ v: (data.affected_rows != null ? data.affected_rows : 0).toLocaleString(), k: "rows affected" },
                 { v: (data.elapsed_ms).toLocaleString(), k: "ms" }],
                "", "ok");
      hidePager();
    }
  }

  function renderError(msg) {
    showMessage(msg, "err");
    setStatus([], msg, "error");
    hidePager();
  }

  function buildGrid(cols, rows, page) {
    const base = (page || 0) * pageSize();
    let thead = `<thead><tr><th class="rownum">#</th>`;
    cols.forEach((c, i) => { thead += `<th><span class="th-idx">${i + 1}</span>${escapeHtml(c)}</th>`; });
    thead += `</tr></thead>`;

    let body = "<tbody>";
    for (let ri = 0; ri < rows.length; ri++) {
      body += `<tr><td class="rownum">${base + ri + 1}</td>`;
      const r = rows[ri];
      for (let ci = 0; ci < r.length; ci++) body += cellHtml(r[ci]);
      body += "</tr>";
    }
    body += "</tbody>";

    const t = document.createElement("table");
    t.className = "grid";
    t.innerHTML = thead + body;
    el.resultScroll.innerHTML = "";
    el.resultScroll.appendChild(t);
    el.resultScroll.scrollTop = 0;
    el.resultScroll.scrollLeft = 0;
  }

  function cellHtml(v) {
    if (v === null || v === undefined) return `<td><span class="null">NULL</span></td>`;
    const s = String(v);
    const isNum = /^-?\d+(\.\d+)?$/.test(s) && s.length <= 18;
    const title = s.length > 60 ? ` title="${escapeAttr(s)}"` : "";
    return `<td class="${isNum ? "num" : ""}"${title}>${escapeHtml(s)}</td>`;
  }

  function showMessage(text, kind) {
    el.resultScroll.innerHTML =
      `<div class="msg-panel ${kind}">` +
      `<div class="msg-title">${kind === "err" ? "Query failed" : "Done"}</div>` +
      `<div class="msg-body">${escapeHtml(text)}</div></div>`;
  }

  function updatePager(data) {
    if (!(data.page > 0 || data.has_next)) { hidePager(); return; }
    el.pager.hidden = false;
    el.pageLabel.textContent = `Page ${(data.page || 0) + 1}` + (data.has_next ? "" : " · end");
    el.prevPage.disabled = (data.page || 0) <= 0;
    el.nextPage.disabled = !data.has_next;
  }
  function hidePager() { el.pager.hidden = true; }

  // ── count ──────────────────────────────────────────────────
  async function countRows() {
    const sql = editor.getValue().trim();
    if (!sql) { toast("Write a query first.", "info"); return; }
    if (!state.activeConn) { toast("Select a connection first.", "info"); return; }
    const prev = el.countBtn.textContent;
    el.countBtn.disabled = true; el.countBtn.textContent = "Counting…";
    try {
      const wrapped = `SELECT COUNT(*) AS total FROM (\n${sql.replace(/;+\s*$/, "")}\n) AS _qd_count`;
      const data = await api("/api/query", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conn: state.activeConn, sql: wrapped, page: 0, page_size: 1 }),
      });
      const total = data.rows && data.rows[0] ? data.rows[0][0] : null;
      const n = Number(total);
      const disp = isNaN(n) ? String(total) : n.toLocaleString();
      toast(`${disp} rows total`, "ok");
      const chip = document.createElement("span");
      chip.className = "stat-chip";
      chip.innerHTML = `<b>${disp}</b> rows total`;
      el.resultStatus.appendChild(chip);
    } catch (e) {
      toast("Count failed: " + e.message, "err");
    } finally {
      el.countBtn.disabled = false; el.countBtn.textContent = prev;
    }
  }

  // ── export (streamed via hidden iframe) ────────────────────
  function doExport(fmt) {
    const sql = editor.getValue().trim();
    if (!sql) { toast("Write a query to export.", "info"); return; }
    if (!state.activeConn) { toast("Select a connection first.", "info"); return; }
    el.exportForm.conn.value = state.activeConn;
    el.exportForm.sql.value = sql;
    el.exportForm.fmt.value = fmt;
    toast(`Preparing ${fmt.toUpperCase()} download…`, "info");
    el.exportForm.submit();
  }
  el.dlframe.addEventListener("load", () => {
    try {
      const doc = el.dlframe.contentDocument;
      const body = doc && doc.body ? (doc.body.innerText || "").trim() : "";
      if (body && body.indexOf('"detail"') !== -1) {
        let msg = body;
        try { msg = JSON.parse(body).detail || body; } catch {}
        toast(msg, "err");
      }
    } catch {}
  });

  // ── toasts ─────────────────────────────────────────────────
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast " + (kind || "info");
    t.innerHTML = `<span class="t-dot"></span><span>${escapeHtml(msg)}</span>`;
    el.toasts.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .3s, transform .3s";
      t.style.opacity = "0"; t.style.transform = "translateY(4px)";
      setTimeout(() => t.remove(), 300);
    }, kind === "err" ? 5200 : 2800);
  }

  // ── connections manager ────────────────────────────────────
  function openModal() { renderConnList(); resetForm(); el.connModal.hidden = false; }
  function closeModal() { el.connModal.hidden = true; }

  function renderConnList() {
    el.connList.innerHTML = "";
    state.connections.forEach((c) => {
      const item = document.createElement("div");
      item.className = "conn-item";
      const sub = `${c.host}${c.port ? ":" + c.port : ""}${c.database ? " / " + c.database : ""}`;
      item.innerHTML =
        `<span class="ci-dot ${c.engine}"></span>` +
        `<div class="ci-main"><div class="ci-name">${escapeHtml(c.name)}</div>` +
        `<div class="ci-sub">${escapeHtml(sub)}</div></div>` +
        (c.builtin
          ? `<span class="ci-tag">preset</span>`
          : `<button class="ci-del" title="Delete" data-id="${c.id}">✕</button>`);
      el.connList.appendChild(item);
    });
  }

  function setFormEngine(engine) {
    formEngine = engine;
    document.querySelectorAll("#engineSeg .seg-btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.engine === engine));
    if (engine === "clickhouse") {
      el.f_port.placeholder = el.f_secure.checked ? "8443" : "8123";
      el.dbHint.textContent = "(default: default)";
      el.secureLabel.textContent = "Use HTTPS";
    } else {
      el.f_port.placeholder = "3306";
      el.dbHint.textContent = "(optional)";
      el.secureLabel.textContent = "Use TLS";
    }
  }

  function resetForm() {
    el.connForm.reset();
    el.f_secure.checked = true; el.f_skip.checked = false;
    el.formMsg.hidden = true; el.formMsg.className = "form-msg";
    setFormEngine("mysql");
  }

  function gatherForm() {
    const portRaw = el.f_port.value.trim();
    return {
      name: el.f_name.value.trim(),
      engine: formEngine,
      host: el.f_host.value.trim(),
      port: portRaw ? Number(portRaw) : null,
      user: el.f_user.value.trim(),
      password: el.f_password.value,
      database: el.f_database.value.trim(),
      secure: el.f_secure.checked,
      skip_verify: el.f_skip.checked,
    };
  }

  function showFormMsg(text, kind) {
    el.formMsg.hidden = false;
    el.formMsg.className = "form-msg " + kind;
    el.formMsg.textContent = text;
  }

  async function testConnection() {
    const cfg = gatherForm();
    if (!cfg.host) { showFormMsg("Host is required.", "err"); return; }
    el.testBtn.disabled = true;
    showFormMsg("Connecting…", "busy");
    try {
      const r = await api("/api/connections/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (r.ok) showFormMsg("✓ " + (r.detail || r.message || "Connected"), "ok");
      else showFormMsg("✕ " + (r.message || "Connection failed"), "err");
    } catch (e) {
      showFormMsg("✕ " + e.message, "err");
    } finally {
      el.testBtn.disabled = false;
    }
  }

  async function addConnection(e) {
    e.preventDefault();
    const cfg = gatherForm();
    if (!cfg.host) { showFormMsg("Host is required.", "err"); return; }
    el.saveBtn.disabled = true;
    try {
      const created = await api("/api/connections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      state.connections = await api("/api/connections");
      populateSelect();
      renderConnList();
      toast(`Added “${created.name}”`, "ok");
      closeModal();
      await selectConnection(created.id, true);
    } catch (e2) {
      showFormMsg("✕ " + e2.message, "err");
    } finally {
      el.saveBtn.disabled = false;
    }
  }

  async function deleteConnection(id) {
    const c = state.connections.find((x) => x.id === id);
    if (!c) return;
    if (!confirm(`Delete connection “${c.name}”?`)) return;
    try {
      await api("/api/connections/" + encodeURIComponent(id), { method: "DELETE" });
      const wasActive = state.activeConn === id;
      state.connections = await api("/api/connections");
      populateSelect();
      renderConnList();
      toast(`Deleted “${c.name}”`, "ok");
      if (wasActive && state.connections[0]) await selectConnection(state.connections[0].id, true);
    } catch (e) {
      toast("Delete failed: " + e.message, "err");
    }
  }

  function wireEvents() {
    el.connSelect.addEventListener("change", () => selectConnection(el.connSelect.value));
    
    // Custom dropdown toggler
    const triggerBtn = $("connPickerBtn");
    const optionsList = $("connPickerOptions");
    if (triggerBtn && optionsList) {
      triggerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = optionsList.classList.contains("is-open");
        triggerBtn.setAttribute("aria-expanded", !isOpen);
        if (isOpen) {
          optionsList.classList.remove("is-open");
        } else {
          optionsList.classList.add("is-open");
        }
      });
      document.addEventListener("click", (e) => {
        if (!triggerBtn.contains(e.target) && !optionsList.contains(e.target)) {
          triggerBtn.setAttribute("aria-expanded", "false");
          optionsList.classList.remove("is-open");
        }
      });
    }

    el.refreshSchema.addEventListener("click", () => { if (state.activeConn) loadSchema(); });
    el.schemaSearch.addEventListener("input", filterTree);

    el.runBtn.addEventListener("click", () => runQuery(0));
    el.prevPage.addEventListener("click", () => runQuery(Math.max(0, state.page - 1)));
    el.nextPage.addEventListener("click", () => runQuery(state.page + 1));
    el.countBtn.addEventListener("click", countRows);
    el.csvBtn.addEventListener("click", () => doExport("csv"));
    el.xlsxBtn.addEventListener("click", () => doExport("xlsx"));

    el.manageBtn.addEventListener("click", openModal);
    el.closeModal.addEventListener("click", closeModal);
    el.connModal.addEventListener("mousedown", (e) => { if (e.target === el.connModal) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.connModal.hidden) closeModal(); });

    el.engineSeg.addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (b) setFormEngine(b.dataset.engine);
    });
    el.f_secure.addEventListener("change", () => {
      if (formEngine === "clickhouse") el.f_port.placeholder = el.f_secure.checked ? "8443" : "8123";
    });
    el.testBtn.addEventListener("click", testConnection);
    el.connForm.addEventListener("submit", addConnection);
    el.connList.addEventListener("click", (e) => {
      const del = e.target.closest(".ci-del");
      if (del) deleteConnection(del.dataset.id);
    });
  }

  function initResizableAndZoomable() {
    const resizer = $("resizer");
    const editorPane = document.querySelector(".editor-pane");
    const mainPane = document.querySelector(".main");

    // 1. Pane Resizing
    if (resizer && editorPane && mainPane) {
      let savedHeight;
      try { savedHeight = localStorage.getItem("qd:editorHeight"); } catch {}
      if (savedHeight) {
        editorPane.style.height = savedHeight + "px";
      }

      let isDragging = false;

      resizer.addEventListener("mousedown", (e) => {
        isDragging = true;
        resizer.classList.add("is-dragging");
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
      });

      document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const mainRect = mainPane.getBoundingClientRect();
        let newHeight = e.clientY - mainRect.top;
        
        const minHeight = 120;
        const maxHeight = mainRect.height - 120;
        if (newHeight < minHeight) newHeight = minHeight;
        if (newHeight > maxHeight) newHeight = maxHeight;

        editorPane.style.height = newHeight + "px";
        if (editor) editor.refresh();
      });

      document.addEventListener("mouseup", () => {
        if (isDragging) {
          isDragging = false;
          resizer.classList.remove("is-dragging");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          const currentHeight = parseInt(editorPane.style.height, 10);
          if (currentHeight) {
            try { localStorage.setItem("qd:editorHeight", currentHeight); } catch {}
          }
        }
      });
    }

    // 2. Font Zooming (using Ctrl + Wheel)
    const resultsPane = document.querySelector(".results-pane");
    if (resultsPane) {
      let resultsZoom = 1.0;
      try {
        const savedResultsZoom = localStorage.getItem("qd:resultsZoom");
        if (savedResultsZoom) resultsZoom = parseFloat(savedResultsZoom);
      } catch {}
      resultsPane.style.setProperty("--results-zoom", resultsZoom);

      resultsPane.addEventListener("wheel", (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.deltaY < 0) {
            resultsZoom = Math.min(2.5, resultsZoom + 0.1);
          } else {
            resultsZoom = Math.max(0.6, resultsZoom - 0.1);
          }
          resultsPane.style.setProperty("--results-zoom", resultsZoom);
          try { localStorage.setItem("qd:resultsZoom", resultsZoom); } catch {}
        }
      }, { passive: false });
    }

    if (editorPane) {
      let editorZoom = 1.0;
      try {
        const savedEditorZoom = localStorage.getItem("qd:editorZoom");
        if (savedEditorZoom) editorZoom = parseFloat(savedEditorZoom);
      } catch {}
      editorPane.style.setProperty("--editor-zoom", editorZoom);

      const cmEl = editorPane.querySelector(".CodeMirror");
      if (cmEl) {
        cmEl.addEventListener("wheel", (e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
              editorZoom = Math.min(2.5, editorZoom + 0.1);
            } else {
              editorZoom = Math.max(0.6, editorZoom - 0.1);
            }
            editorPane.style.setProperty("--editor-zoom", editorZoom);
            try { localStorage.setItem("qd:editorZoom", editorZoom); } catch {}
            if (editor) editor.refresh();
          }
        }, { passive: false });
      }
    }
  }

  // ── boot ───────────────────────────────────────────────────
  async function init() {
    initEditor();
    wireEvents();
    initResizableAndZoomable();
    try {
      state.connections = await api("/api/connections");
    } catch (e) {
      toast("Couldn't load connections: " + e.message, "err");
      state.connections = [];
    }
    populateSelect();
    let last = null;
    try { last = localStorage.getItem("qd:lastConn"); } catch {}
    const pick = (last && state.connections.some((c) => c.id === last))
      ? last : (state.connections[0] && state.connections[0].id);
    if (pick) await selectConnection(pick, false);
    try {
      const saved = localStorage.getItem("qd:sql");
      if (saved) editor.setValue(saved);
    } catch {}
  }

  init();
})();
