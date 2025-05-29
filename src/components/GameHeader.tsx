import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent } from './ui/card'
import { ArrowLeft, Clock, Users, Trophy, Palette } from 'lucide-react'

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

interface GameHeaderProps {
  room: GameRoom
  players: Player[]
  currentPlayer: Player
  timeLeft: number
  onLeaveGame: () => void
}

export function GameHeader({ room, players, currentPlayer, timeLeft, onLeaveGame }: GameHeaderProps) {
  const currentDrawingPlayer = players.find(p => p.id === room.current_player_id)
  const isCurrentPlayerDrawing = room.current_player_id === currentPlayer.id

  return (
    <div className="space-y-4">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between">
        <Button 
          onClick={onLeaveGame}
          variant="outline"
          className="bg-white/20 border-white/30 text-white hover:bg-white/30"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Leave Game
        </Button>
        
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white drop-shadow-2xl">{room.name}</h1>
          <p className="text-white/90 text-lg">Round {room.round_number} of {room.max_rounds}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <Badge className="bg-red-500 text-white text-lg px-4 py-2 border-2 border-red-300">
            <Clock className="w-5 h-5 mr-2" />
            {timeLeft}s
          </Badge>
        </div>
      </div>

      {/* Game Status Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Current Artist */}
        <Card className="border-4 border-blue-500 shadow-xl bg-white/95">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Palette className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 font-medium">Current Artist</p>
                <p className="text-2xl font-bold text-blue-700">
                  {currentDrawingPlayer?.name || 'Waiting...'}
                </p>
                {isCurrentPlayerDrawing && room.current_word && (
                  <p className="text-lg text-green-600 font-semibold">
                    Draw: {room.current_word}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Players & Scores */}
        <Card className="border-4 border-purple-500 shadow-xl bg-white/95">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600 font-medium">Players</p>
                  <p className="text-2xl font-bold text-purple-700">{players.length}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-600" />
                <div className="text-right">
                  <p className="text-sm text-gray-600 font-medium">Your Score</p>
                  <p className="text-2xl font-bold text-yellow-600">{currentPlayer.score}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}