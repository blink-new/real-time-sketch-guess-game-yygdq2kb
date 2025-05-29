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

  // Set up real-time subscriptions when in a room
  useEffect(() => {
    if (!currentRoom) return

    const roomChannel = supabase
      .channel(`room-${currentRoom.id}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${currentRoom.id}` },
        (payload) => {
          console.log('Room updated:', payload)
          if (payload.eventType === 'UPDATE') {
            setCurrentRoom(payload.new as GameRoom)
          }
        }
      )
      .subscribe()

    const playersChannel = supabase
      .channel(`players-${currentRoom.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${currentRoom.id}` },
        () => {
          console.log('Players updated')
          fetchPlayersInRoom(currentRoom.id)
        }
      )
      .subscribe()

    // Initial fetch of players
    fetchPlayersInRoom(currentRoom.id)

    return () => {
      supabase.removeChannel(roomChannel)
      supabase.removeChannel(playersChannel)
    }
  }, [currentRoom])

  const fetchActiveRooms = async () => {
    const { data, error } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching rooms:', error)
      toast.error('Failed to fetch rooms')
      return
    }

    setRooms(data || [])
  }

  const fetchPlayersInRoom = async (roomId: string) => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching players:', error)
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
          host_id: crypto.randomUUID(),
          max_rounds: 5,
          time_per_round: 60,
          round_number: 1,
          is_active: true
        })
        .select()
        .single()

      if (roomError) {
        console.error('Room creation error:', roomError)
        throw roomError
      }

      console.log('Room created:', roomData)

      // Create player
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: roomData.id,
          name: playerName.trim(),
          is_host: true,
          score: 0,
          is_online: true
        })
        .select()
        .single()

      if (playerError) {
        console.error('Player creation error:', playerError)
        throw playerError
      }

      console.log('Player created:', playerData)

      setCurrentRoom(roomData)
      setCurrentPlayer(playerData)
      toast.success('Room created! Share the room code with friends.')
      
    } catch (error) {
      console.error('Create room error:', error)
      toast.error('Failed to create room')
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
      // First check if room exists
      const { data: roomData, error: roomError } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('id', roomId)
        .eq('is_active', true)
        .single()

      if (roomError || !roomData) {
        throw new Error('Room not found or inactive')
      }

      // Create player
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: roomId,
          name: playerName.trim(),
          is_host: false,
          score: 0,
          is_online: true
        })
        .select()
        .single()

      if (playerError) {
        console.error('Player join error:', playerError)
        throw playerError
      }

      console.log('Player joined:', playerData)

      setCurrentRoom(roomData)
      setCurrentPlayer(playerData)
      toast.success('Joined room!')
      
    } catch (error) {
      console.error('Join room error:', error)
      toast.error('Failed to join room')
    } finally {
      setIsLoading(false)
    }
  }

  const startGame = async () => {
    if (!currentRoom || !currentPlayer || !currentPlayer.is_host) {
      toast.error('Only the host can start the game')
      return
    }

    if (players.length < 2) {
      toast.error('Need at least 2 players to start')
      return
    }

    try {
      // Pick a random word and first player
      const words = ['Cat', 'Dog', 'House', 'Tree', 'Car', 'Sun', 'Moon', 'Star', 'Fish', 'Bird']
      const randomWord = words[Math.floor(Math.random() * words.length)]
      const firstPlayer = players.find(p => p.is_host) || players[0]

      await supabase
        .from('game_rooms')
        .update({
          current_player_id: firstPlayer.id,
          current_word: randomWord,
          round_number: 1
        })
        .eq('id', currentRoom.id)

      onStartGame(currentRoom.id, currentPlayer.id)
    } catch (error) {
      console.error('Start game error:', error)
      toast.error('Failed to start game')
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