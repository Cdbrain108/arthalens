import { useState, useEffect, useRef } from 'react'

export default function TypingText({
  text = '',
  speed = 14,
  showCursor = true,
  onComplete,
  className = ''
}) {
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef(null)
  const completeRef = useRef(onComplete)
  useEffect(() => { completeRef.current = onComplete }, [onComplete])

  useEffect(() => {
    if (!text) {
      setDisplayedText('')
      return
    }

    // Reset and start typing
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayedText(text)
      setIsTyping(false)
      completeRef.current?.()
      return undefined
    }
    setDisplayedText('')
    indexRef.current = 0
    setIsTyping(true)

    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      indexRef.current += 1
      const current = text.slice(0, indexRef.current)
      setDisplayedText(current)

      if (indexRef.current >= text.length) {
        clearInterval(timerRef.current)
        setIsTyping(false)
        completeRef.current?.()
      }
    }, speed)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [text, speed])

  return (
    <span className={`inline ${className}`}>
      {displayedText}
      {isTyping && showCursor && (
        <span className="typing-cursor inline-block w-[2px] h-[1em] bg-[#8ab4f8] ml-0.5 align-middle animate-pulse" />
      )}
    </span>
  )
}
