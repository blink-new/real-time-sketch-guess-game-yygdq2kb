import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { supabase } from '../lib/supabase'
import { MessageCircle, Send, CheckCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface Guess {
  id: string
  player_name: string
  guess: string
  is_correct: boolean
  created_at: string
}

interface ChatPanelProps {
  roomId: string
  playerId: string
  currentWord: string | null
  isDrawing: boolean
}

export function ChatPanel({ roomId, playerId, currentWord, isDrawing }: ChatPanelProps) {
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [newGuess, setNewGuess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchGuesses()
    setupRealTimeSubscription()
  }, [roomId])

  useEffect(() => {
    scrollToBottom()
  }, [guesses])

  const fetchGuesses = async () => {
    try {
      const { data, error } = await supabase
        .from('guesses')
        .select(`
          id,
          guess,
          is_correct,
          created_at,
          players!inner(name)
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })

      if (error) throw error

      const formattedGuesses = data.map(guess => ({
        id: guess.id,
        player_name: (guess.players as { name: string }).name,
        guess: guess.guess,
        is_correct: guess.is_correct,
        created_at: guess.created_at
      }))

      setGuesses(formattedGuesses)
    } catch (error) {
      console.error('Failed to fetch guesses:', error)
    }
  }

  const setupRealTimeSubscription = () => {
    const subscription = supabase
      .channel(`guesses-${roomId}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guesses',
          filter: `room_id=eq.${roomId}`
        },
        () => {
          fetchGuesses() // Refetch to get player names
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const submitGuess = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newGuess.trim() || isDrawing || isSubmitting) return

    setIsSubmitting(true)
    
    try {
      // Check if guess is correct
      const isCorrect = currentWord && 
        newGuess.toLowerCase().trim() === currentWord.toLowerCase().trim()

      // Submit guess
      const { error } = await supabase
        .from('guesses')
        .insert({
          room_id: roomId,
          player_id: playerId,
          guess: newGuess.trim(),
          is_correct: isCorrect || false
        })

      if (error) throw error

      // If correct, update player score
      if (isCorrect) {
        const { error: scoreError } = await supabase
          .from('players')
          .update({ 
            score: supabase.sql`score + 10` 
          })
          .eq('id', playerId)

        if (scoreError) throw scoreError
        
        toast.success('Correct! +10 points!')
      }

      setNewGuess('')
    } catch (error) {
      console.error('Failed to submit guess:', error)
      toast.error('Failed to submit guess')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <Card className="border-4 border-blue-500 shadow-xl bg-white/90 backdrop-blur h-96 flex flex-col">
      <CardHeader className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-t-lg py-3">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <MessageCircle className="w-6 h-6" />
          Chat & Guesses
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {guesses.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">
              No guesses yet... Start guessing! 
            </div>
          ) : (
            guesses.map((guess) => (
              <div 
                key={guess.id}
                className={`flex items-start gap-2 p-3 rounded-lg ${
                  guess.is_correct 
                    ? 'bg-gradient-to-r from-green-100 to-green-200 border-2 border-green-400' 
                    : 'bg-gradient-to-r from-gray-100 to-blue-100 border-2 border-blue-200'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-purple-700">
                      {guess.player_name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTime(guess.created_at)}
                    </span>
                    {guess.is_correct && (
                      <Badge className="bg-green-500 text-white text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Correct!
                      </Badge>
                    )}
                  </div>
                  <div className="text-lg font-medium">
                    {guess.is_correct ? (
                      <span className="text-green-700">  {guess.guess}</span>
                    ) : (
                      guess.guess
                    )}
                  </div>
                </div>
                {guess.is_correct ? (
                  <CheckCircle className="w-5 h-5 text-green-600 mt-1" />
                ) : (
                  <X className="w-5 h-5 text-gray-400 mt-1" />
                )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Form */}
        {!isDrawing && (
          <div className="border-t-2 border-blue-200 p-4 bg-gradient-to-r from-blue-50 to-cyan-50">
            <form onSubmit={submitGuess} className="flex gap-2">
              <Input
                value={newGuess}
                onChange={(e) => setNewGuess(e.target.value)}
                placeholder="Enter your guess..."
                disabled={isSubmitting}
                className="border-2 border-blue-300 focus:border-blue-500 text-lg"
              />
              <Button 
                type="submit"
                disabled={!newGuess.trim() || isSubmitting}
                className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 px-4"
              >
                <Send className="w-5 h-5" />
              </Button>
            </form>
            <div className="text-xs text-gray-600 mt-2 text-center">
               Tip: Type exactly what you see being drawn!
            </div>
          </div>
        )}

        {isDrawing && (
          <div className="border-t-2 border-blue-200 p-4 bg-gradient-to-r from-yellow-100 to-orange-100 text-center">
            <p className="text-yellow-800 font-semibold">
               You're drawing! Others will guess your artwork.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}