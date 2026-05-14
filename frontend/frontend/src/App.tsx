import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

// Type definitions
interface AlertMessage {
  message: string;
  distance: number | null;
  direction: string | null;
}

// Component
function App() {
  // State Management with proper types
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [isConnecting, setIsConnecting] = useState<boolean>(false)
  const [crowdMode, setCrowdMode] = useState<boolean>(false)
  const [hapticIntensity, setHapticIntensity] = useState<number>(70)
  const [batteryLevel, setBatteryLevel] = useState<number>(90)
  const [obstacleDistance, setObstacleDistance] = useState<number | null>(null)
  const [obstacleDirection, setObstacleDirection] = useState<string | null>(null)
  const [alertMessage, setAlertMessage] = useState<string>('')
  const [voiceGuidance, setVoiceGuidance] = useState<boolean>(true)
  
  // Refs for simulation
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Speech synthesis for voice guidance
  const speakAlert = (message: string): void => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(message)
      utterance.rate = 0.9
      utterance.pitch = 1.1
      utterance.volume = 1
      window.speechSynthesis.cancel() // Clear previous
      window.speechSynthesis.speak(utterance)
    }
  }
  
  // Simulate haptic feedback (visual representation)
  const triggerHapticFeedback = (intensity: number, distance: number): void => {
    const hapticElement = document.createElement('div')
    hapticElement.className = 'haptic-feedback'
    hapticElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: ${intensity}px;
      height: ${intensity}px;
      background: radial-gradient(circle, rgba(250,204,21,0.8) 0%, rgba(250,204,21,0) 70%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 1000;
      animation: hapticPulse ${Math.max(0.2, 1 - distance / 5)}s ease-out;
    `
    document.body.appendChild(hapticElement)
    setTimeout(() => hapticElement.remove(), 500)
  }
  
  // Simulate obstacle detection (would come from hardware sensors)
  const simulateObstacleDetection = useCallback((): void => {
    if (!isConnected) return
    
    // Random obstacle generation for demo
    const hasObstacle = Math.random() < 0.3 // 30% chance
    if (hasObstacle) {
      const distances: number[] = [0.5, 1, 1.5, 2, 2.5, 3]
      const directions: string[] = ['front', 'left', 'right', 'front-left', 'front-right']
      const distance: number = distances[Math.floor(Math.random() * distances.length)]
      const direction: string = directions[Math.floor(Math.random() * directions.length)]
      
      setObstacleDistance(distance)
      setObstacleDirection(direction)
      
      // Generate alert based on distance
      let alert: string = ''
      let intensity: number = hapticIntensity
      
      if (distance < 1) {
        alert = `DANGER! ${direction.toUpperCase()} obstacle ${distance.toFixed(1)} meters!`
        intensity = Math.min(100, hapticIntensity + 20)
      } else if (distance < 2) {
        alert = `Warning: ${direction} obstacle ${distance.toFixed(1)} meters`
        intensity = hapticIntensity
      } else {
        alert = `Caution: ${direction} object ${distance.toFixed(1)} meters ahead`
        intensity = Math.max(30, hapticIntensity - 20)
      }
      
      setAlertMessage(alert)
      
      // Trigger haptic feedback (simulated)
      triggerHapticFeedback(intensity, distance)
      
      // Voice guidance
      if (voiceGuidance) {
        speakAlert(alert)
      }
    } else {
      setObstacleDistance(null)
      setObstacleDirection(null)
      setAlertMessage('Path clear')
    }
  }, [isConnected, hapticIntensity, voiceGuidance])
  
  // Handle connect button click
  const handleConnect = async (): Promise<void> => {
    if (!isConnected && !isConnecting) {
      setIsConnecting(true)
      setAlertMessage('Searching for band...')
      
      // Simulate Bluetooth/band connection
      setTimeout(() => {
        setIsConnecting(false)
        setIsConnected(true)
        setAlertMessage('Band connected successfully')
        speakAlert('Band connected. Navigation system active.')
        
        // Start obstacle detection simulation
        intervalRef.current = setInterval(simulateObstacleDetection, 2000)
      }, 2000)
    } else if (isConnected) {
      setIsConnected(false)
      setAlertMessage('Band disconnected')
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      setObstacleDistance(null)
      setObstacleDirection(null)
    }
  }
  
  // Handle crowd mode toggle
  const handleCrowdModeToggle = (): void => {
    const newMode: boolean = !crowdMode
    setCrowdMode(newMode)
    const message: string = newMode 
      ? 'Crowd mode enabled. Ignoring moving people, alerting for walls and static obstacles.'
      : 'Standard mode enabled. Alerting for all obstacles.'
    setAlertMessage(message)
    speakAlert(message)
  }
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])
  
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
      return {
        ...baseStyle,
        backgroundColor: '#22c55e',
        color: '#000',
        boxShadow: '0 0 40px rgba(34, 197, 94, 0.8)'
      }
    } else if (isConnecting) {
      return {
        ...baseStyle,
        backgroundColor: '#94a3b8',
        color: '#000',
        animation: 'pulse 1.5s ease-in-out infinite'
      }
    } else {
      return {
        ...baseStyle,
        backgroundColor: '#facc15',
        color: '#000',
        boxShadow: '0 0 50px rgba(250, 204, 21, 0.9)'
      }
    }
  }
  
  return (
    <>
      <section id="center">
        <div className="hero">
          <h1 className="app-title">Safe Step</h1>
          <p className="app-subtitle">Haptic Navigation Assistant</p>
        </div>
        
        {/* Connection Status */}
        <div className="status-container">
          <div className={`status-indicator ${isConnected ? 'connected' : isConnecting ? 'searching' : 'disconnected'}`}>
            {isConnected ? '● CONNECTED' : isConnecting ? '◐ SEARCHING' : '○ DISCONNECTED'}
          </div>
          <p className="status-hint">Ensure your band is turned on</p>
        </div>
        
        {/* Main Connect Button */}
        <button
          type="button"
          className="connect-button"
          onClick={handleConnect}
          style={getButtonStyle()}
        >
          {getButtonText()}
        </button>
        
        {/* Obstacle Alert Display */}
        {isConnected && alertMessage && (
          <div className={`alert-card ${obstacleDistance && obstacleDistance < 1 ? 'danger' : obstacleDistance && obstacleDistance < 2 ? 'warning' : 'info'}`}>
            <div className="alert-icon">
              {obstacleDistance && obstacleDistance < 1 ? '⚠️' : obstacleDistance ? '📍' : '✅'}
            </div>
            <div className="alert-message">{alertMessage}</div>
            {obstacleDistance && (
              <div className="alert-distance">
                Distance: {obstacleDistance.toFixed(1)}m
              </div>
            )}
          </div>
        )}
      </section>
      
      <div className="ticks"></div>
      
      <section id="next-steps">
        {/* Haptic Controls */}
        <div id="haptic-controls">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#vibration-icon"></use>
          </svg>
          <h2>Haptic Feedback</h2>
          <p>Adjust vibration intensity</p>
          <div className="slider-container">
            <input
              type="range"
              min="0"
              max="100"
              value={hapticIntensity}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHapticIntensity(parseInt(e.target.value))}
              disabled={!isConnected}
              className="intensity-slider"
              aria-label="Haptic intensity"
            />
            <span className="intensity-value">{hapticIntensity}%</span>
          </div>
        </div>
        
        {/* Crowd Mode Toggle */}
        <div id="crowd-mode">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#people-icon"></use>
          </svg>
          <h2>Crowd Mode</h2>
          <p>Ignore moving people, alert for walls</p>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={crowdMode}
              onChange={handleCrowdModeToggle}
              disabled={!isConnected}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        {/* Voice Guidance */}
        <div id="voice-guidance">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#voice-icon"></use>
          </svg>
          <h2>Voice Guidance</h2>
          <p>Spoken obstacle alerts</p>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={voiceGuidance}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVoiceGuidance(e.target.checked)}
              disabled={!isConnected}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </section>
      
      <div className="ticks"></div>
      
      {/* System Status */}
      <section id="system-status">
        <div className="status-grid">
          <div className="status-item">
            <span className="status-label">Battery</span>
            <div className="battery-bar">
              <div className="battery-level" style={{ width: `${batteryLevel}%` }}></div>
            </div>
            <span className="status-value">{batteryLevel}%</span>
          </div>
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
    </>
  )
}

export default App