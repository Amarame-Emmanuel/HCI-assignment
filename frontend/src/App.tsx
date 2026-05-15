import React, { useState, useEffect, useRef } from 'react'
import './App.css'
// 1. IMPORT THE BACKEND! (Make sure the file name matches exactly)
import { SafeStep, SensorData, ConnectionStatus } from '../../backend/backend'

function App() {
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [isConnecting, setIsConnecting] = useState<boolean>(false)
  const [crowdMode, setCrowdMode] = useState<boolean>(false)
  const [hapticIntensity, setHapticIntensity] = useState<number>(70)
  const [batteryLevel, setBatteryLevel] = useState<number>(90) // Added setter back!
  const [obstacleDistance, setObstacleDistance] = useState<number | null>(null)
  const [obstacleDirection, setObstacleDirection] = useState<string | null>(null)
  const [alertMessage, setAlertMessage] = useState<string>('')
  const [voiceGuidance, setVoiceGuidance] = useState<boolean>(true)

  // 1. Create the Live Sticky Notes
  const voiceRef = useRef(voiceGuidance)
  const hapticRef = useRef(hapticIntensity)
  
  // NEW: Tracks the exact millisecond of the last two-finger tap
  const lastTapTimeRef = useRef<number>(0)

  // 2. Keep the sticky notes updated the exact millisecond the user clicks a button
  useEffect(() => { voiceRef.current = voiceGuidance }, [voiceGuidance])
  useEffect(() => { hapticRef.current = hapticIntensity }, [hapticIntensity])
  
  // App Startup - Ask backend for saved settings
  useEffect(() => {
    const memory = SafeStep.init()
    setCrowdMode(memory.crowdMode)
    
    return () => {
      SafeStep.disconnect()
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])

  const speakAlert = (message: string): void => {
    if ('speechSynthesis' in window && voiceRef.current) {
      const utterance = new SpeechSynthesisUtterance(message)
      utterance.rate = 0.9
      utterance.pitch = 1.1
      window.speechSynthesis.cancel() 
      window.speechSynthesis.speak(utterance)
    }
  }
  
  const triggerHapticFeedback = (intensity: number, distance: number): void => {
    const hapticElement = document.createElement('div')
    hapticElement.className = 'haptic-feedback'
    hapticElement.style.setProperty('--intensity', `${intensity}px`)
    hapticElement.style.setProperty('--duration', `${Math.max(0.2, 1 - distance / 5)}s`)
    document.body.appendChild(hapticElement)
    setTimeout(() => hapticElement.remove(), 500)
  }
  
  // 2. THE NEW WALKIE-TALKIE: When the backend sees something, it tells this function
  const handleSensorData = (data: SensorData) => {
    setObstacleDistance(data.distance)
    setObstacleDirection(data.direction)
    
    let alert = ''
    let intensity = hapticRef.current
    
    // UI Logic: Translating backend numbers into English warnings
    if (data.distance < 1) {
      alert = `DANGER! ${data.direction} obstacle ${data.distance.toFixed(1)} meters!`
      intensity = Math.min(100, hapticRef.current + 20)
    } else if (data.distance < 3) {
      alert = `Warning: ${data.direction} object ${data.distance.toFixed(1)} meters ahead`
      intensity = Math.max(30, hapticRef.current - 20)
    } else {
      alert = 'Path clear'
    }
    
    setAlertMessage(alert)
    if (alert !== 'Path clear') {
      triggerHapticFeedback(intensity, data.distance)
      speakAlert(alert)
    }
  }

  // 3. BACKEND CONNECTION LOGIC
  const handleConnect = async (): Promise<void> => {
    if (!isConnected && !isConnecting) {
      setIsConnecting(true)
      setAlertMessage('Searching for band...')
      
      // Tell the backend to connect!
      SafeStep.connect(
        // Callback 1: Connection and Battery updates
        (status: ConnectionStatus, data: number | null) => {
          if (status === 'connected') {
            setIsConnecting(false)
            setIsConnected(true)
            setAlertMessage('Band connected successfully')
            speakAlert('Band connected. Navigation system active.')
          } else if (status === 'disconnected') {
            setIsConnected(false)
            setAlertMessage('Band disconnected! Connection lost.')
            speakAlert('Emergency. Band disconnected.')
            setObstacleDistance(null)
            setObstacleDirection(null)
          } else if (status === 'low_battery' && data !== null) {
            setBatteryLevel(data)
            speakAlert(`Warning. Band battery at ${data} percent.`)
          }
        },
        // Callback 2: Radar updates
        handleSensorData 
      )
    } else if (isConnected) {
      // Disconnect
      SafeStep.disconnect()
      setIsConnected(false)
      setAlertMessage('Band disconnected manually')

      speakAlert('Band disconnected.')
      SafeStep.vibrate('lowBattery') // Uses the light double-tap to signify turning off

      setObstacleDistance(null)
      setObstacleDirection(null)
    }
  }
  
  // 4. CROWD MODE - Tell the backend to flip the switch
  const handleCrowdModeToggle = (): void => {
    // Note: We use the function form of setCrowdMode to guarantee we have the latest state,
    // which is safer when triggering it rapidly via a gesture!
    setCrowdMode((prevMode) => {
      const newMode = !prevMode;
      SafeStep.setCrowdMode(newMode); // Sends the command to the backend
      
      const message = newMode 
        ? 'Crowd mode enabled. Ignoring moving people.'
        : 'Standard mode enabled. Alerting for all obstacles.';
      setAlertMessage(message);
      speakAlert(message);
      
      return newMode;
    });
  }

  // 5. GESTURE CONTROL: Two-Finger Double Tap
  const handleTouchStart = (e: React.TouchEvent) => {
    // Only trigger if the user is connected and uses exactly 2 fingers
    if (isConnected && e.touches.length === 2) {
      const currentTime = new Date().getTime();
      const timeSinceLastTap = currentTime - lastTapTimeRef.current;

      // If it's been less than 400ms since the last tap, it's a double tap!
      if (timeSinceLastTap < 400 && timeSinceLastTap > 0) {
        handleCrowdModeToggle(); // Flip the switch!
        lastTapTimeRef.current = 0; // Reset the clock so it doesn't triple-trigger
      } else {
        // Otherwise, just record the time of this first tap
        lastTapTimeRef.current = currentTime;
      }
    }
  };
  
  // Get button text and style
  const getButtonText = (): string => {
    if (isConnected) return '✔ CONNECTED'
    if (isConnecting) return 'SEARCHING...'
    return 'CONNECT BAND'
  }
  
  const getButtonStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      width: '220px',
      height: '220px',
      borderRadius: '50%',
      border: '2px solid transparent',
      fontSize: '24px',
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      fontFamily: 'var(--mono)'
    }
    
    if (isConnected) {
      return { ...baseStyle, backgroundColor: '#22c55e', color: '#000', boxShadow: '0 0 40px rgba(34, 197, 94, 0.8)' }
    } else if (isConnecting) {
      return { ...baseStyle, backgroundColor: '#94a3b8', color: '#000', animation: 'pulse 1.5s ease-in-out infinite' }
    } else {
      return { ...baseStyle, backgroundColor: '#facc15', color: '#000', boxShadow: '0 0 50px rgba(250, 204, 21, 0.9)' }
    }
  }
  
  return (
    /* --- NEW: The invisible gesture wrapper covering the whole app --- */
    <div onTouchStart={handleTouchStart} style={{ minHeight: '100vh', width: '100%', touchAction: 'manipulation' }}>
      <section id="center">
        <div className="hero">
          <h1 className="app-title">Safe Step</h1>
          <p className="app-subtitle">Haptic Navigation Assistant</p>
        </div>
        
        <div className="status-container">
          <div className={`status-indicator ${isConnected ? 'connected' : isConnecting ? 'searching' : 'disconnected'}`}>
            {isConnected ? '● CONNECTED' : isConnecting ? '◐ SEARCHING' : '○ DISCONNECTED'}
          </div>
          <p className="status-hint">Ensure your band is turned on</p>
        </div>
        
        <button type="button" className="connect-button" onClick={handleConnect} style={getButtonStyle()}>
          {getButtonText()}
        </button>
        
        {isConnected && alertMessage && (
          <div className={`alert-card ${obstacleDistance && obstacleDistance < 1 ? 'danger' : obstacleDistance && obstacleDistance < 2 ? 'warning' : 'info'}`}>
            <div className="alert-icon">
              {obstacleDistance && obstacleDistance < 1 ? '⚠️' : obstacleDistance ? '📍' : '✅'}
            </div>
            <div className="alert-message">{alertMessage}</div>
            
            {obstacleDistance && (
              <div className="alert-details">
                Distance: {obstacleDistance.toFixed(1)}m
                {obstacleDirection && ` | Direction: ${obstacleDirection.toUpperCase()}`}
              </div>
            )}
          </div>
        )}
      </section>
      
      <div className="ticks"></div>
      
      <section id="next-steps">
        <div id="haptic-controls">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#vibration-icon"></use>
          </svg>
          <h2>Haptic Feedback</h2>
          <p>Adjust vibration intensity</p>
          <div className="slider-container">
            <input type="range" min="0" max="100" value={hapticIntensity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHapticIntensity(parseInt(e.target.value))} disabled={!isConnected} className="intensity-slider" aria-label="Haptic intensity" />
            <span className="intensity-value">{hapticIntensity}%</span>
          </div>
        </div>
        
        <div id="crowd-mode">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#people-icon"></use>
          </svg>
          <h2>Crowd Mode</h2>
          <p>Ignore moving people, alert for walls</p>
          <label className="toggle-switch">
            <input type="checkbox" checked={crowdMode} onChange={handleCrowdModeToggle} disabled={!isConnected} aria-label="Crowd Mode toggle" />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        <div id="voice-guidance">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#voice-icon"></use>
          </svg>
          <h2>Voice Guidance</h2>
          <p>Spoken obstacle alerts</p>
          <label className="toggle-switch">
            <input type="checkbox" checked={voiceGuidance} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVoiceGuidance(e.target.checked)} disabled={!isConnected} aria-label="Voice Guidance toggle" />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </section>
      
      <div className="ticks"></div>
      
      <section id="system-status">
        <div className="status-grid">
          
          {/* --- UPDATED DYNAMIC BATTERY SECTION --- */}
          <div className="status-item">
            <span className="status-label">Battery</span>
            <div className="battery-wrapper">
              <div className="battery-body">
                <div 
                  className={`battery-fill ${batteryLevel > 50 ? 'high' : batteryLevel > 20 ? 'medium' : 'low'}`} 
                  style={{ width: `${batteryLevel}%` }}
                ></div>
              </div>
              <div className="battery-bump"></div>
            </div>
            <span className="status-value">{batteryLevel}%</span>
          </div>
          {/* --------------------------------------- */}

          <div className="status-item">
            <span className="status-label">Mode</span>
            <span className="status-value">{crowdMode ? 'Crowd' : 'Standard'}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Haptic</span>
            <span className="status-value">{hapticIntensity}%</span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default App