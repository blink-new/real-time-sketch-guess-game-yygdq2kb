import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { DrawingCanvas } from './DrawingCanvas'
import { 
  Palette, 
  Users, 
  Clock, 
  Send, 
  ArrowLeft,
  Trash2,
  RotateCcw,
  Trophy,
  Sparkles,
  Home
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getRandomWord } from '../data/gameWords'

interface GameBoardProps {
  roomId: string
  playerId: string
  onBackToLobby: () => void
}

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

interface Guess {
  id: string
  player_id: string
  guess: string
  is_correct: boolean
  created_at: string
  players?: { name: string }
}

export function GameBoard({ roomId, playerId, onBackToLobby }: GameBoardProps) {
  const [room, setRoom] = useState<GameRoom | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [currentGuess, setCurrentGuess] = useState('')
  const [timeLeft, setTimeLeft] = useState(60)
  const [isCurrentPlayer, setIsCurrentPlayer] = useState(false)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)

  useEffect(() => {
    fetchGameData()
    setupRealtimeSubscriptions()
  }, [])

  useEffect(() => {
    if (room) {
      setIsCurrentPlayer(room.current_player_id === playerId)
      setTimeLeft(room.time_per_round)
    }
  }, [room, playerId])

  // Timer countdown
  useEffect(() => {
    if (timeLeft > 0 && room?.is_active) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else if (timeLeft === 0) {
      handleRoundEnd()
    }
  }, [timeLeft, room])

  const fetchGameData = async () => {
    try {
      // Fetch room data
      const { data: roomData } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (roomData) {
        setRoom(roomData)
      }

      // Fetch players
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('score', { ascending: false })

      if (playersData) {
        setPlayers(playersData)
        const current = playersData.find(p => p.id === playerId)
        setCurrentPlayer(current || null)
      }

      // Fetch recent guesses
      const { data: guessesData } = await supabase
        .from('guesses')
        .select('*, players(name)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (guessesData) {
        setGuesses(guessesData)
      }
    } catch (error) {
      console.error('Error fetching game data:', error)
    }
  }

  const setupRealtimeSubscriptions = () => {
    // Subscribe to room changes
    const roomChannel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setRoom(payload.new as GameRoom)
          }
        }
      )
      .subscribe()

    // Subscribe to player changes
    const playersChannel = supabase
      .channel(`players:${roomId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => {
          fetchGameData()
        }
      )
      .subscribe()

    // Subscribe to guesses
    const guessesChannel = supabase
      .channel(`guesses:${roomId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guesses', filter: `room_id=eq.${roomId}` },
        () => {
          fetchGameData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(roomChannel)
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(guessesChannel)
    }
  }

  const submitGuess = async () => {
    if (!currentGuess.trim() || isCurrentPlayer) return
    
    const isCorrect = currentGuess.toLowerCase().trim() === room?.current_word?.toLowerCase()
    
    try {
      await supabase
        .from('guesses')
        .insert({
          room_id: roomId,
          player_id: playerId,
          guess: currentGuess.trim(),
          is_correct: isCorrect
        })

      if (isCorrect) {
        // Award points
        const playerData = players.find(p => p.id === playerId)
        if (playerData) {
          await supabase
            .from('players')
            .update({ score: playerData.score + 10 })
            .eq('id', playerId)
        }
        
        toast.success('Correct guess! +10 points')
        handleRoundEnd()
      }
      
      setCurrentGuess('')
    } catch (error) {
      console.error('Error submitting guess:', error)
    }
  }

  const handleRoundEnd = async () => {
    if (!room) return
    
    const nextRound = room.round_number + 1
    const nextPlayerIndex = (players.findIndex(p => p.id === room.current_player_id) + 1) % players.length
    const nextPlayer = players[nextPlayerIndex]
    
    if (nextRound <= room.max_rounds) {
      // Start next round
      const newWord = getRandomWord()
      
      await supabase
        .from('game_rooms')
        .update({
          round_number: nextRound,
          current_player_id: nextPlayer.id,
          current_word: newWord
        })
        .eq('id', roomId)
      
      // Clear canvas
      await supabase
        .from('draw_strokes')
        .delete()
        .eq('room_id', roomId)
        
      setTimeLeft(room.time_per_round)
    } else {
      // End game
      await supabase
        .from('game_rooms')
        .update({ is_active: false })
        .eq('id', roomId)
      
      toast.success('Game finished!')
    }
  }

  const startNewRound = async () => {
    if (!room || !currentPlayer?.is_host) return
    
    const randomWord = getRandomWord()
    const firstPlayer = players[0]
    
    await supabase
      .from('game_rooms')
      .update({
        current_player_id: firstPlayer.id,
        current_word: randomWord,
        round_number: 1,
        is_active: true
      })
      .eq('id', roomId)
    
    // Clear canvas
    await supabase
      .from('draw_strokes')
      .delete()
      .eq('room_id', roomId)
      
    setTimeLeft(room.time_per_round)
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300 flex items-center justify-center">
        <div className="text-white text-2xl">Loading game...</div>
      </div>
    )
  }

  const currentDrawingPlayer = players.find(p => p.id === room.current_player_id)
  const isGameActive = room.is_active

  if (!isGameActive && room.round_number > room.max_rounds) {
    // Game over screen
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
                onClick={onBackToLobby}
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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button 
            onClick={onBackToLobby}
            variant="outline"
            className="bg-white/20 border-white/30 text-white hover:bg-white/30"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Lobby
          </Button>
          
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white drop-shadow-lg flex items-center gap-2 justify-center">
              <Sparkles className="w-10 h-10" />
              {room.name}
              <Sparkles className="w-10 h-10" />
            </h1>
            <p className="text-white/90">Round {room.round_number} of {room.max_rounds}</p>
          </div>
          
          <div className="flex items-center gap-4">
            <Badge className="bg-red-500 text-white text-lg px-4 py-2">
              <Clock className="w-4 h-4 mr-2" />
              {timeLeft}s
            </Badge>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Main Game Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Current Player & Word */}
            <Card className="border-4 border-blue-600 shadow-xl bg-white/95">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Palette className="w-8 h-8 text-blue-600" />
                    <div>
                      <p className="text-sm text-gray-600">Current Artist</p>
                      <p className="text-2xl font-bold text-blue-700">
                        {currentDrawingPlayer?.name || 'Waiting...'}
                      </p>
                    </div>
                  </div>
                  
                  {isCurrentPlayer && room.current_word && (
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Your word</p>
                      <p className="text-3xl font-bold text-green-600">
                        {room.current_word}
                      </p>
                    </div>
                  )}
                  
                  {!isCurrentPlayer && (
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Guess the drawing!</p>
                      <p className="text-lg text-gray-500">
                        {room.current_word ? '_ '.repeat(room.current_word.length) : 'Getting ready...'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Drawing Canvas */}
            <DrawingCanvas 
              roomId={roomId}
              playerId={playerId}
              isDrawing={isCurrentPlayer}
              currentWord={isCurrentPlayer ? room.current_word || undefined : undefined}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Players */}
            <Card className="border-4 border-purple-600 shadow-xl bg-white/95">
              <CardContent className="p-4">
                <h3 className="text-xl font-bold text-purple-700 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Players ({players.length})
                </h3>
                <div className="space-y-3">
                  {players.map((player) => (
                    <div 
                      key={player.id}
                      className={`p-3 rounded-lg border-2 ${
                        player.id === room.current_player_id 
                          ? 'bg-yellow-100 border-yellow-400' 
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{player.name}</span>
                          {player.is_host && (
                            <Badge variant="secondary" className="text-xs">Host</Badge>
                          )}
                          {player.id === room.current_player_id && (
                            <Palette className="w-4 h-4 text-yellow-600" />
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Trophy className="w-4 h-4 text-yellow-600" />
                          <span className="font-bold">{player.score}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Chat/Guesses */}
            <Card className="border-4 border-pink-600 shadow-xl bg-white/95">
              <CardContent className="p-4">
                <h3 className="text-xl font-bold text-pink-700 mb-4">Guesses</h3>
                
                {/* Guess Input */}
                {!isCurrentPlayer && isGameActive && (
                  <div className="mb-4 flex gap-2">
                    <Input
                      placeholder="Enter your guess..."
                      value={currentGuess}
                      onChange={(e) => setCurrentGuess(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && submitGuess()}
                      className="border-2 border-pink-300 focus:border-pink-500"
                    />
                    <Button 
                      onClick={submitGuess}
                      disabled={!currentGuess.trim()}
                      className="bg-pink-500 hover:bg-pink-600"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Guesses List */}
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {guesses.map((guess) => (
                    <div 
                      key={guess.id}
                      className={`p-2 rounded text-sm ${
                        guess.is_correct 
                          ? 'bg-green-100 text-green-800 border border-green-300' 
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      <span className="font-semibold">
                        {guess.players?.name || 'Unknown'}:
                      </span>{' '}
                      <span>{guess.guess}</span>
                      {guess.is_correct && (
                        <span className="ml-2 text-green-600">✓ Correct!</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Round Controls */}
            {currentPlayer?.is_host && !isGameActive && (
              <Card className="border-4 border-green-500 shadow-xl bg-white/90">
                <CardContent className="p-4 text-center">
                  <Button
                    onClick={startNewRound}
                    className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-3 text-lg rounded-xl"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Start New Game
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