(() => {
  const rootPrefix = (document.body.dataset.root || ".").replace(/\/+$/, "");
  const THEME_STORAGE_KEY = "cadence-docs-theme";

  const THEME_ICONS = {
    system: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    dark: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>`,
    light: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  };

  const getSavedTheme = () => {
    try {
      const val = localStorage.getItem(THEME_STORAGE_KEY);
      if (val === "dark" || val === "light" || val === "system") return val;
    } catch {
      // Ignore storage blocks
    }
    return "system";
  };

  const applyTheme = (mode) => {
    if (mode === "dark" || mode === "light") {
      document.documentElement.dataset.theme = mode;
    } else {
      delete document.documentElement.dataset.theme;
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Ignore storage blocks
    }
    for (const btn of document.querySelectorAll("[data-theme-toggle]")) {
      const label = mode === "system" ? "Auto" : mode === "dark" ? "Dark" : "Light";
      btn.setAttribute("aria-label", `Theme: ${label} (click to switch)`);
      btn.setAttribute("title", `Theme: ${label} (System / Dark / Light)`);
      btn.innerHTML = `${THEME_ICONS[mode]}<span class="theme-label">${label}</span>`;
    }
  };

  applyTheme(getSavedTheme());

  for (const btn of document.querySelectorAll("[data-theme-toggle]")) {
    btn.addEventListener("click", () => {
      const cur = getSavedTheme();
      const next = cur === "system" ? "dark" : cur === "dark" ? "light" : "system";
      applyTheme(next);
    });
  }

  // Full-content search index across all docs pages & major sections
  const STATIC_INDEX = [
    {
      section: "Guides / Getting Started",
      title: "What is Cadence & Prerequisites",
      path: "docs/guides/getting-started/#overview",
      content: "Single process TypeScript Bun Hono React 19 Lavalink v4 SQLite no MongoDB Docker Compose Developer Portal token Client ID Client Secret.",
    },
    {
      section: "Guides / Getting Started",
      title: "Quick Launch & Web Onboarding Wizard",
      path: "docs/guides/getting-started/#quick-launch",
      content: "git clone docker compose up -d localhost 8000 8686 4-step Web Onboarding Wizard validate Discord Bot Token intents OAuth2 Redirect URI.",
    },
    {
      section: "Guides / Installation",
      title: "Pre-Built GHCR Docker Compose Stack",
      path: "docs/guides/installation/#docker-compose",
      content: "ghcr.io/towermom9/cadence ghcr.io/towermom9/cadence-lavalink yt-cipher spotify-tokener _JAVA_OPTIONS DATA_DIR Portainer Dokploy Coolify.",
    },
    {
      section: "Guides / Installation",
      title: "Local Development & Reverse Proxy HTTPS",
      path: "docs/guides/installation/#local-dev",
      content: "bun install bun run dev bun run dev:web Vite HMR reverse proxy WebSocket /ws upgrade HTTPS DASHBOARD_URL.",
    },
    {
      section: "Guides / Discord Setup",
      title: "Privileged Gateway Intents & OAuth2 Redirects",
      path: "docs/guides/discord-setup/#developer-portal",
      content: "Discord Developer Portal Server Members Intent Message Content Intent OAuth2 callback /api/auth/callback invite link.",
    },
    {
      section: "Guides / Playback & Empty VC",
      title: "Timeline Queue & Non-Interrupting Drag-and-Drop",
      path: "docs/guides/playback/#timeline-queue",
      content: "previous current manual queue autoplay timeline drag and drop reorder without interrupting playback.",
    },
    {
      section: "Guides / Playback & Empty VC",
      title: "Auto Server Switch on VC Join & Queue Loop",
      path: "docs/guides/playback/#vc-auto-switch",
      content: "Automatically switches Play on Server dashboard when joining a voice channel Queue Loop skips Autoplay 7 Autoplay moods All Familiar Discover Popular Deep Cuts Chill Upbeat.",
    },
    {
      section: "Guides / Playback & Empty VC",
      title: "Empty VC Auto-Pause, Auto-Resume & Disconnect",
      path: "docs/guides/playback/#empty-vc",
      content: "Pause when voice channel is empty continue playing delay 0s 5m auto-disconnect 24/7 mode ignore deafened listeners auto-resume.",
    },
    {
      section: "Guides / RBAC & Domains",
      title: "4-Tier Permission Matrix (User, DJ, Admin, Owner)",
      path: "docs/guides/rbac/#permission-matrix",
      content: "Tier 1 User Basic Access Roles Tier 2 DJ Role alone in VC Tier 3 Admin Manage Server Server Settings Tier 4 Server Owner Bot Owner System Settings.",
    },
    {
      section: "Guides / RBAC & Domains",
      title: "Change Public Domain & Stuck-Track Timeout Under System Settings",
      path: "docs/guides/rbac/#domain-settings",
      content: "Settings System Public Domain Dashboard URL Use Current URL Save Domain OAuth2 Redirect URI Stuck-Track Recovery Timeout 5s 60s.",
    },
    {
      section: "Guides / Accessibility",
      title: "Accessibility Settings, Custom Colors & Touch Queue Drag",
      path: "docs/guides/accessibility/#a11y-controls",
      content: "Material 3 WCAG 2.2 High Contrast Reduce Motion Text Size Scale Focus Rings 44px Touch Targets Screen Reader Track Announcements Skip Link Custom Colors hex contrast Typeable Sliders touch drag queue mobile.",
    },
    {
      section: "Guides / Internationalization & Localization",
      title: "Internationalization, Localization, BCP 47 & Languages",
      path: "docs/guides/localization/#standards",
      content: "Internationalization Localization BCP 47 RFC 5646 browser language detection ICU placeholders LOCALIZATION.md English Spanish Japanese Indonesian German French.",
    },
    {
      section: "Reference / Commands",
      title: "Discord Slash Commands & Prefix Aliases",
      path: "docs/reference/commands/#slash-commands",
      content: "/play /playnext /playnow /search /connect /pause /resume /skip /skipto /back /replay /seek /forward /rewind /stop /volume /loop /shuffle /move /swap /remove /clear /history /grab /autoplay /filter /speed /pitch /cleareffect /queue /nowplaying /lyrics /playlist /settings maxhistory /dashboard /help /ping.",
    },
    {
      section: "Reference / Commands",
      title: "Playlist & Settings Subcommands & Hotkeys",
      path: "docs/reference/commands/#playlist-commands",
      content: "playlist list view create add savequeue remove rename play delete settings view volume 247 autoplay dj duplicates prefix emptyvc playnext maxhistory reset keyboard shortcuts Space Left Right = - m s r + g h.",
    },
    {
      section: "Reference / Troubleshooting",
      title: "Bot Won't Join VC, No Audio, or Greyed Controls",
      path: "docs/reference/troubleshooting/#no-audio",
      content: "Connect Speak permissions Lavalink online /api/system/logs Debug Report.",
    },
    {
      section: "Reference / Troubleshooting",
      title: "YouTube Blocked / AllClientsFailed / OAuth2 & Proxy Issues",
      path: "docs/reference/troubleshooting/#youtube-errors",
      content: "YouTube requires login AllClientsFailed YT_OAUTH_ENABLED YT_OAUTH_REFRESH_TOKEN yt-cipher reverse proxy /ws WebSocket upgrade redirect_uri mismatch.",
    },
    {
      section: "Reference / Troubleshooting",
      title: "Permissions, SQLite Backups & Docker Bind Mounts",
      path: "docs/reference/troubleshooting/#backups",
      content: "Server Members Intent Message Content Intent data cadence.sqlite backup volume permissions.",
    },
    {
      section: "Reference / Changelog",
      title: "Release Changelogs (v0.0.0 to v0.2.0)",
      path: "docs/reference/changelog/#v0-2-0",
      content: "v0.2.0 v0.1.9 v0.1.8 v0.1.7 v0.1.6 v0.1.5 v0.1.4 v0.1.2 v0.1.1 v0.0.19 v0.0.18 v0.0.17 v0.0.16 v0.0.15 v0.0.0 initial release changelog accessibility localization internationalization custom colors mobile queue drag.",
    },
  ];

  // Dynamically index headings and paragraph text on the current page
  const content = document.querySelector(".docs-content");
  const livePageEntries = [];
  if (content) {
    const pageTitle = document.querySelector("h1")?.textContent?.trim() || document.title;
    const headings = [...content.querySelectorAll("h2[id], h3[id]")];
    headings.forEach((h) => {
      const parts = [];
      let sib = h.nextElementSibling;
      while (sib && !/^H[123]$/.test(sib.tagName)) {
        const txt = sib.textContent?.replace(/\s+/g, " ").trim();
        if (txt) parts.push(txt);
        sib = sib.nextElementSibling;
      }
      livePageEntries.push({
        section: `Current Page / ${pageTitle}`,
        title: h.textContent?.trim() || "",
        path: `#${h.id}`,
        content: parts.join(" "),
        isLocalHash: true,
      });
    });
  }

  // Mobile sidebar drawer + backdrop
  const sidebar = document.querySelector(".docs-sidebar");
  const menuBtn = document.querySelector("[data-menu-toggle]");
  let sidebarBackdrop = document.querySelector(".sidebar-backdrop");
  if (sidebar && !sidebarBackdrop) {
    sidebarBackdrop = document.createElement("div");
    sidebarBackdrop.className = "sidebar-backdrop";
    document.body.appendChild(sidebarBackdrop);
  }

  const closeSidebar = () => {
    sidebar?.classList.remove("open");
    sidebarBackdrop?.classList.remove("open");
  };

  if (sidebar && menuBtn) {
    menuBtn.addEventListener("click", () => {
      const next = !sidebar.classList.contains("open");
      sidebar.classList.toggle("open", next);
      sidebarBackdrop?.classList.toggle("open", next);
    });
    sidebarBackdrop?.addEventListener("click", closeSidebar);
    for (const link of sidebar.querySelectorAll("a")) {
      link.addEventListener("click", closeSidebar);
    }
  }

  // Build "On this page" TOC & scrollspy
  const tocList = document.querySelector(".toc-list");
  if (tocList && content) {
    const headings = [...content.querySelectorAll("h2[id], h3[id]")];
    const links = headings.map((h) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#${h.id}`;
      a.textContent = h.textContent;
      if (h.tagName === "H3") {
        a.style.paddingLeft = "24px";
      }
      li.appendChild(a);
      tocList.appendChild(li);
      return { id: h.id, el: h, link: a };
    });

    if (links.length > 0) {
      const updateActiveToc = () => {
        const scrollY = window.scrollY + 110;
        let active = links[0];
        for (const item of links) {
          if (item.el.offsetTop <= scrollY) {
            active = item;
          }
        }
        for (const item of links) {
          item.link.classList.toggle("active", item === active);
        }
      };
      window.addEventListener("scroll", updateActiveToc, { passive: true });
      updateActiveToc();
    }
  }

  // Copy buttons for code blocks
  for (const wrap of document.querySelectorAll(".code-wrap")) {
    const codeEl = wrap.querySelector("pre code");
    if (!codeEl) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(codeEl.textContent || "");
        btn.textContent = "Copied";
        setTimeout(() => {
          btn.textContent = "Copy";
        }, 1600);
      } catch {
        btn.textContent = "Error";
      }
    });
    wrap.appendChild(btn);
  }

  // Search Modal (Ctrl+K / Cmd+K)
  const backdrop = document.createElement("div");
  backdrop.className = "search-backdrop";
  backdrop.innerHTML = `
    <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search documentation">
      <div class="search-input-row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);flex-shrink:0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" placeholder="Search guides, commands, FAQ, and changelogs..." aria-label="Search documentation" />
      </div>
      <div class="search-results"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const searchInput = backdrop.querySelector("input");
  const resultsEl = backdrop.querySelector(".search-results");
  let selectedIdx = 0;

  const escapeHtml = (str) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const buildSnippet = (entry, terms) => {
    const text = entry.content || "";
    if (!terms.length) return escapeHtml(text.slice(0, 145) + (text.length > 145 ? "..." : ""));
    const lower = text.toLowerCase();
    let firstPos = -1;
    for (const t of terms) {
      const idx = lower.indexOf(t);
      if (idx !== -1 && (firstPos === -1 || idx < firstPos)) {
        firstPos = idx;
      }
    }
    const start = Math.max(0, firstPos - 45);
    const slice = text.slice(start, start + 150);
    let safe = escapeHtml((start > 0 ? "..." : "") + slice + (start + 150 < text.length ? "..." : ""));
    for (const t of terms) {
      if (t.length < 2) continue;
      const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      safe = safe.replace(re, "<mark>$1</mark>");
    }
    return safe;
  };

  const combinedEntries = () => {
    const seen = new Set();
    const merged = [];
    for (const item of [...livePageEntries, ...STATIC_INDEX]) {
      const key = `${item.title.toLowerCase()}|${item.section.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
    return merged;
  };

  const renderSearch = (query) => {
    const raw = (query || "").trim().toLowerCase();
    const terms = raw ? raw.split(/\s+/).filter(Boolean) : [];
    const pool = combinedEntries();

    const scored = [];
    for (const entry of pool) {
      const haystack = `${entry.section} ${entry.title} ${entry.content}`.toLowerCase();
      if (terms.length === 0) {
        if (!entry.isLocalHash) scored.push({ entry, score: 1 });
        continue;
      }
      if (!terms.every((t) => haystack.includes(t))) continue;
      let score = 0;
      const titleL = entry.title.toLowerCase();
      for (const t of terms) {
        if (titleL.includes(t)) score += 6;
        if (entry.section.toLowerCase().includes(t)) score += 2;
        if (entry.content.toLowerCase().includes(t)) score += 1;
      }
      if (entry.isLocalHash) score += 1;
      scored.push({ entry, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const matches = scored.slice(0, 14).map((s) => s.entry);
    selectedIdx = 0;

    if (matches.length === 0) {
      resultsEl.innerHTML = `<div style="padding:18px;text-align:center;color:var(--text-dim);font-size:0.88rem">No matching documentation content found.</div>`;
      return;
    }

    resultsEl.innerHTML = matches
      .map((item, i) => {
        const href = item.isLocalHash ? item.path : `${rootPrefix}/${item.path}`;
        return `
          <a class="search-item${i === 0 ? " selected" : ""}" href="${href}">
            <div class="search-item-head">
              <span class="search-item-section">${escapeHtml(item.section)}</span>
              <span class="search-item-title">${escapeHtml(item.title)}</span>
            </div>
            <div class="search-item-desc">${buildSnippet(item, terms)}</div>
          </a>
        `;
      })
      .join("");

    for (const link of resultsEl.querySelectorAll(".search-item")) {
      link.addEventListener("click", () => closeSearch());
    }
  };

  const openSearch = () => {
    backdrop.classList.add("open");
    renderSearch("");
    setTimeout(() => searchInput.focus(), 20);
  };

  const closeSearch = () => {
    backdrop.classList.remove("open");
    searchInput.value = "";
  };

  for (const trigger of document.querySelectorAll("[data-open-search]")) {
    trigger.addEventListener("click", openSearch);
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeSearch();
  });

  searchInput.addEventListener("input", (e) => renderSearch(e.target.value));

  searchInput.addEventListener("keydown", (e) => {
    const items = [...resultsEl.querySelectorAll(".search-item")];
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % items.length;
      items.forEach((el, idx) => el.classList.toggle("selected", idx === selectedIdx));
      items[selectedIdx]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + items.length) % items.length;
      items.forEach((el, idx) => el.classList.toggle("selected", idx === selectedIdx));
      items[selectedIdx]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[selectedIdx]?.click();
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (backdrop.classList.contains("open")) closeSearch();
      else openSearch();
    } else if (e.key === "Escape" && backdrop.classList.contains("open")) {
      closeSearch();
    }
  });
})();
