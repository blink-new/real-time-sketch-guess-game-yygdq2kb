import { useState } from 'react'
import { GameLobby } from './components/GameLobby'
import { GameBoard } from './components/GameBoard'
import './App.css'

type AppState = 'lobby' | 'game'

function App() {
  const [appState, setAppState] = useState<AppState>('lobby')
  const [currentRoomId, setCurrentRoomId] = useState<string>('')
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('')

  const handleStartGame = (roomId: string, playerId: string) => {
    setCurrentRoomId(roomId)
    setCurrentPlayerId(playerId)
    setAppState('game')
  }

  const handleLeaveGame = () => {
    setAppState('lobby')
    setCurrentRoomId('')
    setCurrentPlayerId('')
  }

  if (appState === 'game') {
    return (
      <GameBoard 
        roomId={currentRoomId}
        playerId={currentPlayerId}
        onLeaveGame={handleLeaveGame}
      />
    )
  }

  return (
    <GameLobby onStartGame={handleStartGame} />
  )
}

export default App