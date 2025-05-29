import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { supabase } from '../lib/supabase'
import { DrawingCanvas } from './DrawingCanvas'
import { Users, MessageCircle, Trophy, Clock, ArrowLeft } from 'lucide-react'
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

interface Guess {
  id: string
  player_id: string
  guess: string
  is_correct: boolean
  created_at: string
  player_name?: string
}

interface GameBoardProps {
  roomId: string
  playerId: string
  onLeaveGame: () => void
}

const words = [
  'Cat', 'Dog', 'House', 'Tree', 'Car', 'Sun', 'Moon', 'Star', 'Flower', 'Bird',
  'Fish', 'Boat', 'Plane', 'Train', 'Book', 'Chair', 'Table', 'Phone', 'Computer', 'Pizza'
]

export function GameBoard({ roomId, playerId, onLeaveGame }: GameBoardProps) {
  const [room, setRoom] = useState<GameRoom | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [currentGuess, setCurrentGuess] = useState('')
  const [timeLeft, setTimeLeft] = useState(60)
  const [isMyTurn, setIsMyTurn] = useState(false)

  useEffect(() => {
    fetchGameState()
    
    // Subscribe to real-time updates
    const roomSubscription = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${roomId}`
      }, () => {
        fetchGameState()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `room_id=eq.${roomId}`
      }, () => {
        fetchPlayers()
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'guesses',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        handleNewGuess(payload.new as Guess)
      })
      .subscribe()

    return () => {
      roomSubscription.unsubscribe()
    }
  }, [roomId])

  useEffect(() => {
    if (room) {
      setIsMyTurn(room.current_player_id === playerId)
      setTimeLeft(room.time_per_round)
    }
  }, [room, playerId])

  useEffect(() => {
    if (timeLeft > 0 && room?.is_active) {
      const timer = setTimeout(() => {
        setTimeLeft(prev => prev - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (timeLeft === 0) {
      handleRoundEnd()
    }
  }, [timeLeft, room])

  const fetchGameState = async () => {
    const { data: roomData, error: roomError } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (roomError) {
      toast.error('Failed to fetch game state')
      return
    }

    setRoom(roomData)
    fetchPlayers()
    fetchGuesses()
  }

  const fetchPlayers = async () => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('score', { ascending: false })

    if (error) {
      toast.error('Failed to fetch players')
      return
    }

    setPlayers(data || [])
  }

  const fetchGuesses = async () => {
    const { data: guessData, error } = await supabase
      .from('guesses')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      toast.error('Failed to fetch guesses')
      return
    }

    // Add player names to guesses
    const playersData = await supabase
      .from('players')
      .select('id, name')
      .eq('room_id', roomId)

    const playersMap = new Map(playersData.data?.map(p => [p.id, p.name]) || [])
    
    const formattedGuesses = guessData?.map(guess => ({
      ...guess,
      player_name: playersMap.get(guess.player_id) || 'Unknown'
    })) || []

    setGuesses(formattedGuesses)
  }

  const handleNewGuess = (newGuess: Guess) => {
    // Add player name to guess
    const player = players.find(p => p.id === newGuess.player_id)
    const guessWithName = {
      ...newGuess,
      player_name: player?.name || 'Unknown'
    }

    setGuesses(prev => [...prev, guessWithName])

    if (newGuess.is_correct && newGuess.player_id !== playerId) {
      toast.success(`${guessWithName.player_name} guessed correctly!`)
    }
  }

  const submitGuess = async () => {
    if (!currentGuess.trim() || isMyTurn) return

    const isCorrect = room?.current_word && 
      currentGuess.toLowerCase().trim() === room.current_word.toLowerCase()

    try {
      await supabase
        .from('guesses')
        .insert({
          room_id: roomId,
          player_id: playerId,
          guess: currentGuess.trim(),
          is_correct: !!isCorrect
        })

      if (isCorrect) {
        // Award points
        const currentPlayer = players.find(p => p.id === playerId)
        await supabase
          .from('players')
          .update({ score: (currentPlayer?.score || 0) + 10 })
          .eq('id', playerId)

        toast.success('Correct guess! +10 points')
        handleRoundEnd()
      }

      setCurrentGuess('')
    } catch (error) {
      toast.error('Failed to submit guess')
      console.error(error)
    }
  }

  const handleRoundEnd = async () => {
    if (!room) return

    const nextRound = room.round_number + 1
    const nextPlayerIndex = players.findIndex(p => p.id === room.current_player_id) + 1
    const nextPlayer = players[nextPlayerIndex % players.length]

    if (nextRound > room.max_rounds) {
      // Game over
      await supabase
        .from('game_rooms')
        .update({ is_active: false })
        .eq('id', roomId)
      
      toast.success('Game Over!')
      return
    }

    // Start next round
    const newWord = words[Math.floor(Math.random() * words.length)]
    
    await supabase
      .from('game_rooms')
      .update({
        round_number: nextRound,
        current_player_id: nextPlayer.id,
        current_word: newWord
      })
      .eq('id', roomId)

    // Clear canvas for new round
    await supabase
      .from('draw_strokes')
      .delete()
      .eq('room_id', roomId)

    setTimeLeft(room.time_per_round)
  }

  const clearCanvas = async () => {
    await supabase
      .from('draw_strokes')
      .delete()
      .eq('room_id', roomId)
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300 flex items-center justify-center">
        <Card className="border-4 border-purple-600">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-lg font-semibold">Loading game...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const winner = players.reduce((prev, current) => 
    (prev.score > current.score) ? prev : current, players[0]
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300">
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Header */}
        <Card className="border-4 border-purple-600 shadow-2xl bg-white/95 backdrop-blur mb-4">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-lg py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  onClick={onLeaveGame}
                  variant="outline"
                  size="sm"
                  className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Leave
                </Button>
                <CardTitle className="text-2xl font-bold">{room.name}</CardTitle>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  Round {room.round_number}/{room.max_rounds}
                </Badge>
                <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-1">
                  <Clock className="w-5 h-5" />
                  <span className="text-lg font-bold">{timeLeft}s</span>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid lg:grid-cols-4 gap-4">
          {/* Drawing Canvas */}
          <div className="lg:col-span-3">
            <DrawingCanvas
              roomId={roomId}
              playerId={playerId}
              isDrawer={isMyTurn}
              currentWord={room.current_word}
              onClearCanvas={clearCanvas}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Players */}
            <Card className="border-4 border-green-500 bg-white/95">
              <CardHeader className="bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-t-lg py-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="w-5 h-5" />
                  Players ({players.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="space-y-2">
                  {players.map((player) => (
                    <div 
                      key={player.id}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 ${
                        player.id === room.current_player_id 
                          ? 'bg-yellow-100 border-yellow-400' 
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                          player.is_online ? 'bg-green-500' : 'bg-gray-400'
                        }`} />
                        <span className="font-semibold text-sm">{player.name}</span>
                        {player.id === room.current_player_id && (
                          <Badge className="bg-yellow-500 text-yellow-900 text-xs">Drawing</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Trophy className="w-4 h-4 text-yellow-600" />
                        <span className="font-bold">{player.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Chat/Guesses */}
            <Card className="border-4 border-blue-500 bg-white/95">
              <CardHeader className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-t-lg py-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageCircle className="w-5 h-5" />
                  Guesses
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {/* Guess input */}
                {!isMyTurn && room.is_active && (
                  <div className="mb-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type your guess..."
                        value={currentGuess}
                        onChange={(e) => setCurrentGuess(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && submitGuess()}
                        className="border-2 border-blue-300 focus:border-blue-500 text-sm"
                      />
                      <Button 
                        onClick={submitGuess}
                        className="bg-gradient-to-r from-blue-500 to-cyan-500 px-3"
                        size="sm"
                      >
                        Guess
                      </Button>
                    </div>
                  </div>
                )}

                {/* Guesses list */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {guesses.map((guess) => (
                    <div 
                      key={guess.id}
                      className={`p-2 rounded-lg ${
                        guess.is_correct 
                          ? 'bg-green-100 border-2 border-green-400' 
                          : 'bg-gray-100 border border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs">{guess.player_name}</span>
                        {guess.is_correct && (
                          <Badge className="bg-green-500 text-xs">Correct!</Badge>
                        )}
                      </div>
                      <p className="text-gray-700 text-sm">{guess.guess}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Game over */}
            {!room.is_active && (
              <Card className="border-4 border-yellow-500 bg-gradient-to-r from-yellow-100 to-orange-100">
                <CardContent className="p-4 text-center">
                  <Trophy className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                  <h2 className="text-lg font-bold text-yellow-800 mb-1">Game Over!</h2>
                  <p className="text-sm text-yellow-700">
                    🎉 Winner: <span className="font-bold">{winner?.name}</span> with {winner?.score} points!
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}