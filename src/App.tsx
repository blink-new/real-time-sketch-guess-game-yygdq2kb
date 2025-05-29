import { useState } from 'react'
import { GameLobby } from './components/GameLobby'
import { GameBoard } from './components/GameBoard'
import './App.css'

function App() {
  const [gameState, setGameState] = useState<'lobby' | 'playing'>('lobby')
  const [currentRoomId, setCurrentRoomId] = useState<string>('')
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('')

  const handleStartGame = (roomId: string, playerId: string) => {
    setCurrentRoomId(roomId)
    setCurrentPlayerId(playerId)
    setGameState('playing')
  }

  const handleLeaveGame = () => {
    setGameState('lobby')
    setCurrentRoomId('')
    setCurrentPlayerId('')
  }

  return (
    <div className="min-h-screen">
      {gameState === 'lobby' ? (
        <GameLobby onStartGame={handleStartGame} />
      ) : (
        <GameBoard 
          roomId={currentRoomId}
          playerId={currentPlayerId}
          onLeaveGame={handleLeaveGame}
        />
      )}
    </div>
  )
}

export default App