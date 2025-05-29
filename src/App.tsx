import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { GameLobby } from './components/GameLobby'
import { GameBoard } from './components/GameBoard'
import './App.css'

function App() {
  const [gameState, setGameState] = useState<'lobby' | 'playing'>('lobby')
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null)

  const handleStartGame = (roomId: string, playerId: string) => {
    setCurrentRoomId(roomId)
    setCurrentPlayerId(playerId)
    setGameState('playing')
  }

  const handleBackToLobby = () => {
    setGameState('lobby')
    setCurrentRoomId(null)
    setCurrentPlayerId(null)
  }

  return (
    <>
      {gameState === 'lobby' ? (
        <GameLobby onStartGame={handleStartGame} />
      ) : (
        <GameBoard 
          roomId={currentRoomId!}
          playerId={currentPlayerId!}
          onBackToLobby={handleBackToLobby}
        />
      )}
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
            borderRadius: '10px',
            border: '2px solid #4f46e5',
          },
        }}
      />
    </>
  )
}

export default App