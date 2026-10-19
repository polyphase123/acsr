// ============================================================================
// PHILGRID N-1 CONTINGENCY & TRANSMISSION LOAD FLOW ENGINE
// Mathematical Simulation of Line Outages, Power Plant Curailment & DU Brownouts
// Authored by Franz Xyrlo Tobias, PEE
// ============================================================================

class GridContingencyEngine {
  constructor(topology) {
    this.topology = topology;
    this.trippedLineIds = new Set();
    this.trippedPlantIds = new Set();
    this.audioCtx = null;
    this.audioEnabled = true;
    this.activeRegion = "all"; // 'all', 'luzon', 'visayas', 'mindanao'
    this.listeners = [];
  }

  // Subscribe to state changes
  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify() {
    const state = this.calculateState();
    this.listeners.forEach(cb => cb(state));
  }

  // Set active region filter
  setRegion(region) {
    this.activeRegion = region;
    this.notify();
  }

  // Audio synthesizer via Web Audio API (No external sound files required)
  initAudio() {
    if (typeof window === "undefined") return;
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    return this.audioEnabled;
  }

  playTripSound() {
    if (!this.audioEnabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      
      // Substation heavy relay contactor thud
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(140, now);
      osc1.frequency.exponentialRampToValueAtTime(30, now + 0.18);
      gain1.gain.setValueAtTime(0.7, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.22);

      // High voltage spark / discharge burst
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = "square";
      osc2.frequency.setValueAtTime(800, now + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(120, now + 0.15);
      gain2.gain.setValueAtTime(0.3, now + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.18);
    } catch (e) {
      console.warn("Audio play error", e);
    }
  }

  playRestoreSound() {
    if (!this.audioEnabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      [440, 554.37, 659.25, 880].forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.2, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.3);
      });
    } catch (e) {
      console.warn("Audio play error", e);
    }
  }

  // Toggle transmission line trip/restore
  toggleLine(lineId) {
    if (this.trippedLineIds.has(lineId)) {
      this.trippedLineIds.delete(lineId);
      this.playRestoreSound();
    } else {
      this.trippedLineIds.add(lineId);
      this.playTripSound();
    }
    this.notify();
  }

  tripLine(lineId) {
    if (!this.trippedLineIds.has(lineId)) {
      this.trippedLineIds.add(lineId);
      this.playTripSound();
      this.notify();
    }
  }

  restoreLine(lineId) {
    if (this.trippedLineIds.has(lineId)) {
      this.trippedLineIds.delete(lineId);
      this.playRestoreSound();
      this.notify();
    }
  }

  restoreAll() {
    const hadOutage = this.trippedLineIds.size > 0 || this.trippedPlantIds.size > 0;
    this.trippedLineIds.clear();
    this.trippedPlantIds.clear();
    if (hadOutage) {
      this.playRestoreSound();
    }
    this.notify();
  }

  tripRandomLine() {
    const lineKeys = Object.keys(this.topology.lines).filter(id => {
      if (this.activeRegion === "all") return true;
      const l = this.topology.lines[id];
      return l.region === this.activeRegion;
    });
    if (lineKeys.length === 0) return;
    const available = lineKeys.filter(id => !this.trippedLineIds.has(id));
    if (available.length > 0) {
      const chosen = available[Math.floor(Math.random() * available.length)];
      this.tripLine(chosen);
    } else {
      this.restoreAll();
    }
  }

  // Calculate Comprehensive Grid State (N-1 Contingency Analysis)
  calculateState() {
    const lines = this.topology.lines;
    const plants = this.topology.plants;
    const dus = this.topology.dus;

    let totalCurtailedMw = 0;
    let totalLoadShedMw = 0;
    let totalCustomersAffected = 0;

    const affectedPlants = new Map(); // plantId -> { plant, reason, curtailedMw, isTotalTrip }
    const affectedDUs = new Map();     // duId -> { du, reason, shedMw, severity, customerImpact }

    // Evaluate each tripped line
    this.trippedLineIds.forEach(lineId => {
      const line = lines[lineId];
      if (!line) return;

      // 1. Check evacuated power plants
      line.evacuatedPlants.forEach(plantId => {
        const plant = plants[plantId];
        if (!plant) return;

        // Check if plant has alternative evacuation lines still in service
        const otherLinesInService = plant.primaryLines.filter(plId => plId !== lineId && !this.trippedLineIds.has(plId));

        let curtailedMw = 0;
        let isTotalTrip = false;
        let reason = "";

        if (otherLinesInService.length === 0) {
          // Total evacuation bottleneck / Islanding
          curtailedMw = plant.dependableMw;
          isTotalTrip = true;
          reason = `Isolated by outage of ${line.name}. No remaining active evacuation paths. Full unit shutdown.`;
        } else {
          // Derated due to N-1 line capacity limit
          curtailedMw = Math.round(plant.dependableMw * 0.45);
          isTotalTrip = false;
          reason = `Evacuation derated by 45% due to thermal limits on remaining path (${otherLinesInService.map(id => lines[id]?.name || id).join(", ")}).`;
        }

        const existing = affectedPlants.get(plantId);
        if (!existing || curtailedMw > existing.curtailedMw) {
          affectedPlants.set(plantId, { plant, reason, curtailedMw, isTotalTrip });
        }
      });

      // 2. Check fed Distribution Utilities (Load Shed / Brownouts)
      line.fedDUs.forEach(duId => {
        const du = dus[duId];
        if (!du) return;

        const otherFeedersInService = du.feedingLines.filter(flId => flId !== lineId && !this.trippedLineIds.has(flId));

        let shedMw = 0;
        let severity = "MODERATE";
        let reason = "";
        let pctShed = 0;

        if (line.isRadial || otherFeedersInService.length === 0) {
          // Radial line failure: Total DU Blackout
          pctShed = 1.0;
          shedMw = du.peakDemandMw;
          severity = "BLACKOUT";
          reason = `Radial delivery corridor tripped (${line.name}). Complete loss of grid power injection to ${du.name}.`;
        } else {
          // Loop / Networked N-1: Parallel line overloaded
          pctShed = 0.40;
          shedMw = Math.round(du.peakDemandMw * 0.40);
          severity = "ROTATIONAL SHED";
          reason = `Delivery capacity constrained after trip of ${line.name}. Automatic Load Dropping (ALD) Stage 1 armed to protect parallel circuits.`;
        }

        const customerImpact = Math.round(du.customerCount * pctShed);

        const existing = affectedDUs.get(duId);
        if (!existing || shedMw > existing.shedMw) {
          affectedDUs.set(duId, { du, reason, shedMw, severity, customerImpact, pctShed });
        }
      });
    });

    // Sum totals
    affectedPlants.forEach(item => {
      totalCurtailedMw += item.curtailedMw;
    });

    affectedDUs.forEach(item => {
      totalLoadShedMw += item.shedMw;
      totalCustomersAffected += item.customerImpact;
    });

    // Economic calculation
    // Average Cost of Unserved Energy / VOLL = ₱25,000 / MWh + Generation Loss
    const hourlyEconomicLossPhp = (totalLoadShedMw * 25000) + (totalCurtailedMw * 6500);

    // RoCoF estimation: RoCoF = (Delta_P / (2 * H * S_base)) * f0
    // Luzon: H ~ 4.5s, S_base ~ 10,000 MVA, f0 = 60.0 Hz
    let rocofHzPerSec = 0;
    let frequencyDeviationHz = 0;
    let estimatedSystemFreqHz = 60.0;

    if (totalCurtailedMw > 0) {
      rocofHzPerSec = (totalCurtailedMw / (2 * 4.5 * 10000)) * 60.0;
      // Frequency nadir approximation
      frequencyDeviationHz = Math.min(1.2, rocofHzPerSec * 1.5 + (totalCurtailedMw / 15000));
      estimatedSystemFreqHz = Math.max(58.80, 60.0 - frequencyDeviationHz);
    }

    // 3. Parallel Lines Overload & N-2 Cascade Risk
    const parallelOverloads = [];
    this.trippedLineIds.forEach(lineId => {
      const line = lines[lineId];
      if (!line || !line.parallelLines) return;
      line.parallelLines.forEach(pLineId => {
        const pLine = lines[pLineId];
        if (!pLine) return;
        const isAlsoTripped = this.trippedLineIds.has(pLineId);
        if (!isAlsoTripped) {
          const shiftedFlowMva = Math.round((line.normalCapacityMva * 0.70) / (line.parallelLines.length || 1));
          const baseLoadingMva = Math.round(pLine.normalCapacityMva * 0.65);
          const totalLoadingMva = baseLoadingMva + shiftedFlowMva;
          const loadPct = Math.round((totalLoadingMva / pLine.normalCapacityMva) * 100);
          parallelOverloads.push({
            trippedLine: line,
            parallelLine: pLine,
            shiftedFlowMva,
            totalLoadingMva,
            loadPct,
            isEmergency: loadPct >= 100
          });
        }
      });
    });

    // 4. Estimated Restoration Time (ERT) & Blackstart Strategy
    let estimatedRestorationTime = "15 - 35 mins";
    let blackstartStrategy = "Automated SCADA reclosing relay sequence under N-1 loop protection.";
    let hasRadialOutage = false;

    this.trippedLineIds.forEach(lineId => {
      const l = lines[lineId];
      if (l && l.isRadial) {
        hasRadialOutage = true;
        estimatedRestorationTime = "2.5 - 4.5 hrs";
        blackstartStrategy = "Line patrol & fault isolation ➔ Cranking diesel peaker units ➔ Island micro-grid synchronizing ➔ Stepwise DU load restoration.";
      }
    });

    // Grid Status Badge
    let statusBadge = { text: "● ALL LINES HEALTHY", class: "badge-green", state: "NORMAL" };
    if (this.trippedLineIds.size > 0) {
      if (totalLoadShedMw > 1000 || totalCurtailedMw > 1500 || hasRadialOutage) {
        statusBadge = { text: "🚨 RED ALERT: BLACKOUT", class: "badge-red", state: "BLACKOUT" };
      } else if (totalLoadShedMw > 200 || totalCurtailedMw > 500 || parallelOverloads.some(p => p.isEmergency)) {
        statusBadge = { text: "⚠️ YELLOW ALERT: N-1 VIOLATION", class: "badge-amber", state: "CONTINGENCY" };
      } else {
        statusBadge = { text: "● N-1 SECURE (DERATED)", class: "badge-blue", state: "DERATED" };
      }
    }

    return {
      trippedLineIds: Array.from(this.trippedLineIds),
      trippedCount: this.trippedLineIds.size,
      totalCurtailedMw,
      totalLoadShedMw,
      totalCustomersAffected,
      hourlyEconomicLossPhp,
      rocofHzPerSec,
      estimatedSystemFreqHz,
      estimatedRestorationTime,
      blackstartStrategy,
      parallelOverloads,
      statusBadge,
      affectedPlants: Array.from(affectedPlants.values()),
      affectedDUs: Array.from(affectedDUs.values())
    };
  }

  // Get all indexed Substations
  getSubstations() {
    if (this._substationsCache) return this._substationsCache;
    const subMap = new Map();
    Object.values(this.topology.lines).forEach(line => {
      line.substations.forEach(subName => {
        if (!subMap.has(subName)) {
          subMap.set(subName, {
            name: subName,
            voltageKv: line.voltageKv,
            region: line.region,
            connectedLines: [],
            connectedPlants: [],
            connectedDUs: []
          });
        }
        const sObj = subMap.get(subName);
        if (!sObj.connectedLines.includes(line.id)) sObj.connectedLines.push(line.id);
        line.evacuatedPlants.forEach(pId => {
          if (!sObj.connectedPlants.includes(pId)) sObj.connectedPlants.push(pId);
        });
        line.fedDUs.forEach(dId => {
          if (!sObj.connectedDUs.includes(dId)) sObj.connectedDUs.push(dId);
        });
      });
    });
    this._substationsCache = Array.from(subMap.values());
    return this._substationsCache;
  }

  // Query engine for Search Functionality
  searchEntity(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) return { type: "empty", query: "", totalMatches: 0, matchedLines: [], matchedPlants: [], matchedDUs: [] };

    const lines = Object.values(this.topology.lines);
    const plants = Object.values(this.topology.plants);
    const dus = Object.values(this.topology.dus);

    // 1. Check exact or fuzzy match in Transmission Lines
    const matchedLines = lines.filter(l => 
      l.name.toLowerCase().includes(q) ||
      l.id.toLowerCase().includes(q) ||
      (l.province && l.province.toLowerCase().includes(q)) ||
      (l.region && l.region.toLowerCase().includes(q)) ||
      (l.description && l.description.toLowerCase().includes(q)) ||
      (l.circuitType && l.circuitType.toLowerCase().includes(q)) ||
      l.substations.some(s => s.toLowerCase().includes(q)) ||
      `${l.voltageKv}kv`.includes(q) ||
      `${l.voltageKv} kv`.includes(q)
    );

    // 2. Check match in Power Plants
    const matchedPlants = plants.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.owner.toLowerCase().includes(q) ||
      p.fuelType.toLowerCase().includes(q) ||
      (p.province && p.province.toLowerCase().includes(q)) ||
      (p.region && p.region.toLowerCase().includes(q)) ||
      (p.location && p.location.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );

    // 3. Check match in Distribution Utilities
    const matchedDUs = dus.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q) ||
      (d.province && d.province.toLowerCase().includes(q)) ||
      (d.region && d.region.toLowerCase().includes(q)) ||
      (d.franchiseArea && d.franchiseArea.toLowerCase().includes(q)) ||
      (d.description && d.description.toLowerCase().includes(q)) ||
      d.deliverySubstations.some(s => s.toLowerCase().includes(q)) ||
      (d.urrSuppliers && d.urrSuppliers.some(s => s.toLowerCase().includes(q)))
    );

    // 4. Check match in Substations
    const substations = this.getSubstations();
    const matchedSubstations = substations.filter(s =>
      s.name.toLowerCase().includes(q) ||
      `${s.voltageKv}kv`.includes(q) ||
      `${s.voltageKv} kv`.includes(q)
    );

    return {
      query,
      matchedLines,
      matchedPlants,
      matchedDUs,
      matchedSubstations,
      totalMatches: matchedLines.length + matchedPlants.length + matchedDUs.length + matchedSubstations.length
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GridContingencyEngine };
}
