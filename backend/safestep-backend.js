// ============================================================
// SafeStep Backend — Low Fidelity Prototype
// ============================================================
// Exposes a single global object: SafeStep
// Frontend calls SafeStep.init() to start everything.
// ============================================================

const SafeStep = (() => {

  // ----------------------------------------------------------
  // MODULE 1: HAPTIC MOTOR CONTROLLER
  // Vibration pattern library. All durations in milliseconds.
  // ----------------------------------------------------------
  const Haptic = {
    patterns: {
      stop:        [800],                   // long rumble — solid wall dead ahead
      leftPulse:   [150, 80, 150],          // double tap — obstacle on the left
      rightPulse:  [300, 80, 150],          // reversed double tap — obstacle on the right
      centerWarn:  [200, 100, 200, 100, 200], // rapid triple — object straight ahead, mid-range
      emergency:   [1000, 200, 1000, 200, 1000], // three long bursts — band disconnected
      lowBattery:  [100, 50, 100],          // light double — band battery warning
      connected:   [150],                   // single short — band just connected
    },

    fire(patternName) {
      const pattern = this.patterns[patternName];
      if (!pattern) {
        console.warn(`[Haptic] Unknown pattern: "${patternName}"`);
        return;
      }
      if (!('vibrate' in navigator)) {
        console.log(`[Haptic] Vibration not supported. Would fire: "${patternName}"`, pattern);
        return;
      }
      navigator.vibrate(pattern);
      console.log(`[Haptic] Fired: "${patternName}"`, pattern);
    },
  };


  // ----------------------------------------------------------
  // MODULE 2: MEMORY BANK (localStorage)
  // Persists user preferences across sessions.
  // ----------------------------------------------------------
  const Memory = {
    save(key, value) {
      try {
        localStorage.setItem(`safestep_${key}`, JSON.stringify(value));
      } catch (e) {
        console.error('[Memory] Failed to save:', key, e);
      }
    },

    load(key, defaultValue = null) {
      try {
        const raw = localStorage.getItem(`safestep_${key}`);
        return raw !== null ? JSON.parse(raw) : defaultValue;
      } catch (e) {
        console.error('[Memory] Failed to load:', key, e);
        return defaultValue;
      }
    },

    clear(key) {
      localStorage.removeItem(`safestep_${key}`);
    },
  };


  // ----------------------------------------------------------
  // MODULE 3: SENSOR SIMULATOR
  // Generates fake distance/direction/object data since there
  // is no real LiDAR sensor. Fires a callback every 600ms.
  // ----------------------------------------------------------
  const Sensor = {
    _intervalId: null,
    _callback: null,

    directions: ['LEFT', 'RIGHT', 'CENTER'],
    objectTypes: ['WALL', 'PILLAR', 'PERSON', 'FURNITURE'],

    start(callback) {
      if (this._intervalId) this.stop(); // prevent duplicate intervals
      this._callback = callback;

      this._intervalId = setInterval(() => {
        const data = {
          distance: parseFloat((Math.random() * 5).toFixed(2)), // 0.00 – 5.00 metres
          direction: this.directions[Math.floor(Math.random() * this.directions.length)],
          objectType: this.objectTypes[Math.floor(Math.random() * this.objectTypes.length)],
          timestamp: Date.now(),
        };
        console.log('[Sensor] Reading:', data);
        if (this._callback) this._callback(data);
      }, 600);

      console.log('[Sensor] Simulator started.');
    },

    stop() {
      clearInterval(this._intervalId);
      this._intervalId = null;
      console.log('[Sensor] Simulator stopped.');
    },
  };


  // ----------------------------------------------------------
  // MODULE 4: NAVIGATION LOGIC ENGINE
  // Receives sensor data, reads Crowd Mode from Memory,
  // decides which haptic pattern to fire.
  // ----------------------------------------------------------
  const Navigation = {
    crowdMode: false,

    // Thresholds in metres
    DANGER_ZONE:  1.0,
    WARNING_ZONE: 3.0,

    setCrowdMode(isOn) {
      this.crowdMode = isOn;
      Memory.save('crowdMode', isOn);
      console.log(`[Navigation] Crowd Mode: ${isOn ? 'ON' : 'OFF'}`);
    },

    process(sensorData) {
      const { distance, direction, objectType } = sensorData;

      // In Crowd Mode: ignore people entirely, only react to solid objects
      if (this.crowdMode && objectType === 'PERSON') {
        console.log('[Navigation] Crowd Mode — ignoring person.');
        return;
      }

      // DANGER ZONE (< 1m) — stop immediately regardless of direction
      if (distance < this.DANGER_ZONE) {
        Haptic.fire('stop');
        return;
      }

      // WARNING ZONE (1m – 3m) — directional pulses
      if (distance < this.WARNING_ZONE) {
        if (direction === 'LEFT')   { Haptic.fire('leftPulse');  return; }
        if (direction === 'RIGHT')  { Haptic.fire('rightPulse'); return; }
        if (direction === 'CENTER') { Haptic.fire('centerWarn'); return; }
      }

      // Beyond 3m — clear path, no vibration
      console.log('[Navigation] Path clear.');
    },
  };


  // ----------------------------------------------------------
  // MODULE 5: CONNECTIVITY & BATTERY WATCHDOG
  // Simulates a Bluetooth heartbeat from the band.
  // Fires emergency haptic if signal drops for > 5 seconds.
  // ----------------------------------------------------------
  const Watchdog = {
    _intervalId: null,
    _lastHeartbeat: null,
    _onStatusChange: null, // callback → frontend updates UI
    TIMEOUT_MS: 5000,      // 5 seconds without heartbeat = disconnected

    start(onStatusChange) {
      this._onStatusChange = onStatusChange;
      this._lastHeartbeat = Date.now();

      // Simulate band sending a heartbeat every 2 seconds
      this._simulateHeartbeats();

      // Check the heartbeat every 1 second
      this._intervalId = setInterval(() => this._check(), 1000);
      console.log('[Watchdog] Started.');
    },

    stop() {
      clearInterval(this._intervalId);
      this._intervalId = null;
      console.log('[Watchdog] Stopped.');
    },

    // Called whenever a real (or simulated) heartbeat arrives
    receiveHeartbeat(data = {}) {
      this._lastHeartbeat = Date.now();
      const battery = data.batteryPercent ?? 90;

      console.log(`[Watchdog] Heartbeat received. Battery: ${battery}%`);

      if (battery < 20) {
        Haptic.fire('lowBattery');
        if (this._onStatusChange) this._onStatusChange('low_battery', battery);
      }
    },

    _check() {
      const elapsed = Date.now() - this._lastHeartbeat;
      if (elapsed > this.TIMEOUT_MS) {
        console.warn('[Watchdog] Band disconnected! No heartbeat for 5s.');
        Haptic.fire('emergency');
        Sensor.stop(); // stop processing sensor data
        if (this._onStatusChange) this._onStatusChange('disconnected', null);
      }
    },

    // Low fidelity: fake the band sending heartbeats every 2s
    _simulateHeartbeats() {
      setInterval(() => {
        this.receiveHeartbeat({ batteryPercent: 90 });
      }, 2000);
    },
  };


  // ----------------------------------------------------------
  // PUBLIC API
  // Everything the frontend needs to interact with the backend.
  // ----------------------------------------------------------
  return {

    // Call this once when the app loads
    init(onStatusChange) {
      console.log('[SafeStep] Initialising...');

      // Restore saved crowd mode preference
      const savedCrowdMode = Memory.load('crowdMode', false);
      Navigation.setCrowdMode(savedCrowdMode);

      console.log('[SafeStep] Ready. Call SafeStep.connect() to start.');

      // Return saved crowd mode so frontend can reflect it in the toggle
      return { crowdMode: savedCrowdMode };
    },

    // Called when user taps "CONNECT BAND"
    connect(onStatusChange) {
      console.log('[SafeStep] Connecting to band...');

      // Simulate a short connection delay
      setTimeout(() => {
        console.log('[SafeStep] Band connected.');
        Haptic.fire('connected');
        if (onStatusChange) onStatusChange('connected', null);

        // Start sensor and watchdog
        Sensor.start((data) => Navigation.process(data));
        Watchdog.start(onStatusChange);
      }, 1500);
    },

    // Called when user taps "CONNECT BAND" after a disconnect
    disconnect() {
      Sensor.stop();
      Watchdog.stop();
      console.log('[SafeStep] Disconnected.');
    },

    // Called when the Crowd Mode toggle is switched
    setCrowdMode(isOn) {
      Navigation.setCrowdMode(isOn);
    },

    // Expose Haptic for any direct frontend calls if needed
    vibrate(patternName) {
      Haptic.fire(patternName);
    },
  };

})();
