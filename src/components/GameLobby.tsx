import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { supabase } from '../lib/supabase'
import { Palette, Users, Play, Copy, LogIn, UserPlus } from 'lucide-react'
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
  const [isNameSet, setIsNameSet] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [rooms, setRooms] = useState<GameRoom[]>([])
  const [currentRoom, setCurrentRoom] = useState<GameRoom | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Load saved player name from localStorage
    const savedName = localStorage.getItem('sketch-guess-player-name')
    if (savedName) {
      setPlayerName(savedName)
      setIsNameSet(true)
    }
    
    fetchActiveRooms()
  }, [])

  useEffect(() => {
    fetchActiveRooms()
    if (currentRoom) {
      fetchPlayersForRoom()
      setupPlayerSubscription()
    }
  }, [currentRoom])

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
      .channel(`lobby-${currentRoom.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${currentRoom.id}` },
        () => {
          console.log('Players updated')
          fetchPlayersForRoom()
        }
      )
      .subscribe()

    // Initial fetch of players
    fetchPlayersForRoom()

    return () => {
      supabase.removeChannel(roomChannel)
      supabase.removeChannel(playersChannel)
    }
  }, [currentRoom])

  const savePlayerName = (name: string) => {
    localStorage.setItem('sketch-guess-player-name', name)
    setPlayerName(name)
    setIsNameSet(true)
  }

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

  const fetchPlayersForRoom = async () => {
    if (!currentRoom) return

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', currentRoom.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to fetch players:', error)
      return
    }

    setPlayers(data || [])
  }

  const setupPlayerSubscription = () => {
    if (!currentRoom) return

    const subscription = supabase
      .channel(`lobby-players-${currentRoom.id}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${currentRoom.id}`
        },
        () => {
          fetchPlayersForRoom()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }

  const createRoom = async () => {
    if (!isNameSet) {
      toast.error('Please set your name first')
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
    if (!isNameSet) {
      toast.error('Please set your name first')
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

  const resetName = () => {
    localStorage.removeItem('sketch-guess-player-name')
    setPlayerName('')
    setIsNameSet(false)
  }

  // Name setup screen
  if (!isNameSet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300 flex items-center justify-center">
        <Card className="w-full max-w-md border-4 border-purple-600 shadow-2xl bg-white/95 backdrop-blur">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-lg text-center">
            <CardTitle className="text-3xl font-bold flex items-center justify-center gap-2">
              <Palette className="w-8 h-8" />
              Welcome!
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Set Your Name</h2>
                <p className="text-gray-600">Choose a name to play with friends</p>
              </div>
              <Input
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="border-2 border-purple-300 focus:border-purple-500 text-lg h-12"
                onKeyPress={(e) => e.key === 'Enter' && playerName.trim() && savePlayerName(playerName.trim())}
              />
              <Button 
                onClick={() => savePlayerName(playerName.trim())}
                disabled={!playerName.trim()}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 text-lg rounded-xl shadow-lg transform transition hover:scale-105 h-12"
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (currentRoom && currentPlayer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Card className="border-4 border-purple-600 shadow-2xl bg-white/95 backdrop-blur">
            <CardHeader className="text-center bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-lg">
              <div className="flex items-center justify-between">
                <Button 
                  onClick={resetName}
                  variant="outline" 
                  size="sm"
                  className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                >
                  Change Name
                </Button>
                <CardTitle className="text-3xl font-bold flex items-center gap-2">
                  <Palette className="w-8 h-8" />
                  {currentRoom.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-lg px-4 py-1">
                    {currentRoom.id.slice(0, 8).toUpperCase()}
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
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid lg:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-bold mb-6 text-purple-700 flex items-center gap-2">
                    <Users className="w-6 h-6" />
                    Players ({players.length})
                  </h3>
                  <div className="space-y-3">
                    {players.map((player) => (
                      <div 
                        key={player.id}
                        className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold text-lg">
                            {player.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-800">{player.name}</span>
                            {player.is_host && (
                              <Badge className="ml-2 bg-yellow-400 text-yellow-900">Host</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500">Score</div>
                          <div className="font-bold text-xl text-purple-600">{player.score}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-2xl font-bold mb-6 text-purple-700">Game Settings</h3>
                  <div className="space-y-4 p-6 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl border-2 border-green-200">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 font-medium">Total Rounds:</span>
                      <Badge variant="outline" className="text-lg px-3 py-1">{currentRoom.max_rounds}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 font-medium">Time per round:</span>
                      <Badge variant="outline" className="text-lg px-3 py-1">{currentRoom.time_per_round}s</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 font-medium">Current round:</span>
                      <Badge variant="outline" className="text-lg px-3 py-1">{currentRoom.round_number}</Badge>
                    </div>
                  </div>

                  {currentPlayer.is_host && (
                    <Button 
                      onClick={startGame}
                      className="w-full mt-8 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-4 text-xl rounded-xl shadow-lg transform transition hover:scale-105"
                      disabled={players.length < 2}
                    >
                      <Play className="w-6 h-6 mr-2" />
                      Start Game!
                    </Button>
                  )}

                  {!currentPlayer.is_host && (
                    <div className="mt-8 p-6 bg-yellow-50 rounded-xl border-2 border-yellow-300 text-center">
                      <p className="text-yellow-800 font-semibold text-lg">
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
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-300 to-yellow-300">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-white mb-4 drop-shadow-2xl">
            🎨 Sketch & Guess
          </h1>
          <p className="text-2xl text-white/90 font-medium mb-4">
            Draw, guess, and have fun with friends!
          </p>
          <div className="flex items-center justify-center gap-4">
            <Badge className="bg-white/20 backdrop-blur text-white text-lg px-4 py-2">
              Welcome, {playerName}!
            </Badge>
            <Button 
              onClick={resetName}
              variant="outline"
              size="sm"
              className="bg-white/20 border-white/30 text-white hover:bg-white/30"
            >
              Change Name
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Create Room */}
          <Card className="border-4 border-purple-600 shadow-2xl bg-white/95 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-lg">
              <CardTitle className="text-3xl font-bold text-center flex items-center justify-center gap-2">
                <UserPlus className="w-8 h-8" />
                Create Room
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="text-center space-y-6">
                <p className="text-gray-600 text-lg">Start a new game and invite friends to join!</p>
                <Button 
                  onClick={createRoom}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-4 text-xl rounded-xl shadow-lg transform transition hover:scale-105"
                >
                  {isLoading ? 'Creating...' : 'Create New Room'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Join Room */}
          <Card className="border-4 border-blue-600 shadow-2xl bg-white/95 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-t-lg">
              <CardTitle className="text-3xl font-bold text-center flex items-center justify-center gap-2">
                <LogIn className="w-8 h-8" />
                Join Room
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="space-y-6">
                <p className="text-gray-600 text-lg text-center">Enter a room code to join an existing game</p>
                <Input
                  placeholder="Enter room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="border-2 border-blue-300 focus:border-blue-500 text-lg h-12"
                  onKeyPress={(e) => e.key === 'Enter' && roomCode.trim() && joinRoom(roomCode)}
                />
                <Button 
                  onClick={() => joinRoom(roomCode)}
                  disabled={isLoading || !roomCode.trim()}
                  className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold py-4 text-xl rounded-xl shadow-lg transform transition hover:scale-105"
                >
                  {isLoading ? 'Joining...' : 'Join Room'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Rooms */}
        {rooms.length > 0 && (
          <Card className="border-4 border-green-600 shadow-2xl bg-white/95 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-t-lg">
              <CardTitle className="text-3xl font-bold text-center flex items-center justify-center gap-2">
                <Users className="w-8 h-8" />
                Active Rooms ({rooms.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rooms.map((room) => (
                  <div 
                    key={room.id}
                    className="p-6 bg-gradient-to-r from-green-50 to-teal-50 rounded-xl border-2 border-green-200 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="mb-4">
                      <h3 className="font-bold text-xl text-gray-800 mb-2">{room.name}</h3>
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Round {room.round_number}/{room.max_rounds}</span>
                        <span>{room.time_per_round}s per round</span>
                      </div>
                      <Badge variant="outline" className="text-sm">
                        Room: {room.id.slice(0, 8).toUpperCase()}
                      </Badge>
                    </div>
                    <Button 
                      onClick={() => joinRoom(room.id)}
                      disabled={isLoading}
                      className="w-full bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-bold py-3 rounded-lg shadow transform transition hover:scale-105"
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      Join Room
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