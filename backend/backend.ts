// ============================================================
// SafeStep Backend — Low Fidelity Prototype
// ============================================================
// All modules are exported for use by the frontend.
// Frontend imports what it needs from this file.
// ============================================================


// ----------------------------------------------------------
// TYPES
// ----------------------------------------------------------
export type PatternName =
  | 'stop'
  | 'leftPulse'
  | 'rightPulse'
  | 'centerWarn'
  | 'emergency'
  | 'lowBattery'
  | 'connected';

export type Direction = 'LEFT' | 'RIGHT' | 'CENTER';
export type ObjectType = 'WALL' | 'PILLAR' | 'PERSON' | 'FURNITURE';
export type ConnectionStatus = 'connected' | 'disconnected' | 'low_battery';

export interface SensorData {
  distance: number;
  direction: Direction;
  objectType: ObjectType;
  timestamp: number;
}

export interface HeartbeatData {
  batteryPercent: number;
}

export interface InitResult {
  crowdMode: boolean;
}


// ----------------------------------------------------------
// MODULE 1: HAPTIC MOTOR CONTROLLER
// Vibration pattern library. All durations in milliseconds.
// ----------------------------------------------------------
const patterns: Record<PatternName, number[]> = {
  stop:        [800],                        // long rumble — solid wall dead ahead
  leftPulse:   [150, 80, 150],               // double tap — obstacle on the left
  rightPulse:  [300, 80, 150],               // reversed double tap — obstacle on the right
  centerWarn:  [200, 100, 200, 100, 200],    // rapid triple — object straight ahead, mid-range
  emergency:   [1000, 200, 1000, 200, 1000], // three long bursts — band disconnected
  lowBattery:  [100, 50, 100],               // light double — band battery warning
  connected:   [150],                        // single short — band just connected
};

export const Haptic = {
  fire(patternName: PatternName): void {
    const pattern = patterns[patternName];
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
export const Memory = {
  save(key: string, value: unknown): void {
    try {
      localStorage.setItem(`safestep_${key}`, JSON.stringify(value));
    } catch (e) {
      console.error('[Memory] Failed to save:', key, e);
    }
  },

  load<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(`safestep_${key}`);
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
    } catch (e) {
      console.error('[Memory] Failed to load:', key, e);
      return defaultValue;
    }
  },

  clear(key: string): void {
    localStorage.removeItem(`safestep_${key}`);
  },
};


// ----------------------------------------------------------
// MODULE 3: SENSOR SIMULATOR
// Generates fake distance/direction/object data since there
// is no real LiDAR sensor. Fires a callback every 600ms.
// ----------------------------------------------------------
const DIRECTIONS: Direction[]   = ['LEFT', 'RIGHT', 'CENTER'];
const OBJECT_TYPES: ObjectType[] = ['WALL', 'PILLAR', 'PERSON', 'FURNITURE'];

let sensorIntervalId: ReturnType<typeof setInterval> | null = null;
let sensorCallback: ((data: SensorData) => void) | null = null;

export const Sensor = {
  start(callback: (data: SensorData) => void): void {
    if (sensorIntervalId) this.stop();
    sensorCallback = callback;

    sensorIntervalId = setInterval(() => {
      const data: SensorData = {
        distance:   parseFloat((Math.random() * 5).toFixed(2)),
        direction:  DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)],
        objectType: OBJECT_TYPES[Math.floor(Math.random() * OBJECT_TYPES.length)],
        timestamp:  Date.now(),
      };
      console.log('[Sensor] Reading:', data);
      if (sensorCallback) sensorCallback(data);
    }, 5000);

    console.log('[Sensor] Simulator started.');
  },

  stop(): void {
    if (sensorIntervalId) clearInterval(sensorIntervalId);
    sensorIntervalId = null;
    console.log('[Sensor] Simulator stopped.');
  },
};


// ----------------------------------------------------------
// MODULE 4: NAVIGATION LOGIC ENGINE
// Receives sensor data, reads Crowd Mode from Memory,
// decides which haptic pattern to fire.
// ----------------------------------------------------------
const DANGER_ZONE  = 1.0; // metres
const WARNING_ZONE = 3.0; // metres

let crowdModeActive = false;

export const Navigation = {
  setCrowdMode(isOn: boolean): void {
    crowdModeActive = isOn;
    Memory.save('crowdMode', isOn);
    console.log(`[Navigation] Crowd Mode: ${isOn ? 'ON' : 'OFF'}`);
  },

  process(data: SensorData): void {
    const { distance, direction, objectType } = data;

    // Crowd Mode: ignore people, only react to solid objects
    if (crowdModeActive && objectType === 'PERSON') {
      console.log('[Navigation] Crowd Mode — ignoring person.');
      return;
    }

    // Danger zone (< 1m) — stop immediately
    if (distance < DANGER_ZONE) {
      Haptic.fire('stop');
      return;
    }

    // Warning zone (1m – 3m) — directional pulses
    if (distance < WARNING_ZONE) {
      if (direction === 'LEFT')   { Haptic.fire('leftPulse');  return; }
      if (direction === 'RIGHT')  { Haptic.fire('rightPulse'); return; }
      if (direction === 'CENTER') { Haptic.fire('centerWarn'); return; }
    }

    // Beyond 3m — clear path
    console.log('[Navigation] Path clear.');
  },
};


// ----------------------------------------------------------
// MODULE 5: CONNECTIVITY & BATTERY WATCHDOG
// Simulates a Bluetooth heartbeat from the band.
// Fires emergency haptic if signal drops for > 5 seconds.
// ----------------------------------------------------------
const TIMEOUT_MS = 5000;

let watchdogIntervalId: ReturnType<typeof setInterval> | null = null;
let lastHeartbeat: number | null = null;
let onStatusChange: ((status: ConnectionStatus, data: number | null) => void) | null = null;

export const Watchdog = {
  start(statusCallback: (status: ConnectionStatus, data: number | null) => void): void {
    onStatusChange  = statusCallback;
    lastHeartbeat   = Date.now();

    this._simulateHeartbeats();
    watchdogIntervalId = setInterval(() => this._check(), 1000);
    console.log('[Watchdog] Started.');
  },

  stop(): void {
    if (watchdogIntervalId) clearInterval(watchdogIntervalId);
    watchdogIntervalId = null;
    console.log('[Watchdog] Stopped.');
  },

  receiveHeartbeat(data: HeartbeatData): void {
    lastHeartbeat = Date.now();
    const battery = data.batteryPercent ?? 90;
    console.log(`[Watchdog] Heartbeat received. Battery: ${battery}%`);

    if (battery < 20) {
      Haptic.fire('lowBattery');
      if (onStatusChange) onStatusChange('low_battery', battery);
    }
  },

  _check(): void {
    if (!lastHeartbeat) return;
    const elapsed = Date.now() - lastHeartbeat;
    if (elapsed > TIMEOUT_MS) {
      console.warn('[Watchdog] Band disconnected! No heartbeat for 5s.');
      Haptic.fire('emergency');
      Sensor.stop();
      if (onStatusChange) onStatusChange('disconnected', null);
    }
  },

  _simulateHeartbeats(): void {
    const fakeHeartbeat = setInterval(() => {
      this.receiveHeartbeat({ batteryPercent: 90 });
    }, 2000);

    setTimeout(() => {
      clearInterval(fakeHeartbeat);
      console.log('[Watchdog Test] Fake signal killed! Emergency alarm in 5s...');
    }, 15000);
  },
};


// ----------------------------------------------------------
// PUBLIC API
// Single entry point the frontend uses to drive everything.
// ----------------------------------------------------------
export const SafeStep = {

  // Call once on app load
  init(): InitResult {
    console.log('[SafeStep] Initialising...');
    const savedCrowdMode = Memory.load<boolean>('crowdMode', false);
    Navigation.setCrowdMode(savedCrowdMode);
    console.log('[SafeStep] Ready. Call SafeStep.connect() to start.');
    return { crowdMode: savedCrowdMode };
  },

  // Call when user taps "CONNECT BAND"
 connect(
    statusCallback: (status: ConnectionStatus, data: number | null) => void,
    onSensorUpdate: (data: SensorData) => void 
  ): void {
    console.log('[SafeStep] Connecting to band...');
    setTimeout(() => {
      console.log('[SafeStep] Band connected.');
      Haptic.fire('connected');
      statusCallback('connected', null);
      
      // We pass the data to the brain (Navigation), AND to the screen (onSensorUpdate)
      Sensor.start((data) => {
        Navigation.process(data); 
        onSensorUpdate(data);
      });
      Watchdog.start(statusCallback);
    }, 1500);
  },

  // Call when disconnecting
  disconnect(): void {
    Sensor.stop();
    Watchdog.stop();
    console.log('[SafeStep] Disconnected.');
  },

  // Call when Crowd Mode toggle is switched
  setCrowdMode(isOn: boolean): void {
    Navigation.setCrowdMode(isOn);
  },

  // Direct vibration trigger for frontend if needed
  vibrate(patternName: PatternName): void {
    Haptic.fire(patternName);
  },
};
