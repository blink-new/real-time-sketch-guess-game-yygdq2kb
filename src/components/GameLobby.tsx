import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { supabase } from '../lib/supabase'
import { Palette, Users, Play, Copy } from 'lucide-react'
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

interface GameLobbyProps {
  onStartGame: (roomId: string, playerId: string) => void
}

export function GameLobby({ onStartGame }: GameLobbyProps) {
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [rooms, setRooms] = useState<GameRoom[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [currentRoom, setCurrentRoom] = useState<GameRoom | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchActiveRooms()
  }, [])

  useEffect(() => {
    if (currentRoom) {
      fetchPlayers()
    }
  }, [currentRoom])

  const fetchActiveRooms = async () => {
    const { data, error } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Failed to fetch rooms')
      return
    }

    setRooms(data || [])
  }

  const fetchPlayers = async () => {
    if (!currentRoom) return
    
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', currentRoom.id)
      .order('score', { ascending: false })

    if (error) {
      toast.error('Failed to fetch players')
      return
    }

    setPlayers(data || [])
  }

  const createRoom = async () => {
    if (!playerName.trim()) {
      toast.error('Please enter your name')
      return
    }

    setIsLoading(true)
    try {
      // Create room
      const { data: roomData, error: roomError } = await supabase
        .from('game_rooms')
        .insert({
          name: `${playerName}'s Room`,
          host_id: crypto.randomUUID()
        })
        .select()
        .single()

      if (roomError) throw roomError

      // Create player
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: roomData.id,
          name: playerName,
          is_host: true
        })
        .select()
        .single()

      if (playerError) throw playerError

      setCurrentRoom(roomData)
      setCurrentPlayer(playerData)
      toast.success('Room created!')
      
    } catch (error) {
      toast.error('Failed to create room')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const joinRoom = async (roomId: string) => {
    if (!playerName.trim()) {
      toast.error('Please enter your name')
      return
    }

    setIsLoading(true)
    try {
      // Create player
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: roomId,
          name: playerName,
          is_host: false
        })
        .select()
        .single()

      if (playerError) throw playerError

      const room = rooms.find(r => r.id === roomId)
      setCurrentRoom(room || null)
      setCurrentPlayer(playerData)
      toast.success('Joined room!')
      
    } catch (error) {
      toast.error('Failed to join room')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const startGame = () => {
    if (currentRoom && currentPlayer) {
      onStartGame(currentRoom.id, currentPlayer.id)
    }
  }

  const copyRoomCode = () => {
    if (currentRoom) {
      navigator.clipboard.writeText(currentRoom.id)
      toast.success('Room code copied!')
    }
  }

  if (currentRoom && currentPlayer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300 p-4">
        <div className="max-w-4xl mx-auto">
          <Card className="border-4 border-purple-600 shadow-2xl bg-white/90 backdrop-blur">
            <CardHeader className="text-center bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-lg">
              <CardTitle className="text-3xl font-bold flex items-center justify-center gap-2">
                <Palette className="w-8 h-8" />
                {currentRoom.name}
              </CardTitle>
              <div className="flex items-center justify-center gap-4 mt-2">
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  Room Code: {currentRoom.id.slice(0, 8).toUpperCase()}
                </Badge>
                <Button 
                  onClick={copyRoomCode}
                  variant="outline" 
                  size="sm"
                  className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-bold mb-4 text-purple-700">Players ({players.length})</h3>
                  <div className="space-y-2">
                    {players.map((player) => (
                      <div 
                        key={player.id}
                        className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-100 to-purple-100 rounded-lg border-2 border-blue-200"
                      >
                        <div className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-blue-600" />
                          <span className="font-semibold">{player.name}</span>
                          {player.is_host && (
                            <Badge className="bg-yellow-400 text-yellow-900">Host</Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">Score</div>
                          <div className="font-bold text-lg">{player.score}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-2xl font-bold mb-4 text-purple-700">Game Settings</h3>
                  <div className="space-y-4 p-4 bg-gradient-to-r from-green-100 to-blue-100 rounded-lg border-2 border-green-200">
                    <div className="flex justify-between">
                      <span>Rounds:</span>
                      <Badge variant="outline">{currentRoom.max_rounds}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Time per round:</span>
                      <Badge variant="outline">{currentRoom.time_per_round}s</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Current round:</span>
                      <Badge variant="outline">{currentRoom.round_number}</Badge>
                    </div>
                  </div>

                  {currentPlayer.is_host && (
                    <Button 
                      onClick={startGame}
                      className="w-full mt-6 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-3 text-lg rounded-xl shadow-lg transform transition hover:scale-105"
                      disabled={players.length < 2}
                    >
                      <Play className="w-6 h-6 mr-2" />
                      Start Game!
                    </Button>
                  )}

                  {!currentPlayer.is_host && (
                    <div className="mt-6 p-4 bg-yellow-100 rounded-lg border-2 border-yellow-300 text-center">
                      <p className="text-yellow-800 font-semibold">
                        Waiting for host to start the game...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-white mb-4 drop-shadow-2xl">
            🎨 Sketch & Guess
          </h1>
          <p className="text-xl text-white/90 font-medium">
            Draw, guess, and have fun with friends!
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Room */}
          <Card className="border-4 border-purple-600 shadow-2xl bg-white/90 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-lg">
              <CardTitle className="text-2xl font-bold text-center">Create Room</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <Input
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="border-2 border-purple-300 focus:border-purple-500 text-lg"
                />
                <Button 
                  onClick={createRoom}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 text-lg rounded-xl shadow-lg transform transition hover:scale-105"
                >
                  {isLoading ? 'Creating...' : 'Create Room'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Join Room */}
          <Card className="border-4 border-blue-600 shadow-2xl bg-white/90 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-t-lg">
              <CardTitle className="text-2xl font-bold text-center">Join Room</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <Input
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="border-2 border-blue-300 focus:border-blue-500 text-lg"
                />
                <Input
                  placeholder="Room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="border-2 border-blue-300 focus:border-blue-500 text-lg"
                />
                <Button 
                  onClick={() => joinRoom(roomCode)}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold py-3 text-lg rounded-xl shadow-lg transform transition hover:scale-105"
                >
                  {isLoading ? 'Joining...' : 'Join Room'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Rooms */}
        {rooms.length > 0 && (
          <Card className="mt-8 border-4 border-green-600 shadow-2xl bg-white/90 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-t-lg">
              <CardTitle className="text-2xl font-bold text-center">Active Rooms</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-4">
                {rooms.map((room) => (
                  <div 
                    key={room.id}
                    className="flex items-center justify-between p-4 bg-gradient-to-r from-green-100 to-teal-100 rounded-lg border-2 border-green-200"
                  >
                    <div>
                      <h3 className="font-bold text-lg">{room.name}</h3>
                      <p className="text-sm text-gray-600">Round {room.round_number}/{room.max_rounds}</p>
                    </div>
                    <Button 
                      onClick={() => joinRoom(room.id)}
                      disabled={isLoading}
                      className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600"
                    >
                      Join
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}