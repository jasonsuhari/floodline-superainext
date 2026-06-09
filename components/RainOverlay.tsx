'use client'

import { useEffect, useRef } from 'react'

interface RainDrop {
  x: number
  y: number
  length: number
  speed: number
  opacity: number
  width: number
}

const RAIN_COUNT = 180

function initDrop(canvasWidth: number, canvasHeight: number, randomY = false): RainDrop {
  return {
    x: Math.random() * (canvasWidth + 200) - 100,
    y: randomY ? Math.random() * canvasHeight : -Math.random() * canvasHeight,
    length: 10 + Math.random() * 18,
    speed: 8 + Math.random() * 10,
    opacity: 0.15 + Math.random() * 0.35,
    width: 0.5 + Math.random() * 0.8,
  }
}

interface Props {
  active: boolean
}

export default function RainOverlay({ active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const dropsRef = useRef<RainDrop[]>([])
  const activeRef = useRef(active)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      dropsRef.current = Array.from({ length: RAIN_COUNT }, () =>
        initDrop(canvas.width, canvas.height, true)
      )
    }

    resize()
    window.addEventListener('resize', resize)

    const angle = 0.12
    const dx = Math.sin(angle)
    const dy = Math.cos(angle)

    const tick = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      if (activeRef.current) {
        for (const drop of dropsRef.current) {
          ctx.beginPath()
          ctx.moveTo(drop.x, drop.y)
          ctx.lineTo(drop.x + dx * drop.length, drop.y + dy * drop.length)
          ctx.strokeStyle = `rgba(174, 214, 241, ${drop.opacity})`
          ctx.lineWidth = drop.width
          ctx.stroke()

          drop.x += dx * drop.speed + 0.4
          drop.y += dy * drop.speed

          if (drop.y > h + 30) {
            drop.x = Math.random() * (w + 200) - 100
            drop.y = -drop.length - Math.random() * 40
          }
        }
      }

      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  )
}
