import React from 'react'

/**
 * Animated background gradient that adapts to theme colors via CSS variables.
 * Uses CSS in index.css (.gradient-ambient and keyframes) for animation.
 */
export default function BackgroundGradient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="gradient-ambient" />
    </div>
  )
}
