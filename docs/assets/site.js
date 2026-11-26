(() => {
  const rootPrefix = (document.body.dataset.root || ".").replace(/\/+$/, "");

  const DOC_PAGES = [
    {
      title: "Getting Started",
      section: "Guides",
      path: "docs/guides/getting-started/",
      keywords: "quickstart docker overview prerequisites setup wizard start",
      desc: "Deploy Cadence and Lavalink v4 in minutes and run the Web Onboarding Wizard.",
    },
    {
      title: "Installation & Deployment",
      section: "Guides",
      path: "docs/guides/installation/",
      keywords: "docker compose ghcr bun local development reverse proxy https websocket",
      desc: "Full Docker Compose template, GHCR images, local Bun dev, and HTTPS reverse proxy setup.",
    },
    {
      title: "Discord Bot Setup",
      section: "Guides",
      path: "docs/guides/discord-setup/",
      keywords: "developer portal token oauth2 redirect uri intents server members message content",
      desc: "Configure Discord Developer Portal intents, OAuth2 Redirect URI, and bot invites.",
    },
    {
      title: "Playback & Empty VC",
      section: "Guides",
      path: "docs/guides/playback/",
      keywords: "timeline queue drag drop loop autoplay moods empty vc auto pause resume disconnect deafened",
      desc: "Timeline queue rules, Queue Loop, Smart Autoplay moods, and Empty VC automation.",
    },
    {
      title: "Role-Based Access & Domains",
      section: "Guides",
      path: "docs/guides/rbac/",
      keywords: "rbac permissions user dj admin owner system settings domain dashboard url",
      desc: "4-tier cascading Discord permissions and live domain/Redirect URI management.",
    },
    {
      title: "Commands & Shortcuts",
      section: "Reference",
      path: "docs/reference/commands/",
      keywords: "slash commands play playnext playnow skip pause resume volume loop filter prefix keyboard shortcuts",
      desc: "All 23 Discord slash commands, customizable text prefix commands, and web hotkeys.",
    },
    {
      title: "Troubleshooting & FAQ",
      section: "Reference",
      path: "docs/reference/troubleshooting/",
      keywords: "faq troubleshooting playnext missing slash commands lavalink youtube oauth sqlite backup",
      desc: "Fix missing slash commands, Lavalink YouTube search issues, OAuth2 errors, and backups.",
    },
  ];

  // Mobile sidebar toggle
  const sidebar = document.querySelector(".docs-sidebar");
  const menuBtn = document.querySelector("[data-menu-toggle]");
  if (sidebar && menuBtn) {
    menuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (
        sidebar.classList.contains("open") &&
        !sidebar.contains(e.target) &&
        !menuBtn.contains(e.target)
      ) {
        sidebar.classList.remove("open");
      }
    });
  }

  // Build "On this page" TOC & scrollspy
  const tocList = document.querySelector(".toc-list");
  const content = document.querySelector(".docs-content");
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#9ca3b5;flex-shrink:0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" placeholder="Search Cadence documentation..." aria-label="Search documentation" />
      </div>
      <div class="search-results"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const searchInput = backdrop.querySelector("input");
  const resultsEl = backdrop.querySelector(".search-results");

  const renderSearch = (query) => {
    const q = (query || "").trim().toLowerCase();
    const matches = !q
      ? DOC_PAGES
      : DOC_PAGES.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.desc.toLowerCase().includes(q) ||
            p.keywords.includes(q)
        );
    if (matches.length === 0) {
      resultsEl.innerHTML = `<div style="padding:18px;text-align:center;color:#70778a;font-size:0.88rem">No matching pages found.</div>`;
      return;
    }
    resultsEl.innerHTML = matches
      .map(
        (p) => `
          <a class="search-item" href="${rootPrefix}/${p.path}">
            <div class="search-item-title">${p.section} / ${p.title}</div>
            <div class="search-item-desc">${p.desc}</div>
          </a>
        `
      )
      .join("");
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
