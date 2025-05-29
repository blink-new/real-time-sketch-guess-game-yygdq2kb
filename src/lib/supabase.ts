import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mkhihqrwpfotiluykfin.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1raGlocXJ3cGZvdGlsdXlrZmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0OTc2NzksImV4cCI6MjA2NDA3MzY3OX0.BeyvBUk2YFyaceM1AwsQ7lh2_0RlTi3ZR9ValmFL5J4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Tables = {
  game_rooms: {
    id: string
    name: string
    host_id: string
    current_player_id: string | null
    current_word: string | null
    round_number: number
    max_rounds: number
    time_per_round: number
    is_active: boolean
    created_at: string
  }
  players: {
    id: string
    room_id: string
    name: string
    score: number
    is_host: boolean
    is_online: boolean
    created_at: string
  }
  draw_strokes: {
    id: string
    room_id: string
    player_id: string
    stroke_data: {
      x: number
      y: number
      color: string
      size: number
      isNewStroke: boolean
    }[]
    created_at: string
  }
  guesses: {
    id: string
    room_id: string
    player_id: string
    guess: string
    is_correct: boolean
    created_at: string
  }
}