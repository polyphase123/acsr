// ============================================================================
// PHILGRID LINE & CONTINGENCY ANALYZER — MOBILE 1-SCREEN CONTROLLER
// Complete Engine: DOE GOMP Maintenance Calendar, JSON Export/Import,
// N-2 Cascade Overload, Substation Bus View, Offline PWA & Theme Toggle
// Authored by Franz Xyrlo Tobias, PEE
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize Engine & State
  const engine = new GridContingencyEngine(GRID_TOPOLOGY);
  let activeFilter = "all";
  let gompSchedule = [...(typeof DOE_GOMP_SCHEDULE !== "undefined" ? DOE_GOMP_SCHEDULE : [])];

  // Calendar State
  let currentCalDate = new Date("2026-10-19");
  let calViewYear = currentCalDate.getFullYear();
  let calViewMonth = currentCalDate.getMonth(); // 0-indexed (9 = Oct)

  // 2. DOM Elements
  const elGridStatus = document.getElementById("grid-status-badge");
  const elTrippedCount = document.getElementById("metric-tripped-count");
  const elErtDisplay = document.getElementById("metric-ert-display");
  const elCurtailedMw = document.getElementById("metric-curtailed-mw");
  const elLoadShedMw = document.getElementById("metric-load-shed-mw");
  const elEconomicLoss = document.getElementById("metric-econ-loss");

  const searchInput = document.getElementById("grid-search-input");
  const btnSearch = document.getElementById("btn-exec-search");
  const btnClearSearch = document.getElementById("btn-clear-search");
  const autoDropdown = document.getElementById("search-autocomplete-dropdown");
  const searchResultsContainer = document.getElementById("search-results-list");
  const searchCountBadge = document.getElementById("search-results-count");

  // Multi-Dimensional Filter State
  let activeGridType = "all";
  let activeRegionFilter = "all";
  let activeProvince = "all";
  let activeLineVoltage = "all";
  let activePlantCapacity = "all";

  // Filter DOM Elements
  const selectGridType = document.getElementById("filter-grid-type");
  const selectRegion = document.getElementById("filter-region-select");
  const selectProvince = document.getElementById("filter-province-select");
  const selectLineVoltage = document.getElementById("filter-line-voltage");
  const selectPlantCapacity = document.getElementById("filter-plant-capacity");
  const btnResetFilters = document.getElementById("btn-reset-filters");
  const activeFilterTagsRow = document.getElementById("active-filter-tags-row");

  const btnReset = document.getElementById("btn-reset-all");
  const btnThemeToggle = document.getElementById("btn-theme-toggle");
  const toastNotification = document.getElementById("toast-notification");

  const outageBanner = document.getElementById("active-outage-banner");
  const outageBannerText = document.getElementById("active-outage-banner-text");
  const btnBannerRestore = document.getElementById("btn-banner-restore");
  const btnBannerCopy = document.getElementById("btn-banner-copy");
  const btnBannerShare = document.getElementById("btn-banner-share");

  // GOMP Modal Elements
  const btnGompToggle = document.getElementById("btn-gomp-toggle");
  const btnOpenGomp = document.getElementById("btn-open-gomp");
  const gompBadgeCount = document.getElementById("gomp-badge-count");
  const gompApproachingSummary = document.getElementById("gomp-approaching-summary");
  const gompModal = document.getElementById("gomp-modal");
  const btnCloseGomp = document.getElementById("btn-close-gomp");
  const btnSaveGompJson = document.getElementById("btn-save-gomp-json");
  const gompFileInput = document.getElementById("gomp-file-input");
  const btnAddGompEvent = document.getElementById("btn-add-gomp-event");
  const gompAddModal = document.getElementById("gomp-add-modal");
  const btnCloseAddGomp = document.getElementById("btn-close-add-gomp");
  const formAddGomp = document.getElementById("form-add-gomp");
  const addGompType = document.getElementById("add-gomp-type");
  const addGompAsset = document.getElementById("add-gomp-asset");

  const calendarMonthLabel = document.getElementById("calendar-month-label");
  const calendarDaysGrid = document.getElementById("calendar-days-grid");
  const btnCalPrev = document.getElementById("btn-cal-prev");
  const btnCalNext = document.getElementById("btn-cal-next");
  const gompScheduleCount = document.getElementById("gomp-schedule-count");
  const gompScheduleItemsList = document.getElementById("gomp-schedule-items-list");

  // 3. Register Service Worker for Offline PWA Support
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // 4. Toast Notification Helper
  function showToast(msg) {
    if (!toastNotification) return;
    toastNotification.textContent = msg;
    toastNotification.style.display = "block";
    setTimeout(() => {
      toastNotification.style.display = "none";
    }, 2400);
  }

  // 5. Theme Toggle (Light / Dark)
  if (btnThemeToggle) {
    if (localStorage.getItem("philgrid_theme") === "dark") {
      document.body.classList.add("dark-theme");
    }
    btnThemeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-theme");
      const isDark = document.body.classList.contains("dark-theme");
      localStorage.setItem("philgrid_theme", isDark ? "dark" : "light");
      showToast(isDark ? "🌙 Dark Mode Enabled" : "☀️ Light Mode Enabled");
    });
  }

  // 6. Global Reset Breakers
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      engine.restoreAll();
      showToast("↺ All Breakers Reclosed (N-0 Normal)");
      updateUrlHash();
    });
  }

  if (btnBannerRestore) {
    btnBannerRestore.addEventListener("click", () => {
      engine.restoreAll();
      showToast("↺ All Breakers Reclosed");
      updateUrlHash();
    });
  }

  // 7. Copy Operational Dispatch Report (Viber/Telegram)
  if (btnBannerCopy) {
    btnBannerCopy.addEventListener("click", () => {
      copyDispatchReport();
    });
  }

  function copyDispatchReport() {
    const state = engine.calculateState();
    if (state.trippedCount === 0) {
      showToast("Grid is Normal: No active outage to report");
      return;
    }

    const linesNames = state.trippedLineIds.map(id => GRID_TOPOLOGY.lines[id]?.name || id).join("\n  • ");
    const plantsStr = state.affectedPlants.length > 0
      ? state.affectedPlants.map(p => `${p.plant.name} (-${p.curtailedMw} MW)`).join("\n  • ")
      : "None";
    const dusStr = state.affectedDUs.length > 0
      ? state.affectedDUs.map(d => `${d.du.name} (${d.severity}: ${d.shedMw} MW)`).join("\n  • ")
      : "None";

    const report = `🚨 PHILGRID N-1 CONTINGENCY DISPATCH REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ TRIPPED TRANSMISSION LINE(S):
  • ${linesNames}

🏭 GENERATION CURTAILMENT: ${state.totalCurtailedMw.toLocaleString()} MW
  • ${plantsStr}

🏢 LOAD SHED & BROWN-OUT: ${state.totalLoadShedMw.toLocaleString()} MW
  • ${dusStr}

👥 CUSTOMER IMPACT: ${state.totalCustomersAffected.toLocaleString()} accounts
💰 ESTIMATED VOLL LOSS: ₱${(state.hourlyEconomicLossPhp / 1e6).toFixed(2)}M / hour
⏱️ EST. RESTORATION TIME (ERT): ${state.estimatedRestorationTime}
🛠️ BLACKSTART STRATEGY: ${state.blackstartStrategy}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated by PhilGrid Contingency Analyzer (PEE)`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(() => {
        showToast("📋 Dispatch Report Copied to Clipboard!");
      }).catch(() => {
        fallbackCopy(report);
      });
    } else {
      fallbackCopy(report);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("📋 Dispatch Report Copied!");
  }

  // 8. Share Scenario Link (URL Deep-Linking)
  if (btnBannerShare) {
    btnBannerShare.addEventListener("click", () => {
      updateUrlHash();
      const url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          showToast("🔗 Scenario Link Copied to Clipboard!");
        });
      } else {
        fallbackCopy(url);
      }
    });
  }

  function updateUrlHash() {
    const trippedArr = Array.from(engine.trippedLineIds);
    const searchVal = searchInput ? searchInput.value.trim() : "";
    const params = new URLSearchParams();
    if (trippedArr.length > 0) params.set("tripped", trippedArr.join(","));
    if (searchVal) params.set("q", searchVal);
    window.location.hash = params.toString();
  }

  function loadFromUrlHash() {
    if (!window.location.hash) return;
    const raw = window.location.hash.substring(1);
    const params = new URLSearchParams(raw);
    const tripped = params.get("tripped");
    const q = params.get("q");

    if (tripped) {
      tripped.split(",").forEach(id => {
        if (GRID_TOPOLOGY.lines[id]) engine.tripLine(id);
      });
    }

    if (q && searchInput) {
      searchInput.value = q;
      if (btnClearSearch) btnClearSearch.style.display = "block";
    }
  }

  // ==========================================================================
  // 9. DOE GOMP MAINTENANCE ENGINE & CALENDAR
  // ==========================================================================
  function getDaysUntil(dateStr) {
    const today = new Date("2026-10-19"); // simulation baseline
    const target = new Date(dateStr);
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  function updateGompBadges() {
    const today = new Date("2026-10-19");
    const approaching = gompSchedule.filter(item => {
      const s = new Date(item.startDate);
      const e = new Date(item.endDate);
      const days = Math.ceil((s.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return (days >= 0 && days <= 14) || (today >= s && today <= e);
    });

    if (gompBadgeCount) gompBadgeCount.textContent = approaching.length;
    if (gompApproachingSummary) {
      gompApproachingSummary.textContent = `${approaching.length} Outages Scheduled in Next 14 Days (DOE Approved)`;
    }
    if (gompScheduleCount) {
      gompScheduleCount.textContent = `${gompSchedule.length} Events Total`;
    }
  }

  let selectedCalDate = null;
  const btnGompViewAll = document.getElementById("btn-gomp-view-all");

  function renderCalendar() {
    if (!calendarDaysGrid || !calendarMonthLabel) return;
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    calendarMonthLabel.textContent = `${months[calViewMonth]} ${calViewYear}`;

    calendarDaysGrid.innerHTML = "";

    const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
    const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

    // Blank cells before month starts
    for (let i = 0; i < firstDay; i++) {
      const blank = document.createElement("div");
      blank.className = "cal-day";
      blank.style.background = "transparent";
      blank.style.border = "none";
      blank.style.cursor = "default";
      calendarDaysGrid.appendChild(blank);
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dayCell = document.createElement("div");
      dayCell.className = "cal-day";
      const dateStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

      if (calViewYear === 2026 && calViewMonth === 9 && d === 19) {
        dayCell.classList.add("is-today");
      }

      if (selectedCalDate === dateStr) {
        dayCell.classList.add("is-selected");
      }

      // Check matching GOMP maintenance on this date
      const matchedEvents = gompSchedule.filter(item => {
        return dateStr >= item.startDate && dateStr <= item.endDate;
      });

      if (matchedEvents.length > 0) {
        dayCell.classList.add("has-gomp");
      }

      dayCell.innerHTML = `<span>${d}</span>`;

      if (matchedEvents.length > 0) {
        const dotWrap = document.createElement("div");
        dotWrap.className = "cal-dot-container";
        matchedEvents.slice(0, 3).forEach(ev => {
          const dot = document.createElement("span");
          dot.className = `cal-dot ${ev.type === 'plant' ? 'cal-dot-plant' : 'cal-dot-line'}`;
          dotWrap.appendChild(dot);
        });
        dayCell.appendChild(dotWrap);
      }

      dayCell.addEventListener("click", () => {
        calendarDaysGrid.querySelectorAll(".cal-day").forEach(c => c.classList.remove("is-selected"));
        dayCell.classList.add("is-selected");
        selectedCalDate = dateStr;

        if (btnGompViewAll) btnGompViewAll.style.display = "inline-block";

        if (matchedEvents.length > 0) {
          renderGompList(matchedEvents, `Outages Active on ${dateStr} (${matchedEvents.length})`);
        } else {
          renderGompList([], `No Outages on ${dateStr}`);
        }
      });

      calendarDaysGrid.appendChild(dayCell);
    }
  }

  function renderGompList(items, customTitle) {
    if (!gompScheduleItemsList) return;
    const listTitle = document.getElementById("gomp-list-title");
    if (listTitle) listTitle.textContent = customTitle || "Approaching & Scheduled Maintenance";

    const displayItems = items !== undefined && items !== null ? items : gompSchedule;
    const today = new Date("2026-10-19");

    if (displayItems.length === 0) {
      gompScheduleItemsList.innerHTML = `
        <div class="empty-start-brief" style="padding: 14px 10px; margin: 4px 0;">
          <span style="font-size: 20px;">✅</span>
          <div style="font-size: 11px; font-weight: 700; color: var(--text-primary); margin-top: 4px;">No Scheduled Outages on this Date</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">All power generation plants and transmission corridors operate normally.</div>
        </div>
      `;
      return;
    }

    gompScheduleItemsList.innerHTML = displayItems.map(item => {
      const s = new Date(item.startDate);
      const e = new Date(item.endDate);
      const days = Math.ceil((s.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isActive = today >= s && today <= e;
      const isApproaching = days >= 0 && days <= 14;

      let badgeHtml = "";
      if (isActive) {
        badgeHtml = `<span class="badge badge-red gomp-countdown-badge">🔴 ACTIVE TODAY</span>`;
      } else if (isApproaching) {
        badgeHtml = `<span class="badge badge-amber gomp-countdown-badge">⚠️ In ${days} Day${days === 1 ? '' : 's'}</span>`;
      } else if (days < 0) {
        badgeHtml = `<span class="badge badge-gray gomp-countdown-badge">COMPLETED</span>`;
      } else {
        badgeHtml = `<span class="badge badge-blue gomp-countdown-badge">Scheduled</span>`;
      }

      return `
        <div class="gomp-event-card ${isActive ? 'is-active' : isApproaching ? 'is-approaching' : ''}">
          <div class="gomp-event-top">
            <span class="gomp-event-name">${item.type === 'plant' ? '🏭' : '⚡'} ${item.assetName} (${item.unit})</span>
            ${badgeHtml}
          </div>
          <div class="gomp-event-dates">📅 ${item.startDate} to ${item.endDate} • <strong>-${item.capacityMw} MW</strong></div>
          <div class="gomp-event-impact"><strong>Scope:</strong> ${item.workType}. <em>${item.gridImpact}</em></div>
        </div>
      `;
    }).join("");
  }

  if (btnGompViewAll) {
    btnGompViewAll.addEventListener("click", () => {
      selectedCalDate = null;
      if (calendarDaysGrid) {
        calendarDaysGrid.querySelectorAll(".cal-day").forEach(c => c.classList.remove("is-selected"));
      }
      btnGompViewAll.style.display = "none";
      renderGompList(null, "Approaching & Scheduled Maintenance");
    });
  }

  // Calendar Month Navigation
  if (btnCalPrev) {
    btnCalPrev.addEventListener("click", () => {
      calViewMonth--;
      if (calViewMonth < 0) {
        calViewMonth = 11;
        calViewYear--;
      }
      renderCalendar();
    });
  }

  if (btnCalNext) {
    btnCalNext.addEventListener("click", () => {
      calViewMonth++;
      if (calViewMonth > 11) {
        calViewMonth = 0;
        calViewYear++;
      }
      renderCalendar();
    });
  }

  // Open & Close GOMP Modal
  if (btnGompToggle) btnGompToggle.addEventListener("click", openGompModal);
  if (btnOpenGomp) btnOpenGomp.addEventListener("click", openGompModal);
  if (btnCloseGomp) btnCloseGomp.addEventListener("click", closeGompModal);

  function openGompModal() {
    if (gompModal) {
      gompModal.style.display = "flex";
      selectedCalDate = null;
      if (btnGompViewAll) btnGompViewAll.style.display = "none";
      renderCalendar();
      renderGompList();
    }
  }

  function closeGompModal() {
    if (gompModal) gompModal.style.display = "none";
  }

  // Export GOMP helper
  function exportGompJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gompSchedule, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `doe-gomp-maintenance-schedule-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("💾 GOMP JSON File Downloaded!");
  }

  // Save GOMP Schedule as JSON file
  if (btnSaveGompJson) {
    btnSaveGompJson.addEventListener("click", exportGompJson);
  }

  // Load GOMP Schedule from JSON file
  if (gompFileInput) {
    gompFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const loaded = JSON.parse(event.target.result);
          if (Array.isArray(loaded)) {
            gompSchedule = loaded;
            updateGompBadges();
            renderCalendar();
            renderGompList();
            renderSearchResults(searchInput ? searchInput.value : "");
            showToast(`📂 Imported ${loaded.length} GOMP Maintenance Windows!`);
          } else {
            alert("Invalid JSON format. Expected an array of GOMP maintenance records.");
          }
        } catch (err) {
          alert("Error parsing JSON file: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // Quick Add GOMP Event Modal
  if (btnAddGompEvent) {
    btnAddGompEvent.addEventListener("click", () => {
      populateAssetDropdown();
      if (gompAddModal) gompAddModal.style.display = "flex";
    });
  }

  if (btnCloseAddGomp) {
    btnCloseAddGomp.addEventListener("click", () => {
      if (gompAddModal) gompAddModal.style.display = "none";
    });
  }

  function populateAssetDropdown() {
    if (!addGompAsset || !addGompType) return;
    const isPlant = addGompType.value === "plant";
    const collection = isPlant ? Object.values(GRID_TOPOLOGY.plants) : Object.values(GRID_TOPOLOGY.lines);
    addGompAsset.innerHTML = collection.map(item => `
      <option value="${item.id}" data-name="${item.name}" data-cap="${item.capacityMw || item.normalCapacityMva}">${item.name} (${item.capacityMw || item.normalCapacityMva} ${isPlant ? 'MW' : 'MVA'})</option>
    `).join("");
  }

  if (addGompType) {
    addGompType.addEventListener("change", populateAssetDropdown);
  }

  if (formAddGomp) {
    formAddGomp.addEventListener("submit", (e) => {
      e.preventDefault();
      const selectedOption = addGompAsset.options[addGompAsset.selectedIndex];
      const newEntry = {
        id: `GOMP-CUSTOM-${Date.now()}`,
        type: addGompType.value,
        assetId: addGompAsset.value,
        assetName: selectedOption.dataset.name,
        unit: document.getElementById("add-gomp-unit").value.trim(),
        capacityMw: parseFloat(document.getElementById("add-gomp-mw").value) || 0,
        startDate: document.getElementById("add-gomp-start").value,
        endDate: document.getElementById("add-gomp-end").value,
        workType: document.getElementById("add-gomp-work").value.trim(),
        region: "luzon",
        gridImpact: "Custom user-scheduled GOMP maintenance window."
      };

      gompSchedule.unshift(newEntry);
      updateGompBadges();
      renderCalendar();
      renderGompList();
      renderSearchResults(searchInput ? searchInput.value : "");
      if (gompAddModal) gompAddModal.style.display = "none";
      formAddGomp.reset();
      showToast("➕ GOMP Maintenance Window Added!");
    });
  }

  // ==========================================================================
  // 10. ADVANCED MULTI-ENTITY AUTO-FILL & CATEGORY FILTER ENGINE
  // ==========================================================================
  
  // Extract all unique provinces across DUs, Plants, and Transmission Lines
  function getAllGridProvinces() {
    const provStats = {};
    Object.values(GRID_TOPOLOGY.dus).forEach(d => {
      if (d.province) {
        d.province.split(/[,&]/).forEach(p => {
          const clean = p.trim();
          if (clean && clean.length > 2) {
            if (!provStats[clean]) provStats[clean] = { name: clean, dus: 0, plants: 0, lines: 0 };
            provStats[clean].dus++;
          }
        });
      }
    });
    Object.values(GRID_TOPOLOGY.plants).forEach(p => {
      if (p.province) {
        p.province.split(/[,&]/).forEach(prov => {
          const clean = prov.trim();
          if (clean && clean.length > 2) {
            if (!provStats[clean]) provStats[clean] = { name: clean, dus: 0, plants: 0, lines: 0 };
            provStats[clean].plants++;
          }
        });
      }
    });
    Object.values(GRID_TOPOLOGY.lines).forEach(l => {
      if (l.province) {
        l.province.split(/[,&]/).forEach(prov => {
          const clean = prov.trim();
          if (clean && clean.length > 2) {
            if (!provStats[clean]) provStats[clean] = { name: clean, dus: 0, plants: 0, lines: 0 };
            provStats[clean].lines++;
          }
        });
      }
    });
    return Object.values(provStats).sort((a, b) => a.name.localeCompare(b.name));
  }

  function populateProvinceDropdown() {
    if (!selectProvince) return;
    const provs = getAllGridProvinces();
    selectProvince.innerHTML = `<option value="all">All Provinces (${provs.length})</option>`;
    provs.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = `${p.name} (${p.dus} DU${p.dus === 1 ? '' : 's'}${p.plants > 0 ? `, ${p.plants} Plant` : ''})`;
      selectProvince.appendChild(opt);
    });
  }

  function renderActiveFilterPills() {
    if (!activeFilterTagsRow) return;
    const pills = [];

    if (activeGridType !== "all") {
      pills.push({ id: "grid", label: `Grid: ${activeGridType === 'ongrid' ? 'On-Grid' : 'Off-Grid (SPUG)'}` });
    }
    if (activeRegionFilter !== "all") {
      pills.push({ id: "region", label: `Region: ${activeRegionFilter.toUpperCase()}` });
    }
    if (activeProvince !== "all") {
      pills.push({ id: "province", label: `Province: ${activeProvince}` });
    }
    if (activeLineVoltage !== "all") {
      pills.push({ id: "voltage", label: `Voltage: ${activeLineVoltage === 'hvdc' ? 'HVDC' : activeLineVoltage + ' kV'}` });
    }
    if (activePlantCapacity !== "all") {
      pills.push({ id: "capacity", label: `Plant: ${activePlantCapacity.toUpperCase()}` });
    }

    if (pills.length === 0) {
      activeFilterTagsRow.style.display = "none";
      activeFilterTagsRow.innerHTML = "";
      return;
    }

    activeFilterTagsRow.innerHTML = pills.map(p => `
      <span class="filter-active-pill">
        ${p.label}
        <span class="pill-close" data-clear-filter="${p.id}">&times;</span>
      </span>
    `).join("") + `<button id="btn-clear-all-pills" style="border:none; background:none; font-size:9.5px; color:var(--brand-red); cursor:pointer; font-weight:700; text-decoration:underline;">Clear All</button>`;

    activeFilterTagsRow.style.display = "flex";

    activeFilterTagsRow.querySelectorAll("[data-clear-filter]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const fType = el.dataset.clearFilter;
        if (fType === "grid") { activeGridType = "all"; if (selectGridType) selectGridType.value = "all"; }
        if (fType === "region") { activeRegionFilter = "all"; if (selectRegion) selectRegion.value = "all"; }
        if (fType === "province") { activeProvince = "all"; if (selectProvince) selectProvince.value = "all"; }
        if (fType === "voltage") { activeLineVoltage = "all"; if (selectLineVoltage) selectLineVoltage.value = "all"; }
        if (fType === "capacity") { activePlantCapacity = "all"; if (selectPlantCapacity) selectPlantCapacity.value = "all"; }
        renderActiveFilterPills();
        renderSearchResults(searchInput ? searchInput.value : "");
      });
    });

    const btnClearAllPills = document.getElementById("btn-clear-all-pills");
    if (btnClearAllPills) {
      btnClearAllPills.addEventListener("click", resetAllFilters);
    }
  }

  function resetAllFilters() {
    activeGridType = "all";
    activeRegionFilter = "all";
    activeProvince = "all";
    activeLineVoltage = "all";
    activePlantCapacity = "all";

    if (selectGridType) selectGridType.value = "all";
    if (selectRegion) selectRegion.value = "all";
    if (selectProvince) selectProvince.value = "all";
    if (selectLineVoltage) selectLineVoltage.value = "all";
    if (selectPlantCapacity) selectPlantCapacity.value = "all";

    if (searchInput) searchInput.value = "";
    if (btnClearSearch) btnClearSearch.style.display = "none";

    renderActiveFilterPills();
    renderSearchResults("");
    showToast("↺ All filters reset to defaults");
  }

  // Filter Dropdown Listeners
  if (selectGridType) {
    selectGridType.addEventListener("change", (e) => {
      activeGridType = e.target.value;
      renderActiveFilterPills();
      renderSearchResults(searchInput ? searchInput.value : "");
    });
  }
  if (selectRegion) {
    selectRegion.addEventListener("change", (e) => {
      activeRegionFilter = e.target.value;
      renderActiveFilterPills();
      renderSearchResults(searchInput ? searchInput.value : "");
    });
  }
  if (selectProvince) {
    selectProvince.addEventListener("change", (e) => {
      activeProvince = e.target.value;
      renderActiveFilterPills();
      renderSearchResults(searchInput ? searchInput.value : "");
    });
  }
  if (selectLineVoltage) {
    selectLineVoltage.addEventListener("change", (e) => {
      activeLineVoltage = e.target.value;
      renderActiveFilterPills();
      renderSearchResults(searchInput ? searchInput.value : "");
    });
  }
  if (selectPlantCapacity) {
    selectPlantCapacity.addEventListener("change", (e) => {
      activePlantCapacity = e.target.value;
      renderActiveFilterPills();
      renderSearchResults(searchInput ? searchInput.value : "");
    });
  }
  if (btnResetFilters) {
    btnResetFilters.addEventListener("click", resetAllFilters);
  }

  // Multi-Category Auto-Fill Suggestions
  function getAutoFillSuggestions(text) {
    const q = (text || "").toLowerCase().trim();

    // Default suggestions when omnibox is focused/empty
    if (!q) {
      return [
        {
          header: "⚡ Transmission Lines",
          items: [
            { cat: "line", badge: "LINE", title: "Hermosa - San Jose 500 kV", subtitle: "500 kV Double Circuit EHV Backbone", query: "Hermosa - San Jose 500 kV Transmission Corridor" },
            { cat: "line", badge: "LINE", title: "Pagbilao - Tayabas 500 kV", subtitle: "500 kV Southern Luzon Bulk Backbone", query: "Pagbilao - Tayabas 500 kV Backbone" },
            { cat: "line", badge: "LINE", title: "Leyte - Luzon HVDC 450 kV", subtitle: "450 kV Submarine Interconnection Bipole", query: "Leyte - Luzon HVDC 450 kV Bipole" },
            { cat: "line", badge: "LINE", title: "Cebu - Bohol 138 kV Interconnection", subtitle: "138 kV Submarine Cable Spine", query: "Cebu - Bohol 138 kV Interconnection" }
          ]
        },
        {
          header: "🏭 Power Plants",
          items: [
            { cat: "plant", badge: "PLANT", title: "GNPower Dinginin (1,336 MW)", subtitle: "Supercritical Coal • Bataan", query: "GNPower Dinginin Supercritical" },
            { cat: "plant", badge: "PLANT", title: "Sual Coal Power Station (1,294 MW)", subtitle: "Baseload Coal • Pangasinan", query: "Sual Coal Power Station" },
            { cat: "plant", badge: "PLANT", title: "Ilijan Combined Cycle (1,200 MW)", subtitle: "Combined Cycle LNG/Gas • Batangas", query: "Ilijan Combined Cycle Power Plant" }
          ]
        },
        {
          header: "🏢 Distribution Utilities",
          items: [
            { cat: "du", badge: "DU", title: "Meralco (Manila Electric Co.)", subtitle: "7,850 MW Peak • Metro Manila", query: "Manila Electric Company (MERALCO)" },
            { cat: "du", badge: "DU", title: "Visayan Electric Company (VECO)", subtitle: "620 MW Peak • Metro Cebu", query: "Visayan Electric Company (VECO)" },
            { cat: "du", badge: "DU", title: "Davao Light & Power (DLPC)", subtitle: "510 MW Peak • Davao City", query: "Davao Light and Power Company (DLPC)" },
            { cat: "du", badge: "DU", title: "PALECO (Palawan Electric Coop)", subtitle: "75 MW Peak • Palawan Island", query: "Palawan Electric Cooperative (PALECO)" }
          ]
        },
        {
          header: "📍 Provinces (Filter by Province)",
          items: [
            { cat: "prov", badge: "PROV", title: "Cagayan Province", subtitle: "2 DUs: CAGELCO I & CAGELCO II • Tap to filter", query: "Cagayan", provinceSelect: "Cagayan" },
            { cat: "prov", badge: "PROV", title: "Pangasinan Province", subtitle: "3 DUs: PANELCO I, III, CENPELCO • Sual Coal", query: "Pangasinan", provinceSelect: "Pangasinan" },
            { cat: "prov", badge: "PROV", title: "Cebu Province", subtitle: "5 DUs: VECO, MECO, CEBECO I-III • 4 Plants", query: "Cebu", provinceSelect: "Cebu" }
          ]
        }
      ];
    }

    // When query is non-empty, collect matches by category
    const linesMatches = [];
    const plantsMatches = [];
    const duMatches = [];
    const subMatches = [];
    const provMatches = [];
    const regionMatches = [];

    // 1. Transmission Lines
    Object.values(GRID_TOPOLOGY.lines).forEach(l => {
      const matchName = l.name.toLowerCase().includes(q) || l.id.toLowerCase().includes(q);
      const matchVolt = `${l.voltageKv}kv`.includes(q) || `${l.voltageKv} kv`.includes(q) || (q === "500" && l.voltageKv === 500) || (q === "230" && l.voltageKv === 230) || (q === "138" && l.voltageKv === 138);
      const matchProv = l.province && l.province.toLowerCase().includes(q);
      const matchSubs = l.substations && l.substations.some(s => s.toLowerCase().includes(q));
      const matchCirc = l.circuitType && l.circuitType.toLowerCase().includes(q);
      const matchKey = ["line", "lines", "transmission", "corridor", "interconnection", "circuit", "cable", "hvdc"].some(k => q.includes(k) || k.includes(q));

      if (matchName || matchVolt || matchProv || matchSubs || matchCirc || matchKey) {
        linesMatches.push({
          cat: "line",
          badge: "LINE",
          title: l.name,
          subtitle: `${l.voltageKv} kV ${l.circuitType} • ${l.province || l.region.toUpperCase()}`,
          query: l.name
        });
      }
    });

    // 2. Power Plants
    Object.values(GRID_TOPOLOGY.plants).forEach(p => {
      const matchName = p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
      const matchFuel = p.fuelType && p.fuelType.toLowerCase().includes(q);
      const matchProv = p.province && p.province.toLowerCase().includes(q);
      const matchLoc = p.location && p.location.toLowerCase().includes(q);
      const matchKey = ["plant", "plants", "power", "genco", "coal", "gas", "hydro", "diesel", "solar", "wind", "geothermal", "geo"].some(k => q.includes(k) || k.includes(q));

      if (matchName || matchFuel || matchProv || matchLoc || matchKey) {
        plantsMatches.push({
          cat: "plant",
          badge: "PLANT",
          title: p.name,
          subtitle: `${p.capacityMw} MW ${p.fuelType} • ${p.province || p.location || p.region}`,
          query: p.name
        });
      }
    });

    // 3. Distribution Utilities (DUs)
    Object.values(GRID_TOPOLOGY.dus).forEach(d => {
      const matchName = d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q);
      const matchProv = d.province && d.province.toLowerCase().includes(q);
      const matchFranchise = d.franchiseArea && d.franchiseArea.toLowerCase().includes(q);
      const matchSubs = d.deliverySubstations && d.deliverySubstations.some(s => s.toLowerCase().includes(q));
      const matchKey = ["du", "dus", "coop", "cooperative", "utility", "electric"].some(k => q.includes(k) || k.includes(q));

      if (matchName || matchProv || matchFranchise || matchSubs || matchKey) {
        duMatches.push({
          cat: "du",
          badge: "DU",
          title: d.name,
          subtitle: `${d.peakDemandMw} MW Peak • ${d.province || d.region.toUpperCase()}`,
          query: d.name
        });
      }
    });

    // 4. Provinces
    const allProvs = getAllGridProvinces();
    allProvs.forEach(p => {
      if (p.name.toLowerCase().includes(q)) {
        provMatches.push({
          cat: "prov",
          badge: "PROV",
          title: `${p.name} Province`,
          subtitle: `${p.dus} DU${p.dus === 1 ? '' : 's'}${p.plants > 0 ? `, ${p.plants} Plant` : ''} • Tap to view all inside`,
          query: p.name,
          provinceSelect: p.name
        });
      }
    });

    // 5. Substations
    const substations = engine.getSubstations();
    substations.forEach(s => {
      if (s.name.toLowerCase().includes(q) || `${s.voltageKv}kv`.includes(q)) {
        subMatches.push({
          cat: "sub",
          badge: "SUB",
          title: s.name,
          subtitle: `${s.voltageKv} kV Substation Bus • ${s.connectedLines.length} Lines • ${s.connectedPlants.length} Plants`,
          query: s.name
        });
      }
    });

    // 6. Grid Regions
    const REGIONS_DATA = [
      { title: "Off-Grid / SPUG Islands", subtitle: "All 15 Island Electric Cooperatives", query: "SPUG" },
      { title: "Luzon Grid", subtitle: "500 kV EHV & 230 kV Bulk Transmission Grid", query: "Luzon" },
      { title: "Visayas Grid", subtitle: "Cebu, Leyte, Panay, Negros Interconnected Grid", query: "Visayas" },
      { title: "Mindanao Grid", subtitle: "Agus Hydro, 230 kV Backbone & MVIP Interconnection", query: "Mindanao" }
    ];
    REGIONS_DATA.forEach(reg => {
      if (reg.title.toLowerCase().includes(q) || reg.query.toLowerCase().includes(q)) {
        regionMatches.push({
          cat: "region",
          badge: "GRID",
          title: reg.title,
          subtitle: reg.subtitle,
          query: reg.query
        });
      }
    });

    // Grouping & Intelligent Ordering
    const groups = [];

    // If query targets lines
    const isLineTargeted = ["line", "500", "230", "138", "corridor", "trans", "interconnection", "circuit", "cable", "hvdc"].some(k => q.includes(k));
    // If query targets plants
    const isPlantTargeted = ["plant", "coal", "gas", "hydro", "diesel", "solar", "wind", "mw", "geo"].some(k => q.includes(k));
    // If query targets provinces
    const isProvTargeted = provMatches.length > 0 && provMatches.some(p => p.query.toLowerCase() === q || p.query.toLowerCase().startsWith(q));

    if (isProvTargeted) {
      if (provMatches.length > 0) groups.push({ header: "📍 Matching Provinces", items: provMatches.slice(0, 3) });
      if (duMatches.length > 0) groups.push({ header: "🏢 Distribution Utilities in Area", items: duMatches.slice(0, 4) });
      if (linesMatches.length > 0) groups.push({ header: "⚡ Transmission Corridors", items: linesMatches.slice(0, 4) });
      if (plantsMatches.length > 0) groups.push({ header: "🏭 Power Plants", items: plantsMatches.slice(0, 3) });
    } else if (isLineTargeted) {
      if (linesMatches.length > 0) groups.push({ header: "⚡ Transmission Lines & Corridors", items: linesMatches.slice(0, 6) });
      if (subMatches.length > 0) groups.push({ header: "🔌 Substations & Bus Nodes", items: subMatches.slice(0, 3) });
      if (plantsMatches.length > 0) groups.push({ header: "🏭 Power Plants", items: plantsMatches.slice(0, 3) });
      if (duMatches.length > 0) groups.push({ header: "🏢 Distribution Utilities", items: duMatches.slice(0, 3) });
    } else if (isPlantTargeted) {
      if (plantsMatches.length > 0) groups.push({ header: "🏭 Power Plants & Generation", items: plantsMatches.slice(0, 6) });
      if (linesMatches.length > 0) groups.push({ header: "⚡ Evacuating Transmission Lines", items: linesMatches.slice(0, 4) });
      if (duMatches.length > 0) groups.push({ header: "🏢 Contracted DUs", items: duMatches.slice(0, 3) });
    } else {
      // Balanced distribution
      if (provMatches.length > 0) groups.push({ header: "📍 Provinces", items: provMatches.slice(0, 2) });
      if (linesMatches.length > 0) groups.push({ header: "⚡ Transmission Lines", items: linesMatches.slice(0, 4) });
      if (plantsMatches.length > 0) groups.push({ header: "🏭 Power Plants", items: plantsMatches.slice(0, 4) });
      if (duMatches.length > 0) groups.push({ header: "🏢 Distribution Utilities", items: duMatches.slice(0, 4) });
      if (subMatches.length > 0) groups.push({ header: "🔌 Substations", items: subMatches.slice(0, 2) });
      if (regionMatches.length > 0) groups.push({ header: "🌐 Grid Regions", items: regionMatches.slice(0, 2) });
    }

    return groups;
  }

  function renderAutoDropdown(text) {
    if (!autoDropdown) return;
    const groups = getAutoFillSuggestions(text);

    if (!groups || groups.length === 0) {
      autoDropdown.style.display = "none";
      return;
    }

    let html = `<div class="autocomplete-section-title">
      <span>⚡ Auto-fill Matches (Tap to Select)</span>
      <span style="font-size: 8.5px; color: var(--text-muted); cursor: pointer;" id="btn-close-autocomplete">✕ Close</span>
    </div>`;

    groups.forEach(group => {
      html += `
        <div class="autocomplete-group-header">
          <span>${group.header}</span>
          <span style="font-size: 8.5px; opacity: 0.85;">${group.items.length} match${group.items.length === 1 ? '' : 'es'}</span>
        </div>
        ${group.items.map(item => `
          <div class="autocomplete-item" data-fill-query="${item.query}" ${item.provinceSelect ? `data-prov-select="${item.provinceSelect}"` : ''}>
            <div class="autocomplete-left">
              <span class="autocomplete-cat-badge cat-${item.cat}">${item.badge}</span>
              <div>
                <div class="autocomplete-title">${item.title}</div>
                <div class="autocomplete-subtitle">${item.subtitle}</div>
              </div>
            </div>
            <span style="font-size: 11px; color: var(--brand-blue);">➔</span>
          </div>
        `).join("")}
      `;
    });

    autoDropdown.innerHTML = html;
    autoDropdown.style.display = "block";

    const btnCloseAuto = document.getElementById("btn-close-autocomplete");
    if (btnCloseAuto) {
      btnCloseAuto.addEventListener("click", (e) => {
        e.stopPropagation();
        autoDropdown.style.display = "none";
      });
    }

    autoDropdown.querySelectorAll("[data-fill-query]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const fillText = el.dataset.fillQuery;
        const provSelect = el.dataset.provSelect;
        selectAutoFill(fillText, provSelect);
      });
    });
  }

  function selectAutoFill(text, provinceSelect) {
    if (provinceSelect) {
      activeProvince = provinceSelect;
      if (selectProvince) selectProvince.value = provinceSelect;
      renderActiveFilterPills();
    }
    if (searchInput) {
      searchInput.value = text;
      if (btnClearSearch) btnClearSearch.style.display = "block";
      if (autoDropdown) autoDropdown.style.display = "none";
      renderSearchResults(text);
      updateUrlHash();
    }
  }

  // Search Input Listeners
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      if (btnClearSearch) btnClearSearch.style.display = val ? "block" : "none";
      renderAutoDropdown(val);
      renderSearchResults(val);
      updateUrlHash();
    });

    searchInput.addEventListener("focus", () => {
      renderAutoDropdown(searchInput.value.trim());
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (autoDropdown) autoDropdown.style.display = "none";
        renderSearchResults(searchInput.value.trim());
        updateUrlHash();
      } else if (e.key === "Escape") {
        if (autoDropdown) autoDropdown.style.display = "none";
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (autoDropdown && !e.target.closest(".search-input-wrap-outer")) {
      autoDropdown.style.display = "none";
    }
  });

  if (btnSearch) {
    btnSearch.addEventListener("click", () => {
      if (autoDropdown) autoDropdown.style.display = "none";
      renderSearchResults(searchInput ? searchInput.value.trim() : "");
      updateUrlHash();
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener("click", () => {
      searchInput.value = "";
      btnClearSearch.style.display = "none";
      if (autoDropdown) autoDropdown.style.display = "none";
      renderSearchResults("");
      searchInput.focus();
      updateUrlHash();
    });
  }

  // Filter Chips
  document.querySelectorAll(".chip-btn").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip-btn").forEach(c => c.classList.remove("active-chip"));
      chip.classList.add("active-chip");
      activeFilter = chip.dataset.filter || "all";
      renderSearchResults(searchInput ? searchInput.value : "");
    });
  });

  // Suggestion Pills
  document.querySelectorAll(".suggest-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      selectAutoFill(pill.dataset.query || "");
    });
  });

  // Region Switcher
  document.querySelectorAll(".btn-region-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".btn-region-tab").forEach(b => b.classList.remove("active-region"));
      btn.classList.add("active-region");
      const region = btn.dataset.region || "all";
      engine.setRegion(region);
      renderSearchResults(searchInput ? searchInput.value : "");
    });
  });

  // 11. Engine State Subscription
  engine.subscribe((state) => {
    updateTelemetry(state);
    renderSearchResults(searchInput ? searchInput.value : "");
  });

  function updateTelemetry(state) {
    if (elGridStatus) {
      elGridStatus.className = `badge ${state.statusBadge.class}`;
      elGridStatus.textContent = state.statusBadge.text;
    }
    if (elTrippedCount) {
      elTrippedCount.textContent = `${state.trippedCount} Line${state.trippedCount === 1 ? '' : 's'} Tripped`;
      elTrippedCount.className = state.trippedCount > 0 ? "badge badge-red" : "badge badge-gray";
    }
    if (elErtDisplay) {
      elErtDisplay.textContent = state.trippedCount > 0 ? `ERT: ${state.estimatedRestorationTime}` : "ERT: Normal";
      elErtDisplay.className = state.trippedCount > 0 ? "badge badge-amber" : "badge badge-blue";
    }
    if (elCurtailedMw) elCurtailedMw.textContent = `${state.totalCurtailedMw.toLocaleString()} MW`;
    if (elLoadShedMw) elLoadShedMw.textContent = `${state.totalLoadShedMw.toLocaleString()} MW`;
    if (elEconomicLoss) {
      const mPhp = state.hourlyEconomicLossPhp / 1e6;
      elEconomicLoss.textContent = `₱${mPhp.toFixed(2)}M/hr`;
    }

    if (outageBanner) {
      if (state.trippedCount > 0) {
        outageBanner.style.display = "flex";
        if (outageBannerText) {
          outageBannerText.textContent = `🚨 ${state.trippedCount} Line${state.trippedCount === 1 ? '' : 's'} Tripped (${state.totalLoadShedMw.toLocaleString()} MW Shed)`;
        }
      } else {
        outageBanner.style.display = "none";
      }
    }
  }

  function getRegionLabel(region) {
    if (region === "luzon") return "Luzon Grid";
    if (region === "visayas") return "Visayas Grid";
    if (region === "mindanao") return "Mindanao Grid";
    if (region === "offgrid") return "Off-Grid / SPUG Islands";
    return "All Grids";
  }

  // 12. Startup Brief: Only a brief summary of approaching scheduled maintenance
  function renderStartGompBrief() {
    const panelTitle = document.getElementById("results-panel-title");
    if (panelTitle) panelTitle.textContent = "🗓️ Scheduled Maintenance Brief (DOE GOMP)";

    const today = new Date("2026-10-19");
    let approaching = gompSchedule.filter(item => {
      const s = new Date(item.startDate);
      const e = new Date(item.endDate);
      const days = Math.ceil((s.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return (days >= 0 && days <= 14) || (today >= s && today <= e);
    });

    if (engine.activeRegion !== "all") {
      approaching = approaching.filter(item => item.region === engine.activeRegion);
    }

    approaching.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    if (searchCountBadge) {
      searchCountBadge.textContent = `${approaching.length} Approaching`;
      searchCountBadge.className = "badge badge-amber";
    }

    let itemsHtml = "";
    if (approaching.length === 0) {
      itemsHtml = `
        <div class="empty-start-brief">
          <span style="font-size: 20px;">✅</span>
          <div style="font-size: 11.5px; font-weight: 700; color: var(--text-primary); margin-top: 4px;">No Approaching Outages in ${getRegionLabel(engine.activeRegion)}</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">No coordinated plant or line maintenance scheduled within the next 14 days.</div>
        </div>
      `;
    } else {
      itemsHtml = approaching.map(item => {
        const s = new Date(item.startDate);
        const e = new Date(item.endDate);
        const days = Math.ceil((s.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const isActive = today >= s && today <= e;
        
        let badgeHtml = "";
        if (isActive) {
          badgeHtml = `<span class="badge badge-red gomp-countdown-badge">🔴 ACTIVE TODAY</span>`;
        } else {
          badgeHtml = `<span class="badge badge-amber gomp-countdown-badge">⚠️ In ${days} Day${days === 1 ? '' : 's'}</span>`;
        }

        const regionBadge = `<span class="badge badge-gray" style="font-size: 9px; text-transform: uppercase;">${item.region}</span>`;
        const typeIcon = item.type === 'plant' ? '🏭' : '⚡';

        return `
          <div class="start-brief-item" data-asset-id="${item.assetId}" data-asset-type="${item.type}">
            <div class="start-brief-top">
              <div class="start-brief-name">
                <span>${typeIcon}</span>
                <strong>${item.assetName}</strong>
                <span class="start-brief-unit">(${item.unit})</span>
              </div>
              <div style="display: flex; gap: 4px; align-items: center;">
                ${regionBadge}
                ${badgeHtml}
              </div>
            </div>
            <div class="start-brief-meta">
              <span>📅 <strong>${item.startDate}</strong> to <strong>${item.endDate}</strong></span>
              <span>•</span>
              <span class="text-red"><strong>-${item.capacityMw} MW</strong></span>
            </div>
            <div class="start-brief-desc">
              <strong>Scope:</strong> ${item.workType}. <em>${item.gridImpact}</em>
            </div>
          </div>
        `;
      }).join("");
    }

    searchResultsContainer.innerHTML = `
      <div class="start-brief-container">
        <div class="start-brief-header-row">
          <div>
            <div class="start-brief-lead">Upcoming Plant & Line Maintenance</div>
            <div class="start-brief-sub">Official DOE GOMP coordinated schedule • Next 14 Days (${getRegionLabel(engine.activeRegion)})</div>
          </div>
          <button id="btn-brief-open-cal" class="btn btn-primary-compact">📅 Calendar</button>
        </div>

        <div class="start-brief-list">
          ${itemsHtml}
        </div>

        <div class="start-brief-actions">
          <button id="btn-brief-view-all-cal" class="btn-brief-act-primary">📅 Open Full GOMP Calendar (${gompSchedule.length} Events)</button>
          <button id="btn-brief-save-json" class="btn-brief-act-secondary">💾 Save JSON</button>
        </div>

        <div class="start-brief-search-hint">
          <span style="font-size: 13px;">🔍</span>
          <div>
            <strong>Ready to simulate:</strong> Search any Distribution Utility (e.g. <em>Meralco, PALECO</em>), Power Plant (e.g. <em>Dinginin</em>), or Substation above to view single-line contingency tripping & dependency impacts.
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    const btnBriefOpenCal = document.getElementById("btn-brief-open-cal");
    const btnBriefViewAllCal = document.getElementById("btn-brief-view-all-cal");
    const btnBriefSaveJson = document.getElementById("btn-brief-save-json");

    if (btnBriefOpenCal) btnBriefOpenCal.addEventListener("click", openGompModal);
    if (btnBriefViewAllCal) btnBriefViewAllCal.addEventListener("click", openGompModal);
    if (btnBriefSaveJson) btnBriefSaveJson.addEventListener("click", exportGompJson);

    // Clicking an approaching brief item inspects/searches that asset
    const briefItems = searchResultsContainer.querySelectorAll(".start-brief-item");
    briefItems.forEach(el => {
      el.addEventListener("click", () => {
        const aId = el.getAttribute("data-asset-id");
        const aType = el.getAttribute("data-asset-type");
        const asset = aType === 'plant' ? GRID_TOPOLOGY.plants[aId] : GRID_TOPOLOGY.lines[aId];
        if (asset && searchInput) {
          searchInput.value = asset.name;
          if (btnClearSearch) btnClearSearch.style.display = "block";
          renderSearchResults(asset.name);
        }
      });
    });
  }

  // 13. Render Results & Bidirectional Cross-Impact
  function renderSearchResults(query) {
    if (!searchResultsContainer) return;
    const q = (query || "").trim();

    // Check if multi-dimensional filters are actively applied:
    const hasActiveFilters = (
      activeProvince !== "all" ||
      activeLineVoltage !== "all" ||
      activePlantCapacity !== "all" ||
      activeGridType !== "all" ||
      activeRegionFilter !== "all"
    );

    // When no search query, no lines tripped, filter is "all", and no advanced filters applied, show STARTUP BRIEF
    if (!q && engine.trippedLineIds.size === 0 && activeFilter === "all" && !hasActiveFilters) {
      renderStartGompBrief();
      return;
    }

    const panelTitle = document.getElementById("results-panel-title");
    let matchedLines = [];
    let matchedPlants = [];
    let matchedDUs = [];
    let matchedSubstations = [];

    if (!q) {
      if (engine.trippedLineIds.size > 0) {
        matchedLines = Array.from(engine.trippedLineIds).map(id => GRID_TOPOLOGY.lines[id]).filter(Boolean);
      } else {
        matchedLines = Object.values(GRID_TOPOLOGY.lines);
        matchedPlants = Object.values(GRID_TOPOLOGY.plants);
        matchedDUs = Object.values(GRID_TOPOLOGY.dus);
        matchedSubstations = engine.getSubstations();
      }
    } else {
      const searchRes = engine.searchEntity(q);
      matchedLines = searchRes.matchedLines;
      matchedPlants = searchRes.matchedPlants;
      matchedDUs = searchRes.matchedDUs;
      matchedSubstations = searchRes.matchedSubstations || [];
    }

    // 1. Filter: Grid System (On-Grid vs Off-Grid / SPUG)
    if (activeGridType === "ongrid") {
      matchedLines = matchedLines.filter(l => l.region !== "offgrid");
      matchedPlants = matchedPlants.filter(p => p.region !== "offgrid");
      matchedDUs = matchedDUs.filter(d => d.region !== "offgrid");
    } else if (activeGridType === "offgrid") {
      matchedLines = matchedLines.filter(l => l.region === "offgrid");
      matchedPlants = matchedPlants.filter(p => p.region === "offgrid");
      matchedDUs = matchedDUs.filter(d => d.region === "offgrid");
    }

    // 2. Filter: Regional Grid
    const effectiveRegion = activeRegionFilter !== "all" ? activeRegionFilter : engine.activeRegion;
    if (effectiveRegion !== "all") {
      matchedLines = matchedLines.filter(l => l.region === effectiveRegion);
      matchedPlants = matchedPlants.filter(p => p.region === effectiveRegion);
      matchedDUs = matchedDUs.filter(d => d.region === effectiveRegion);
    }

    // 3. Filter: Specific Province (e.g. "Cagayan" -> all DUs inside Cagayan: CAGELCO I & CAGELCO II)
    if (activeProvince !== "all") {
      const pLow = activeProvince.toLowerCase();
      matchedDUs = matchedDUs.filter(d => d.province && d.province.toLowerCase().includes(pLow));
      matchedPlants = matchedPlants.filter(p => p.province && p.province.toLowerCase().includes(pLow));
      matchedLines = matchedLines.filter(l => l.province && l.province.toLowerCase().includes(pLow));
      matchedSubstations = matchedSubstations.filter(s => {
        return matchedLines.some(l => l.substations && l.substations.includes(s.name));
      });
    }

    // 4. Filter: Transmission Line Size (Voltage)
    if (activeLineVoltage !== "all") {
      if (activeLineVoltage === "500") {
        matchedLines = matchedLines.filter(l => l.voltageKv === 500);
      } else if (activeLineVoltage === "230") {
        matchedLines = matchedLines.filter(l => l.voltageKv === 230);
      } else if (activeLineVoltage === "138") {
        matchedLines = matchedLines.filter(l => l.voltageKv === 138);
      } else if (activeLineVoltage === "hvdc") {
        matchedLines = matchedLines.filter(l => l.voltageKv === 450 || l.voltageKv === 350 || (l.circuitType && l.circuitType.toLowerCase().includes("hvdc")));
      } else if (activeLineVoltage === "69") {
        matchedLines = matchedLines.filter(l => l.voltageKv <= 69);
      }
    }

    // 5. Filter: Power Plant Size (Capacity MW)
    if (activePlantCapacity !== "all") {
      if (activePlantCapacity === "mega") {
        matchedPlants = matchedPlants.filter(p => p.capacityMw >= 1000);
      } else if (activePlantCapacity === "large") {
        matchedPlants = matchedPlants.filter(p => p.capacityMw >= 500 && p.capacityMw < 1000);
      } else if (activePlantCapacity === "medium") {
        matchedPlants = matchedPlants.filter(p => p.capacityMw >= 100 && p.capacityMw < 500);
      } else if (activePlantCapacity === "small") {
        matchedPlants = matchedPlants.filter(p => p.capacityMw < 100);
      }
    }

    // 6. Filter Chips
    if (activeFilter === "lines") {
      matchedPlants = [];
      matchedDUs = [];
      matchedSubstations = [];
    } else if (activeFilter === "plants") {
      matchedLines = [];
      matchedDUs = [];
      matchedSubstations = [];
    } else if (activeFilter === "dus") {
      matchedLines = [];
      matchedPlants = [];
      matchedSubstations = [];
    } else if (activeFilter === "subs") {
      matchedLines = [];
      matchedPlants = [];
      matchedDUs = [];
      matchedSubstations = engine.getSubstations().filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()));
    } else if (activeFilter === "gomp") {
      const gompAssetIds = new Set(gompSchedule.map(g => g.assetId));
      matchedLines = matchedLines.filter(l => gompAssetIds.has(l.id));
      matchedPlants = matchedPlants.filter(p => gompAssetIds.has(p.id));
      matchedDUs = [];
      matchedSubstations = [];
    } else if (activeFilter === "spug") {
      matchedLines = matchedLines.filter(l => l.region === "offgrid");
      matchedPlants = matchedPlants.filter(p => p.region === "offgrid");
      matchedDUs = matchedDUs.filter(d => d.region === "offgrid");
    }

    const totalCount = matchedLines.length + matchedPlants.length + matchedDUs.length + matchedSubstations.length;
    if (searchCountBadge) searchCountBadge.textContent = `${totalCount} Match${totalCount === 1 ? '' : 'es'}`;

    // Dynamic Title Update
    if (panelTitle) {
      if (activeProvince !== "all") {
        panelTitle.textContent = `📍 Province: ${activeProvince} (${matchedDUs.length} DUs, ${matchedPlants.length} Plants, ${matchedLines.length} Lines)`;
      } else if (hasActiveFilters) {
        panelTitle.textContent = `🔍 Filtered Grid Topology (${totalCount} Matches)`;
      } else if (q) {
        panelTitle.textContent = `🔍 Matches for "${q}" (${totalCount})`;
      } else {
        panelTitle.textContent = `📊 Contingency Impact & Dependencies`;
      }
    }

    if (totalCount === 0) {
      searchResultsContainer.innerHTML = `
        <div class="empty-results-box">
          <div style="font-size: 24px; margin-bottom: 4px;">🔍</div>
          <h4>No Grid Assets Found</h4>
          <p>Try searching for Meralco, Dinginin, Palawan, Hermosa, or open GOMP.</p>
        </div>
      `;
      return;
    }

    searchResultsContainer.innerHTML = "";
    const currentState = engine.calculateState();

    // A. TRANSMISSION LINES
    matchedLines.forEach(line => {
      const isTripped = engine.trippedLineIds.has(line.id);
      const card = document.createElement("div");
      card.className = `result-card ${isTripped ? 'is-tripped' : ''}`;

      const evacPlants = line.evacuatedPlants.map(pId => GRID_TOPOLOGY.plants[pId]).filter(Boolean);
      const fedDUs = line.fedDUs.map(dId => GRID_TOPOLOGY.dus[dId]).filter(Boolean);

      // Check GOMP status
      const gompEvents = gompSchedule.filter(g => g.assetId === line.id);
      let gompTagHtml = "";
      if (gompEvents.length > 0) {
        const ev = gompEvents[0];
        const days = getDaysUntil(ev.startDate);
        const alertLabel = days <= 0 ? "ACTIVE TODAY" : `In ${days}d`;
        gompTagHtml = `
          <div class="gomp-card-tag" title="DOE GOMP Maintenance Window">
            🛠️ <strong>GOMP:</strong> ${ev.workType} (${ev.startDate} to ${ev.endDate}) • <span class="badge ${days <= 0 ? 'badge-red' : 'badge-amber'}">${alertLabel}</span>
          </div>
        `;
      }

      // Check Parallel N-2 Overload
      let parallelOverloadHtml = "";
      if (isTripped && line.parallelLines) {
        const overloads = currentState.parallelOverloads.filter(p => p.trippedLine.id === line.id);
        if (overloads.length > 0) {
          parallelOverloadHtml = overloads.map(ov => `
            <div class="cascade-overload-box">
              <span style="font-size: 10px; color: #9A3412;">
                ⚠️ <strong>N-2 Risk:</strong> ${ov.parallelLine.name} shifted to <strong>${ov.loadPct}% load</strong> (${ov.totalLoadingMva} MVA)
              </span>
              <button class="btn-cascade-trip" data-trip-parallel="${ov.parallelLine.id}">⚡ Trip N-2</button>
            </div>
          `).join("");
        }
      }

      card.innerHTML = `
        <div class="result-header">
          <div style="flex: 1;">
            <div class="result-badge-row">
              <span class="result-type-badge type-line">⚡ TRANSMISSION LINE</span>
              <span class="badge ${line.voltageKv >= 500 ? 'badge-red' : line.voltageKv >= 230 ? 'badge-blue' : 'badge-amber'}">${line.voltageKv} kV</span>
              ${line.isRadial ? '<span class="badge badge-amber">RADIAL SPOF</span>' : '<span class="badge badge-green">N-1 LOOP</span>'}
            </div>
            <h3 class="result-name">${line.name}</h3>
            <div class="result-sub-detail">📍 ${line.substations.join(' ➔ ')}</div>
          </div>
          <button class="btn btn-trip-toggle ${isTripped ? 'btn-trip-active' : 'btn-trip-idle'}" data-line-id="${line.id}">
            ${isTripped ? '🔴 TRIPPED (RESTORE)' : '⚡ TRIP LINE'}
          </button>
        </div>

        ${gompTagHtml}

        <p style="font-size: 11px; color: var(--text-secondary); line-height: 1.35; margin: 2px 0;">${line.description}</p>

        <!-- BIDIRECTIONAL IMPACT GRID -->
        <div class="impact-grid-cols">
          <div class="impact-box">
            <div class="impact-box-title">
              <span>🏭 AFFECTED PLANTS (${evacPlants.length})</span>
              <span style="color: var(--brand-red); font-weight: 800;">-${line.curtailedCapacityMw} MW</span>
            </div>
            <div class="entity-pill-list">
              ${evacPlants.length > 0 ? evacPlants.map(p => `
                <div class="tag-pill tag-plant" data-pivot-type="plant" data-pivot-id="${p.id}" title="Tap to inspect ${p.name}">
                  🏭 ${p.name} (${p.capacityMw} MW)
                </div>
              `).join('') : '<span style="font-size: 9.5px; color: var(--text-muted);">No major generation stranded</span>'}
            </div>
          </div>

          <div class="impact-box">
            <div class="impact-box-title">
              <span>🏢 FED DUS / CO-OPS (${fedDUs.length})</span>
              <span style="color: var(--brand-amber); font-weight: 800;">${line.isRadial ? '100% BLACKOUT' : 'ALD DERATED'}</span>
            </div>
            <div class="entity-pill-list">
              ${fedDUs.length > 0 ? fedDUs.map(d => `
                <div class="tag-pill tag-du ${isTripped ? 'shed-blackout' : ''}" data-pivot-type="du" data-pivot-id="${d.id}" title="Tap to inspect ${d.name}">
                  🏢 ${d.name} (${d.peakDemandMw} MW)
                </div>
              `).join('') : '<span style="font-size: 9.5px; color: var(--text-muted);">No direct DU feed</span>'}
            </div>
          </div>
        </div>

        ${parallelOverloadHtml}

        ${isTripped ? `
          <div style="font-size: 10px; color: var(--brand-red); font-weight: 600; padding: 4px 6px; background: rgba(220, 38, 38, 0.08); border-radius: 4px;">
            ⚠️ N-1 ANALYSIS: ${line.nMinusOneAnalysis}
          </div>
          <div style="font-size: 9.5px; color: var(--text-muted);">
            ⏱️ <strong>Estimated Restoration Time:</strong> ${line.isRadial ? '2.5 - 4.5 hrs (Patrol & SPUG Blackstart)' : '20 - 45 mins (SCADA Automated Reclosure)'}
          </div>
        ` : ''}
      `;

      card.querySelector("[data-line-id]").addEventListener("click", () => {
        engine.toggleLine(line.id);
        updateUrlHash();
      });

      card.querySelectorAll("[data-trip-parallel]").forEach(btnP => {
        btnP.addEventListener("click", () => {
          const targetId = btnP.dataset.tripParallel;
          engine.tripLine(targetId);
          showToast(`⚡ Cascading Outage Triggered: Tripped ${GRID_TOPOLOGY.lines[targetId]?.name || targetId}`);
          updateUrlHash();
        });
      });

      searchResultsContainer.appendChild(card);
    });

    // B. POWER PLANTS
    matchedPlants.forEach(plant => {
      const card = document.createElement("div");
      card.className = "result-card";

      const primaryLines = plant.primaryLines.map(lId => GRID_TOPOLOGY.lines[lId]).filter(Boolean);
      const primaryDUs = plant.primaryDUs.map(dId => GRID_TOPOLOGY.dus[dId]).filter(Boolean);

      // Check GOMP status
      const gompEvents = gompSchedule.filter(g => g.assetId === plant.id);
      let gompTagHtml = "";
      if (gompEvents.length > 0) {
        const ev = gompEvents[0];
        const days = getDaysUntil(ev.startDate);
        const alertLabel = days <= 0 ? "ACTIVE TODAY" : `In ${days}d`;
        gompTagHtml = `
          <div class="gomp-card-tag" title="DOE GOMP Maintenance Window">
            🛠️ <strong>GOMP:</strong> ${ev.unit} - ${ev.workType} (${ev.startDate} to ${ev.endDate}) • <span class="badge ${days <= 0 ? 'badge-red' : 'badge-amber'}">${alertLabel}</span>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="result-header">
          <div>
            <div class="result-badge-row">
              <span class="result-type-badge type-plant">🏭 POWER PLANT</span>
              <span class="badge badge-amber">${plant.fuelType}</span>
              <span class="badge badge-gray">${plant.capacityMw} MW</span>
            </div>
            <h3 class="result-name">${plant.name}</h3>
            <div class="result-sub-detail">📍 ${plant.location} • Owner: ${plant.owner}</div>
          </div>
        </div>

        ${gompTagHtml}

        <p style="font-size: 11px; color: var(--text-secondary); line-height: 1.35; margin: 2px 0;">${plant.description}</p>

        <div class="impact-grid-cols">
          <div class="impact-box">
            <div class="impact-box-title">
              <span>⚡ EVACUATION LINES (${primaryLines.length})</span>
            </div>
            <div class="entity-pill-list">
              ${primaryLines.map(l => `
                <div class="tag-pill tag-line" data-pivot-type="line" data-pivot-id="${l.id}" title="Tap to inspect ${l.name}">
                  ⚡ ${l.name} (${l.voltageKv}kV)
                </div>
              `).join('')}
            </div>
          </div>

          <div class="impact-box">
            <div class="impact-box-title">
              <span>🏢 SUPPLIED DUS (${primaryDUs.length})</span>
            </div>
            <div class="entity-pill-list">
              ${primaryDUs.map(d => `
                <div class="tag-pill tag-du" data-pivot-type="du" data-pivot-id="${d.id}" title="Tap to inspect ${d.name}">
                  🏢 ${d.name} (${d.peakDemandMw} MW)
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      searchResultsContainer.appendChild(card);
    });

    // C. DISTRIBUTION UTILITIES
    matchedDUs.forEach(du => {
      const card = document.createElement("div");
      card.className = "result-card";

      const feedingLines = du.feedingLines.map(lId => GRID_TOPOLOGY.lines[lId]).filter(Boolean);
      const supplyingPlants = du.supplyingPlants.map(pId => GRID_TOPOLOGY.plants[pId]).filter(Boolean);
      const isBlackedOut = feedingLines.some(l => engine.trippedLineIds.has(l.id) && (l.isRadial || du.feedingLines.every(flId => engine.trippedLineIds.has(flId))));

      card.innerHTML = `
        <div class="result-header">
          <div>
            <div class="result-badge-row">
              <span class="result-type-badge type-du">🏢 DISTRIBUTION UTILITY</span>
              <span class="badge ${isBlackedOut ? 'badge-red' : 'badge-green'}">${isBlackedOut ? '🚨 OUTAGE / BLACKOUT' : '● ENERGIZED'}</span>
              <span class="badge badge-gray">${du.peakDemandMw} MW Peak</span>
            </div>
            <h3 class="result-name">${du.name}</h3>
            <div class="result-sub-detail">📍 Substations: ${du.deliverySubstations.join(', ')} • ${du.customerCount ? (du.customerCount/1e3).toFixed(0) + 'k Customers' : ''}</div>
          </div>
        </div>

        <p style="font-size: 11px; color: var(--text-secondary); line-height: 1.35; margin: 2px 0;">${du.description}</p>

        <div class="impact-grid-cols">
          <div class="impact-box">
            <div class="impact-box-title">
              <span>⚡ FEEDING LINES (${feedingLines.length})</span>
            </div>
            <div class="entity-pill-list">
              ${feedingLines.map(l => {
                const lineTripped = engine.trippedLineIds.has(l.id);
                return `
                  <div class="tag-pill tag-line ${lineTripped ? 'shed-blackout' : ''}" data-pivot-type="line" data-pivot-id="${l.id}" title="Tap to inspect ${l.name}">
                    ${lineTripped ? '🔴' : '⚡'} ${l.name} (${l.voltageKv}kV)
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="impact-box" style="grid-column: span 2;">
            <div class="impact-box-title">
              <span>🏭 CONTRACTED POWER PLANTS (ERC URR Generation Mix)</span>
              <span class="badge badge-blue" style="font-size: 9px;">${supplyingPlants.length} Plants</span>
            </div>
            <div class="entity-pill-list" style="margin-bottom: 6px;">
              ${supplyingPlants.length > 0 ? supplyingPlants.map(p => `
                <div class="tag-pill tag-plant" data-pivot-type="plant" data-pivot-id="${p.id}" title="Tap to inspect ${p.name}">
                  🏭 ${p.name} (${p.capacityMw} MW • ${p.fuelType})
                </div>
              `).join('') : '<span style="font-size: 9.5px; color: var(--text-muted);">Supplied via Regional WESM Pool</span>'}
            </div>

            ${du.urrSuppliers && du.urrSuppliers.length > 0 ? `
              <div class="urr-supplier-box" style="font-size: 9.5px; color: var(--text-secondary); background: var(--bg-subtle); padding: 6px 8px; border-radius: 4px; border-left: 3px solid var(--brand-blue); margin-top: 4px;">
                <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
                  <span>📋</span> <span>Verified ERC URR Power Supply Agreements (PSAs):</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  ${du.urrSuppliers.map(s => `<div>• <strong>${s}</strong></div>`).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;

      searchResultsContainer.appendChild(card);
    });

    // D. SUBSTATIONS
    matchedSubstations.forEach(sub => {
      const card = document.createElement("div");
      card.className = "result-card";

      const connLines = sub.connectedLines.map(lId => GRID_TOPOLOGY.lines[lId]).filter(Boolean);
      const connPlants = sub.connectedPlants.map(pId => GRID_TOPOLOGY.plants[pId]).filter(Boolean);
      const connDUs = sub.connectedDUs.map(dId => GRID_TOPOLOGY.dus[dId]).filter(Boolean);

      card.innerHTML = `
        <div class="result-header">
          <div>
            <div class="result-badge-row">
              <span class="result-type-badge type-sub">⚡ SUBSTATION</span>
              <span class="badge badge-purple">${sub.voltageKv} kV Bus</span>
              <span class="badge badge-gray">${connLines.length} Lines</span>
            </div>
            <h3 class="result-name">${sub.name}</h3>
            <div class="result-sub-detail">Transmission Grid Delivery Substation & Busbar</div>
          </div>
          <button class="btn btn-trip-toggle btn-trip-idle" data-trip-all-sub="${sub.name}" title="Simulate bus fault by tripping all terminating lines">
            ⚡ BUS FAULT
          </button>
        </div>

        <div class="impact-grid-cols">
          <div class="impact-box">
            <div class="impact-box-title">
              <span>⚡ TERMINATING LINES (${connLines.length})</span>
            </div>
            <div class="entity-pill-list">
              ${connLines.map(l => {
                const lineTripped = engine.trippedLineIds.has(l.id);
                return `
                  <div class="tag-pill tag-line ${lineTripped ? 'shed-blackout' : ''}" data-pivot-type="line" data-pivot-id="${l.id}">
                    ${lineTripped ? '🔴' : '⚡'} ${l.name}
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="impact-box">
            <div class="impact-box-title">
              <span>🏢 FED DUS (${connDUs.length})</span>
            </div>
            <div class="entity-pill-list">
              ${connDUs.map(d => `
                <div class="tag-pill tag-du" data-pivot-type="du" data-pivot-id="${d.id}">
                  🏢 ${d.name}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      card.querySelector("[data-trip-all-sub]").addEventListener("click", () => {
        connLines.forEach(l => engine.tripLine(l.id));
        showToast(`💥 Substation Bus Fault Simulated: Tripped all ${connLines.length} terminating lines at ${sub.name}!`);
        updateUrlHash();
      });

      searchResultsContainer.appendChild(card);
    });

    // Pivot Tag Listeners
    document.querySelectorAll("[data-pivot-type]").forEach(pill => {
      pill.addEventListener("click", () => {
        const type = pill.dataset.pivotType;
        const id = pill.dataset.pivotId;
        let targetName = "";

        if (type === "line") targetName = GRID_TOPOLOGY.lines[id]?.name || id;
        else if (type === "plant") targetName = GRID_TOPOLOGY.plants[id]?.name || id;
        else if (type === "du") targetName = GRID_TOPOLOGY.dus[id]?.name || id;

        if (targetName) {
          selectAutoFill(targetName);
          window.scrollTo({ top: 120, behavior: "smooth" });
        }
      });
    });
  }

  // Initial Boot
  updateGompBadges();
  populateProvinceDropdown();
  loadFromUrlHash();
  renderSearchResults(searchInput ? searchInput.value : "");
});
