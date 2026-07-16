/* Claude講座 教材ダッシュボード */
(function () {
  "use strict";

  var COURSE = window.COURSE || { title: "Course", subtitle: "", chapters: [], assignments: [] };
  var PROGRESS_KEY = "claude-course-progress-v1";
  var THEME_KEY = "claude-course-theme";

  // ----- flat lesson list (for prev/next) -----
  var flat = [];
  COURSE.chapters.forEach(function (ch) {
    ch.lessons.forEach(function (ls) {
      flat.push({ type: "lesson", chapter: ch, item: ls, path: ls.path });
    });
  });
  COURSE.assignments.forEach(function (a) {
    flat.push({ type: "assignment", item: a, path: a.path });
  });

  // ----- progress -----
  function loadProgress() {
    try { return new Set(JSON.parse(localStorage.getItem(PROGRESS_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveProgress(set) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
  }
  var progress = loadProgress();

  // ----- elements -----
  var el = {
    nav: document.getElementById("nav"),
    content: document.getElementById("content"),
    topbarTitle: document.getElementById("topbarTitle"),
    progressCount: document.getElementById("progressCount"),
    progressTotal: document.getElementById("progressTotal"),
    progressFill: document.getElementById("progressFill"),
    lessonNav: document.getElementById("lessonNav"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    doneBtn: document.getElementById("doneBtn"),
    searchInput: document.getElementById("searchInput"),
    app: document.getElementById("app"),
    menuBtn: document.getElementById("menuBtn"),
    sidebarClose: document.getElementById("sidebarClose"),
    scrim: document.getElementById("scrim"),
    themeBtn: document.getElementById("themeBtn"),
    instructorBtn: document.getElementById("instructorBtn")
  };

  var totalLessons = flat.length;
  el.progressTotal.textContent = totalLessons;

  // ----- theme -----
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  (function initTheme() {
    var saved;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!saved) saved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(saved);
  })();
  el.themeBtn.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  // ----- instructor mode（講師メモの表示制御）-----
  var INSTR_UNLOCK = "claude-course-instr-unlock";
  var INSTR_SHOW = "claude-course-instr-show";
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function instrUnlocked() { return lsGet(INSTR_UNLOCK) === "1"; }
  function instrShow() { return lsGet(INSTR_SHOW) !== "off"; } // 既定は表示（解錠時）
  function applyInstructor() {
    var on = instrUnlocked() && instrShow();
    document.documentElement.setAttribute("data-instructor", on ? "on" : "off");
    if (el.instructorBtn) {
      el.instructorBtn.hidden = !instrUnlocked();
      el.instructorBtn.classList.toggle("on", on);
      el.instructorBtn.setAttribute("aria-pressed", on ? "true" : "false");
      el.instructorBtn.title = on ? "講師メモ：表示中（クリックで隠す）" : "講師メモ：非表示（クリックで表示）";
    }
  }
  (function initInstructor() {
    var q = location.search || "";
    if (/instructor=off/.test(q)) {
      lsSet(INSTR_UNLOCK, "0");
    } else if (/[?&]instructor(\b|=)/.test(q)) {
      lsSet(INSTR_UNLOCK, "1");
      lsSet(INSTR_SHOW, "on");
    }
    applyInstructor();
  })();
  if (el.instructorBtn) {
    el.instructorBtn.addEventListener("click", function () {
      lsSet(INSTR_SHOW, instrShow() ? "off" : "on");
      applyInstructor();
    });
  }

  // ===================================================================
  //  Minimal Markdown renderer (covers the constructs used in lessons)
  // ===================================================================
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function inline(s) {
    // escape first, then apply inline formatting on escaped text
    s = esc(s);
    // inline code
    s = s.replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; });
    // bold
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // links [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function renderTable(rows) {
    // rows: array of raw "| a | b |" lines (>=2, second is separator)
    function cells(line) {
      var t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
      return t.split("|").map(function (c) { return c.trim(); });
    }
    var head = cells(rows[0]);
    var body = rows.slice(2).map(cells);
    var html = '<div class="doc-table-wrap"><table><thead><tr>';
    head.forEach(function (h) { html += "<th>" + inline(h) + "</th>"; });
    html += "</tr></thead><tbody>";
    body.forEach(function (r) {
      html += "<tr>";
      head.forEach(function (_, i) { html += "<td>" + inline(r[i] || "") + "</td>"; });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }
  function renderMarkdown(md) {
    var lines = md.replace(/\r\n/g, "\n").split("\n");
    var out = [];
    var i = 0;
    var listBuf = null; // {type:'ul'|'ol', items:[]}

    function flushList() {
      if (!listBuf) return;
      var tag = listBuf.type;
      out.push("<" + tag + ">" + listBuf.items.map(function (it) { return "<li>" + inline(it) + "</li>"; }).join("") + "</" + tag + ">");
      listBuf = null;
    }

    while (i < lines.length) {
      var line = lines[i];

      // fenced code block
      var fence = line.match(/^```(.*)$/);
      if (fence) {
        flushList();
        var buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // skip closing fence
        out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>");
        continue;
      }

      // table (line starts with | and next line is a separator)
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].indexOf("-") !== -1) {
        flushList();
        var tbl = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { tbl.push(lines[i]); i++; }
        out.push(renderTable(tbl));
        continue;
      }

      // heading
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushList();
        var level = h[1].length;
        var txt = h[2];
        // strip the leading "#NN " numbering from H1 titles
        if (level === 1) txt = txt.replace(/^#\d+\s*/, "");
        out.push("<h" + level + ">" + inline(txt) + "</h" + level + ">");
        i++;
        continue;
      }

      // horizontal rule
      if (/^\s*---+\s*$/.test(line)) {
        flushList();
        out.push("<hr>");
        i++;
        continue;
      }

      // image placeholder  [画像：...]
      var imgLine = line.trim().match(/^\[画像[:：]\s*(.+?)\]$/);
      if (imgLine) {
        flushList();
        out.push('<div class="img-placeholder">' + inline(imgLine[1]) + "</div>");
        i++;
        continue;
      }

      // ordered list
      var ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ol) {
        if (!listBuf || listBuf.type !== "ol") { flushList(); listBuf = { type: "ol", items: [] }; }
        listBuf.items.push(ol[1]);
        i++;
        continue;
      }
      // unordered list
      var ul = line.match(/^\s*[-*]\s+(.*)$/);
      if (ul) {
        if (!listBuf || listBuf.type !== "ul") { flushList(); listBuf = { type: "ul", items: [] }; }
        listBuf.items.push(ul[1]);
        i++;
        continue;
      }

      // blank line
      if (/^\s*$/.test(line)) {
        flushList();
        i++;
        continue;
      }

      // paragraph (collect consecutive non-empty, non-special lines)
      flushList();
      var para = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i]) &&
             !/^\s*[-*]\s/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i]) &&
             !/^\s*\|/.test(lines[i]) && !/^\s*---+\s*$/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      out.push("<p>" + para.map(inline).join("<br>") + "</p>");
    }
    flushList();
    return out.join("\n");
  }

  // ===================================================================
  //  Sidebar navigation
  // ===================================================================
  function buildNav() {
    var html = "";
    COURSE.chapters.forEach(function (ch) {
      var done = ch.lessons.filter(function (l) { return progress.has(l.path); }).length;
      html += '<div class="chapter" data-ch="' + ch.id + '">';
      html += '<button class="chapter-head" data-toggle="' + ch.id + '">';
      html += '<span class="chapter-num">' + ch.num + "</span>";
      html += '<span class="chapter-title">' + esc(ch.title) + "</span>";
      html += '<span class="chapter-caret">▶</span></button>';
      html += '<div class="chapter-lessons">';
      ch.lessons.forEach(function (ls) {
        html += lessonItemHTML(ls.path, ls.num, ls.title);
      });
      html += "</div></div>";
    });
    if (COURSE.assignments.length) {
      html += '<div class="nav-section-label">スキル証明課題</div>';
      COURSE.assignments.forEach(function (a) {
        html += lessonItemHTML(a.path, "◆", a.level);
      });
    }
    el.nav.innerHTML = html;
  }
  function lessonItemHTML(path, num, title) {
    var isDone = progress.has(path);
    return '<button class="lesson-item' + (isDone ? " done" : "") + '" data-path="' + encodeURIComponent(path) + '">' +
      '<span class="lesson-dot">✓</span>' +
      '<span class="lesson-item-num">' + esc(num) + "</span>" +
      '<span class="lesson-item-title">' + esc(title) + "</span></button>";
  }

  function updateProgressUI() {
    var count = flat.filter(function (f) { return progress.has(f.path); }).length;
    el.progressCount.textContent = count;
    el.progressFill.style.width = (totalLessons ? (count / totalLessons * 100) : 0) + "%";
  }

  function refreshDoneStates() {
    // update sidebar dots without full rebuild
    Array.prototype.forEach.call(el.nav.querySelectorAll(".lesson-item"), function (btn) {
      var p = decodeURIComponent(btn.getAttribute("data-path"));
      btn.classList.toggle("done", progress.has(p));
    });
    updateProgressUI();
  }

  // ===================================================================
  //  Views
  // ===================================================================
  var currentPath = null;

  function findFlatIndex(path) {
    for (var k = 0; k < flat.length; k++) if (flat[k].path === path) return k;
    return -1;
  }

  function renderHome() {
    currentPath = null;
    el.topbarTitle.textContent = "ホーム";
    el.lessonNav.hidden = true;
    setActiveLesson(null);

    var doneCount = flat.filter(function (f) { return progress.has(f.path); }).length;
    var html = "";
    html += '<div class="home-hero">';
    html += "<h1>" + esc(COURSE.title) + (COURSE.subtitle ? "<br>" + esc(COURSE.subtitle) : "") + "</h1>";
    html += "<p>" + esc(COURSE.description || (COURSE.title + " の教材ダッシュボード")) + " 全" + flat.length + "コンテンツ。</p>";
    html += '<div class="hero-meta">';
    html += '<div class="hero-stat"><div class="n">' + COURSE.chapters.length + '</div><div class="l">チャプター</div></div>';
    html += '<div class="hero-stat"><div class="n">' + totalLessons + '</div><div class="l">コンテンツ</div></div>';
    html += '<div class="hero-stat"><div class="n">' + doneCount + '</div><div class="l">完了</div></div>';
    html += "</div>";
    var firstUndone = flat.filter(function (f) { return !progress.has(f.path); })[0] || flat[0];
    if (firstUndone) {
      html += '<button class="home-cta" data-goto="' + encodeURIComponent(firstUndone.path) + '">' +
        (doneCount ? "学習を再開する ›" : "学習を始める ›") + "</button>";
    }
    html += "</div>";

    html += '<div class="home-section-title">チャプター</div><div class="chapter-cards">';
    COURSE.chapters.forEach(function (ch) {
      var d = ch.lessons.filter(function (l) { return progress.has(l.path); }).length;
      html += '<button class="chapter-card" data-open-ch="' + ch.id + '">';
      html += '<span class="chapter-card-num">' + ch.num + "</span>";
      html += '<span class="chapter-card-body"><span class="chapter-card-title">' + esc(ch.title) + "</span>" +
        '<span class="chapter-card-meta">' + ch.lessons.length + " レッスン</span></span>";
      html += '<span class="chapter-card-prog">' + d + "/" + ch.lessons.length + "</span></button>";
    });
    html += "</div>";

    if (COURSE.assignments.length) {
      html += '<div class="home-section-title">スキル証明課題</div><div class="chapter-cards">';
      COURSE.assignments.forEach(function (a) {
        html += '<button class="chapter-card" data-goto="' + encodeURIComponent(a.path) + '">';
        html += '<span class="chapter-card-num">◆</span>';
        html += '<span class="chapter-card-body"><span class="chapter-card-title">' + esc(a.level) + "</span>" +
          '<span class="chapter-card-meta">' + esc(a.title) + "</span></span>";
        html += '<span class="chapter-card-prog">' + (progress.has(a.path) ? "完了" : "") + "</span></button>";
      });
      html += "</div>";
    }

    el.content.innerHTML = html;
    el.content.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function metaForPath(path) {
    var idx = findFlatIndex(path);
    if (idx < 0) return null;
    var f = flat[idx];
    var crumb = f.type === "lesson" ? ("チャプター" + f.chapter.num + "：" + f.chapter.title) : "スキル証明課題";
    var title = f.type === "lesson" ? ("#" + f.item.num + " " + f.item.title) : (f.item.level);
    return { idx: idx, f: f, crumb: crumb, title: title };
  }

  function loadLesson(path) {
    var m = metaForPath(path);
    if (!m) { renderHome(); return; }
    currentPath = path;
    el.topbarTitle.textContent = m.title;
    setActiveLesson(path);
    openChapterForPath(path);
    el.content.innerHTML = '<div class="doc"><p style="color:var(--text-muted)">読み込み中…</p></div>';

    fetch(encodeURI(path))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (md) {
        var body = '<div class="doc-breadcrumb">' + esc(m.crumb) + "</div>";
        body += '<div class="doc">' + renderMarkdown(md) + "</div>";
        el.content.innerHTML = body;
        wrapInstructorSections();
        el.content.scrollTop = 0;
        window.scrollTo(0, 0);
        el.content.focus();
        setupLessonNav(m);
      })
      .catch(function () {
        el.content.innerHTML = '<div class="doc"><h1>読み込みに失敗しました</h1>' +
          "<p>このレッスンファイルを取得できませんでした。ページを再読み込みするか、時間をおいて再度お試しください。</p>" +
          "<p style=\"color:var(--text-muted);font-size:12px\">" + esc(path) + "</p></div>";
        el.lessonNav.hidden = false;
        setupLessonNav(m);
      });
  }

  function setupLessonNav(m) {
    el.lessonNav.hidden = false;
    var prev = m.idx > 0 ? flat[m.idx - 1] : null;
    var next = m.idx < flat.length - 1 ? flat[m.idx + 1] : null;
    el.prevBtn.disabled = !prev;
    el.nextBtn.disabled = !next;
    el.prevBtn.onclick = function () { if (prev) go(prev.path); };
    el.nextBtn.onclick = function () { if (next) go(next.path); };

    var isDone = progress.has(currentPath);
    el.doneBtn.classList.toggle("is-done", isDone);
    el.doneBtn.textContent = isDone ? "✓ 完了済み" : "完了にする";
    el.doneBtn.onclick = function () {
      if (progress.has(currentPath)) progress.delete(currentPath);
      else progress.add(currentPath);
      saveProgress(progress);
      var nowDone = progress.has(currentPath);
      el.doneBtn.classList.toggle("is-done", nowDone);
      el.doneBtn.textContent = nowDone ? "✓ 完了済み" : "完了にする";
      refreshDoneStates();
    };
  }

  // 「## 講師メモ」以降（直前の <hr> があればそれも含む）を instructor-only で包む
  function wrapInstructorSections() {
    var doc = el.content.querySelector(".doc");
    if (!doc) return;
    var heads = doc.querySelectorAll("h2");
    for (var i = 0; i < heads.length; i++) {
      var h = heads[i];
      if (h.textContent.indexOf("講師メモ") === -1) continue;
      var start = h;
      var prev = h.previousElementSibling;
      if (prev && prev.tagName === "HR") start = prev;
      var wrap = document.createElement("div");
      wrap.className = "instructor-only";
      start.parentNode.insertBefore(wrap, start);
      var node = start;
      while (node) { var next = node.nextSibling; wrap.appendChild(node); node = next; }
      break;
    }
  }

  function setActiveLesson(path) {
    Array.prototype.forEach.call(el.nav.querySelectorAll(".lesson-item"), function (btn) {
      var p = decodeURIComponent(btn.getAttribute("data-path"));
      btn.classList.toggle("active", p === path);
    });
  }
  function openChapterForPath(path) {
    var f = flat[findFlatIndex(path)];
    if (!f || f.type !== "lesson") return;
    var chEl = el.nav.querySelector('.chapter[data-ch="' + f.chapter.id + '"]');
    if (chEl) chEl.classList.add("open");
  }

  // ===================================================================
  //  Routing
  // ===================================================================
  function go(path) {
    location.hash = "#/" + encodeURIComponent(path);
  }
  function handleRoute() {
    var h = location.hash.replace(/^#\/?/, "");
    if (!h) { renderHome(); return; }
    var path = decodeURIComponent(h);
    if (findFlatIndex(path) >= 0) loadLesson(path);
    else renderHome();
    closeNav();
  }
  window.addEventListener("hashchange", handleRoute);

  // ===================================================================
  //  Events
  // ===================================================================
  el.nav.addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      var chEl = toggle.closest(".chapter");
      chEl.classList.toggle("open");
      return;
    }
    var item = e.target.closest(".lesson-item");
    if (item) {
      var path = decodeURIComponent(item.getAttribute("data-path"));
      go(path);
    }
  });

  el.content.addEventListener("click", function (e) {
    var goto = e.target.closest("[data-goto]");
    if (goto) { go(decodeURIComponent(goto.getAttribute("data-goto"))); return; }
    var openCh = e.target.closest("[data-open-ch]");
    if (openCh) {
      openNav();
      var id = openCh.getAttribute("data-open-ch");
      var chEl = el.nav.querySelector('.chapter[data-ch="' + id + '"]');
      if (chEl) {
        chEl.classList.add("open");
        chEl.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }
  });

  // brand -> home
  document.querySelector(".brand").addEventListener("click", function () { location.hash = ""; closeNav(); });
  document.querySelector(".brand").style.cursor = "pointer";

  // search
  el.searchInput.addEventListener("input", function () {
    var q = this.value.trim().toLowerCase();
    Array.prototype.forEach.call(el.nav.querySelectorAll(".chapter"), function (chEl) {
      var anyVisible = false;
      Array.prototype.forEach.call(chEl.querySelectorAll(".lesson-item"), function (btn) {
        var txt = btn.textContent.toLowerCase();
        var match = !q || txt.indexOf(q) !== -1;
        btn.style.display = match ? "" : "none";
        if (match) anyVisible = true;
      });
      chEl.style.display = (!q || anyVisible) ? "" : "none";
      if (q && anyVisible) chEl.classList.add("open");
    });
  });

  // mobile nav
  function openNav() { el.app.classList.add("nav-open"); }
  function closeNav() { el.app.classList.remove("nav-open"); }
  el.menuBtn.addEventListener("click", openNav);
  el.sidebarClose.addEventListener("click", closeNav);
  el.scrim.addEventListener("click", closeNav);

  // keyboard prev/next
  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT") return;
    if (!currentPath) return;
    if (e.key === "ArrowLeft" && !el.prevBtn.disabled) el.prevBtn.click();
    if (e.key === "ArrowRight" && !el.nextBtn.disabled) el.nextBtn.click();
  });

  // ----- init -----
  buildNav();
  updateProgressUI();
  handleRoute();
})();
