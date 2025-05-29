import { useRef, useEffect, useState, useCallback } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { supabase } from '../lib/supabase'
import { Eraser, Palette, RotateCcw, Circle } from 'lucide-react'

interface DrawingCanvasProps {
  roomId: string
  playerId: string
  isDrawer: boolean
  currentWord: string | null
  onClearCanvas: () => void
}

interface Point {
  x: number
  y: number
  color: string
  size: number
  isNewStroke: boolean
}

const COLORS = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#FFC0CB']

export function DrawingCanvas({ roomId, playerId, isDrawer, currentWord, onClearCanvas }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawingLocal, setIsDrawingLocal] = useState(false)
  const [currentColor, setCurrentColor] = useState('#000000')
  const [brushSize, setBrushSize] = useState(5)
  const [strokes, setStrokes] = useState<Point[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = 800
    canvas.height = 600

    // Set initial canvas style
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Subscribe to real-time drawing updates
    const subscription = supabase
      .channel(`drawing-${roomId}`)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'draw_strokes',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          const strokeData = payload.new.stroke_data as Point[]
          drawStroke(ctx, strokeData)
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [roomId])

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, points: Point[]) => {
    if (points.length === 0) return

    points.forEach((point, index) => {
      if (point.isNewStroke || index === 0) {
        ctx.beginPath()
        ctx.moveTo(point.x, point.y)
      } else {
        ctx.lineWidth = point.size
        ctx.strokeStyle = point.color
        ctx.lineTo(point.x, point.y)
        ctx.stroke()
      }
    })
  }, [])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return
    
    setIsDrawingLocal(true)
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const newPoint: Point = {
      x,
      y,
      color: currentColor,
      size: brushSize,
      isNewStroke: true
    }
    
    setStrokes([newPoint])
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawer || !isDrawingLocal) return
    
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const newPoint: Point = {
      x,
      y,
      color: currentColor,
      size: brushSize,
      isNewStroke: false
    }
    
    setStrokes(prev => [...prev, newPoint])

    // Draw locally for immediate feedback
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.lineWidth = brushSize
    ctx.strokeStyle = currentColor
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const handleMouseUp = async () => {
    if (!isDrawer || !isDrawingLocal || strokes.length === 0) return
    
    setIsDrawingLocal(false)
    
    // Save stroke to database for real-time sync
    try {
      await supabase
        .from('draw_strokes')
        .insert({
          room_id: roomId,
          player_id: playerId,
          stroke_data: strokes
        })
    } catch (error) {
      console.error('Failed to save stroke:', error)
    }
    
    setStrokes([])
  }

  const clearCanvas = async () => {
    onClearCanvas()
  }

  return (
    <div className="bg-white rounded-xl shadow-2xl border-4 border-purple-300 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-6 h-6" />
            <span className="font-bold text-lg">Drawing Canvas</span>
          </div>
          {currentWord && isDrawer && (
            <Badge className="bg-yellow-400 text-yellow-900 text-lg px-4 py-2">
              Draw: {currentWord}
            </Badge>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="p-4 bg-gray-50">
        <canvas
          ref={canvasRef}
          className="border-4 border-purple-200 rounded-lg bg-white cursor-crosshair shadow-lg"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>

      {/* Drawing Tools */}
      {isDrawer && (
        <div className="p-4 bg-gradient-to-r from-blue-100 to-purple-100 border-t-2 border-purple-200">
          <div className="flex flex-wrap items-center gap-4">
            {/* Color Palette */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-purple-700">Colors:</span>
              <div className="flex gap-1">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setCurrentColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      currentColor === color ? 'border-purple-600 scale-110' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Brush Size */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-purple-700">Size:</span>
              <div className="flex gap-1">
                {[2, 5, 10, 15].map((size) => (
                  <button
                    key={size}
                    onClick={() => setBrushSize(size)}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 ${
                      brushSize === size ? 'border-purple-600 bg-purple-100 scale-110' : 'border-gray-300 bg-white'
                    }`}
                  >
                    <Circle 
                      className="text-purple-600" 
                      size={Math.min(size, 20)}
                      fill="currentColor"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Tools */}
            <div className="flex gap-2 ml-auto">
              <Button
                onClick={() => setCurrentColor('#FFFFFF')}
                variant="outline"
                size="sm"
                className="border-gray-300 hover:bg-gray-100"
              >
                <Eraser className="w-4 h-4 mr-1" />
                Eraser
              </Button>
              <Button
                onClick={clearCanvas}
                variant="outline"
                size="sm"
                className="border-red-300 hover:bg-red-100 text-red-600"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Non-drawing state */}
      {!isDrawer && (
        <div className="p-8 text-center bg-gradient-to-r from-gray-100 to-blue-100">
          <p className="text-xl text-gray-600 font-semibold">
            👀 Watch and guess what's being drawn!
          </p>
        </div>
      )}
    </div>
  )
}