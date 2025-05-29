import { useState, useEffect } from 'react'
import { DrawingCanvas } from './DrawingCanvas'
import { ChatPanel } from './ChatPanel'
import { GameHeader } from './GameHeader'
import { supabase } from '../lib/supabase'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Trophy, Home } from 'lucide-react'
import toast from 'react-hot-toast'

interface Player {
  id: string
  name: string
  score: number
  is_host: boolean
  is_online: boolean
}

interface GameRoom {
  id: string
  name: string
  host_id: string
  current_player_id: string | null
  current_word: string | null
  round_number: number
  max_rounds: number
  time_per_round: number
  is_active: boolean
}

interface GameBoardProps {
  roomId: string
  playerId: string
  onLeaveGame: () => void
}

export function GameBoard({ roomId, playerId, onLeaveGame }: GameBoardProps) {
  const [room, setRoom] = useState<GameRoom | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [timeLeft, setTimeLeft] = useState(60)
  const [gamePhase, setGamePhase] = useState<'waiting' | 'playing' | 'round_end' | 'game_end'>('waiting')
  const [isCurrentPlayerDrawing, setIsCurrentPlayerDrawing] = useState(false)

  useEffect(() => {
    fetchGameData()
    setupRealTimeSubscriptions()
  }, [roomId, playerId])

  const fetchGameData = async () => {
    try {
      // Fetch room data
      const { data: roomData, error: roomError } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (roomError) throw roomError
      setRoom(roomData)

      // Fetch players
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('score', { ascending: false })

      if (playersError) throw playersError
      setPlayers(playersData || [])

      // Find current player
      const currentPlayerData = playersData?.find(p => p.id === playerId)
      setCurrentPlayer(currentPlayerData || null)

      // Check if current player is drawing
      setIsCurrentPlayerDrawing(roomData.current_player_id === playerId)

    } catch (error) {
      console.error('Failed to fetch game data:', error)
      toast.error('Failed to load game data')
    }
  }

  const setupRealTimeSubscriptions = () => {
    // Subscribe to room updates
    const roomSubscription = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_rooms',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setRoom(payload.new as GameRoom)
            setIsCurrentPlayerDrawing(payload.new.current_player_id === playerId)
          }
        }
      )
      .subscribe()

    // Subscribe to player updates
    const playersSubscription = supabase
      .channel(`players-${roomId}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`
        },
        () => {
          fetchGameData() // Refetch all data when players change
        }
      )
      .subscribe()

    return () => {
      roomSubscription.unsubscribe()
      playersSubscription.unsubscribe()
    }
  }

  const startNewRound = async () => {
    if (!room || !currentPlayer?.is_host) return

    try {
      // Get random word
      const { data: words, error: wordsError } = await supabase
        .from('game_words')
        .select('word')
        .order('random()', { ascending: false })
        .limit(1)

      if (wordsError) throw wordsError

      // Get next player to draw
      const currentPlayerIndex = players.findIndex(p => p.id === room.current_player_id)
      const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
      const nextPlayer = players[nextPlayerIndex]

      // Update room
      await supabase
        .from('game_rooms')
        .update({
          current_player_id: nextPlayer.id,
          current_word: words[0]?.word || 'cat',
          round_number: room.round_number + 1
        })
        .eq('id', roomId)

      // Clear previous drawings
      await supabase
        .from('draw_strokes')
        .delete()
        .eq('room_id', roomId)

      setGamePhase('playing')
      setTimeLeft(room.time_per_round)

    } catch (error) {
      console.error('Failed to start new round:', error)
      toast.error('Failed to start new round')
    }
  }

  if (!room || !currentPlayer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300 flex items-center justify-center">
        <div className="text-white text-2xl">Loading game...</div>
      </div>
    )
  }

  if (gamePhase === 'game_end') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300 p-4">
        <div className="max-w-4xl mx-auto">
          <Card className="border-4 border-yellow-500 shadow-2xl bg-white/90 backdrop-blur">
            <CardContent className="p-8 text-center">
              <Trophy className="w-24 h-24 mx-auto mb-4 text-yellow-500" />
              <h1 className="text-4xl font-bold mb-6 text-purple-700">Game Over!</h1>
              
              <div className="space-y-4 mb-8">
                <h2 className="text-2xl font-bold text-purple-600">Final Scores</h2>
                {players.map((player, index) => (
                  <div 
                    key={player.id}
                    className={`flex items-center justify-between p-4 rounded-lg ${
                      index === 0 ? 'bg-gradient-to-r from-yellow-200 to-yellow-300 border-2 border-yellow-500' :
                      index === 1 ? 'bg-gradient-to-r from-gray-200 to-gray-300 border-2 border-gray-400' :
                      index === 2 ? 'bg-gradient-to-r from-orange-200 to-orange-300 border-2 border-orange-400' :
                      'bg-gradient-to-r from-blue-100 to-purple-100 border-2 border-purple-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">#{index + 1}</span>
                      <span className="text-xl font-semibold">{player.name}</span>
                      {index === 0 && <Trophy className="w-6 h-6 text-yellow-600" />}
                    </div>
                    <span className="text-2xl font-bold">{player.score}</span>
                  </div>
                ))}
              </div>

              <Button 
                onClick={onLeaveGame}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 px-8 text-lg rounded-xl"
              >
                <Home className="w-6 h-6 mr-2" />
                Back to Lobby
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300 p-4">
      <div className="max-w-7xl mx-auto">
        <GameHeader 
          room={room}
          players={players}
          currentPlayer={currentPlayer}
          timeLeft={timeLeft}
          onLeaveGame={onLeaveGame}
        />
        
        <div className="grid lg:grid-cols-3 gap-6 mt-6">
          {/* Drawing Canvas */}
          <div className="lg:col-span-2">
            <DrawingCanvas 
              roomId={roomId}
              playerId={playerId}
              isDrawing={isCurrentPlayerDrawing}
              currentWord={isCurrentPlayerDrawing ? room.current_word || undefined : undefined}
            />
          </div>

          {/* Chat and Players Panel */}
          <div className="space-y-6">
            <ChatPanel 
              roomId={roomId}
              playerId={playerId}
              currentWord={room.current_word}
              isDrawing={isCurrentPlayerDrawing}
            />

            {/* Round Controls */}
            {currentPlayer.is_host && gamePhase === 'waiting' && (
              <Card className="border-4 border-green-500 shadow-xl bg-white/90">
                <CardContent className="p-4 text-center">
                  <Button
                    onClick={startNewRound}
                    className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-3 text-lg rounded-xl"
                  >
                    Start Round {room.round_number}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}