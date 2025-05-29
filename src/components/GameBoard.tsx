import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { 
  Palette, 
  Users, 
  Clock, 
  Send, 
  ArrowLeft,
  Trash2,
  RotateCcw,
  Trophy
} from 'lucide-react'
import toast from 'react-hot-toast'

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

interface DrawPoint {
  x: number
  y: number
  color: string
  size: number
  isNewStroke: boolean
}

const DRAWING_WORDS = [
  'Cat', 'Dog', 'House', 'Tree', 'Car', 'Sun', 'Moon', 'Star', 'Fish', 'Bird',
  'Flower', 'Apple', 'Pizza', 'Cake', 'Book', 'Clock', 'Heart', 'Cloud', 'Mountain', 'Beach'
]

const COLORS = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#FFC0CB']

export function GameBoard({ roomId, playerId, onBackToLobby }: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentColor, setCurrentColor] = useState('#000000')
  const [brushSize, setBrushSize] = useState(3)
  const [room, setRoom] = useState<GameRoom | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [currentGuess, setCurrentGuess] = useState('')
  const [timeLeft, setTimeLeft] = useState(60)
  const [isCurrentPlayer, setIsCurrentPlayer] = useState(false)

  useEffect(() => {
    fetchGameData()
    const cleanup = setupRealtimeSubscriptions()
    
    // Initialize canvas
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        canvas.width = 800
        canvas.height = 500
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
      }
    }

    return cleanup
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
      const { data: roomData, error: roomError } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (roomError) {
        console.error('Error fetching room:', roomError)
        toast.error('Failed to load game room')
        return
      }

      if (roomData) {
        setRoom(roomData)
      }

      // Fetch players
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('score', { ascending: false })

      if (playersError) {
        console.error('Error fetching players:', playersError)
      } else if (playersData) {
        setPlayers(playersData)
      }

      // Fetch recent guesses
      const { data: guessesData, error: guessesError } = await supabase
        .from('guesses')
        .select(`
          *,
          players!inner (
            name
          )
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (guessesError) {
        console.error('Error fetching guesses:', guessesError)
      } else if (guessesData) {
        setGuesses(guessesData.map(g => ({ 
          ...g, 
          players: g.players 
        })))
      }
    } catch (error) {
      console.error('Error in fetchGameData:', error)
    }
  }

  const setupRealtimeSubscriptions = () => {
    // Subscribe to room changes
    const roomChannel = supabase
      .channel(`game-room-${roomId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          console.log('Room updated:', payload)
          if (payload.eventType === 'UPDATE') {
            setRoom(payload.new as GameRoom)
          }
        }
      )
      .subscribe()

    // Subscribe to player changes
    const playersChannel = supabase
      .channel(`game-players-${roomId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => {
          console.log('Players updated')
          fetchGameData()
        }
      )
      .subscribe()

    // Subscribe to guesses
    const guessesChannel = supabase
      .channel(`game-guesses-${roomId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guesses', filter: `room_id=eq.${roomId}` },
        () => {
          console.log('New guess')
          fetchGameData()
        }
      )
      .subscribe()

    // Subscribe to drawing strokes
    const drawingChannel = supabase
      .channel(`game-drawing-${roomId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'draw_strokes', filter: `room_id=eq.${roomId}` },
        (payload) => {
          console.log('New stroke:', payload)
          if (payload.new.player_id !== playerId) {
            drawFromStroke(payload.new.stroke_data)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(roomChannel)
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(guessesChannel)
      supabase.removeChannel(drawingChannel)
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isCurrentPlayer) return
    
    setIsDrawing(true)
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(x, y)
    
    // Send stroke start
    saveStroke([{ x, y, color: currentColor, size: brushSize, isNewStroke: true }])
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isCurrentPlayer) return
    
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const ctx = canvas.getContext('2d')!
    ctx.lineTo(x, y)
    ctx.strokeStyle = currentColor
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.stroke()
    
    // Send stroke point
    saveStroke([{ x, y, color: currentColor, size: brushSize, isNewStroke: false }])
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const saveStroke = async (strokeData: DrawPoint[]) => {
    try {
      await supabase
        .from('draw_strokes')
        .insert({
          room_id: roomId,
          player_id: playerId,
          stroke_data: strokeData
        })
    } catch (error) {
      console.error('Error saving stroke:', error)
    }
  }

  const drawFromStroke = (strokeData: DrawPoint[]) => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    
    strokeData.forEach((point, index) => {
      if (point.isNewStroke || index === 0) {
        ctx.beginPath()
        ctx.moveTo(point.x, point.y)
      } else {
        ctx.lineTo(point.x, point.y)
        ctx.strokeStyle = point.color
        ctx.lineWidth = point.size
        ctx.lineCap = 'round'
        ctx.stroke()
      }
    })
  }

  const clearCanvas = async () => {
    if (!isCurrentPlayer) return
    
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Clear strokes from database
    try {
      await supabase
        .from('draw_strokes')
        .delete()
        .eq('room_id', roomId)
    } catch (error) {
      console.error('Error clearing canvas:', error)
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
        await supabase
          .from('players')
          .update({ score: supabase.raw('score + 10') })
          .eq('id', playerId)
        
        toast.success('Correct guess! +10 points')
        handleRoundEnd()
      }
    } catch (error) {
      console.error('Error submitting guess:', error)
    }
    
    setCurrentGuess('')
  }

  const handleRoundEnd = async () => {
    if (!room) return
    
    const nextRound = room.round_number + 1
    const currentPlayerIndex = players.findIndex(p => p.id === room.current_player_id)
    const nextPlayerIndex = (currentPlayerIndex + 1) % players.length
    const nextPlayer = players[nextPlayerIndex]
    
    if (nextRound <= room.max_rounds) {
      // Start next round
      const newWord = getRandomWord()
      
      try {
        await supabase
          .from('game_rooms')
          .update({
            round_number: nextRound,
            current_player_id: nextPlayer.id,
            current_word: newWord
          })
          .eq('id', roomId)
        
        // Clear canvas
        clearCanvas()
        setTimeLeft(room.time_per_round)
      } catch (error) {
        console.error('Error ending round:', error)
      }
    } else {
      // End game
      try {
        await supabase
          .from('game_rooms')
          .update({ is_active: false })
          .eq('id', roomId)
        
        toast.success('Game finished!')
      } catch (error) {
        console.error('Error ending game:', error)
      }
    }
  }

  const startNewRound = async () => {
    if (!room) return
    
    const randomWord = getRandomWord()
    const firstPlayer = players[0]
    
    try {
      await supabase
        .from('game_rooms')
        .update({
          current_player_id: firstPlayer.id,
          current_word: randomWord,
          round_number: 1,
          is_active: true
        })
        .eq('id', roomId)
      
      clearCanvas()
      setTimeLeft(room.time_per_round)
    } catch (error) {
      console.error('Error starting new round:', error)
    }
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300 flex items-center justify-center">
        <div className="text-white text-2xl">Loading game...</div>
      </div>
    )
  }

  const currentPlayer = players.find(p => p.id === room.current_player_id)
  const isGameActive = room.is_active

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
            <h1 className="text-4xl font-bold text-white drop-shadow-lg">{room.name}</h1>
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
                        {currentPlayer?.name || 'Waiting...'}
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
            <Card className="border-4 border-green-600 shadow-xl bg-white/95">
              <CardContent className="p-6">
                {/* Drawing Tools */}
                {isCurrentPlayer && isGameActive && (
                  <div className="mb-4 flex items-center gap-4 flex-wrap">
                    <div className="flex gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setCurrentColor(color)}
                          className={`w-8 h-8 rounded-full border-2 ${
                            currentColor === color ? 'border-gray-800 scale-110' : 'border-gray-400'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    
                    <Separator orientation="vertical" className="h-8" />
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Size:</span>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-sm w-8">{brushSize}px</span>
                    </div>
                    
                    <Separator orientation="vertical" className="h-8" />
                    
                    <Button 
                      onClick={clearCanvas}
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                  </div>
                )}

                {/* Canvas */}
                <div className="bg-white rounded-lg border-4 border-gray-300 p-2">
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={500}
                    className="w-full border border-gray-200 rounded cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                  />
                </div>

                {!isGameActive && (
                  <div className="mt-4 text-center">
                    <p className="text-xl font-bold text-gray-600 mb-4">Game Over!</p>
                    <Button 
                      onClick={startNewRound}
                      className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Start New Game
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
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
          </div>
        </div>
      </div>
    </div>
  )
}

const getRandomWord = () => {
  const randomIndex = Math.floor(Math.random() * DRAWING_WORDS.length)
  return DRAWING_WORDS[randomIndex]
}