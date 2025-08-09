import React from 'react'

export default function FloatingDock(props: {
  onNewChat: () => void
  onSettings: () => void
  onScrollBottom: () => void
  reasoningEnabled: boolean
  onToggleReasoning: () => void
  disabled?: boolean
}) {
  const { onNewChat, onSettings, onScrollBottom, reasoningEnabled, onToggleReasoning, disabled } = props
  const itemCls = 'flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-white/10 border border-white/10 bg-slate-900/50 backdrop-blur'
  const iconDot = (active: boolean) => (
    <span className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-400'}`} />
  )
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30">
      <div className="flex items-center gap-3 px-3 py-2 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur shadow-lg">
        <button className={itemCls} onClick={onNewChat} disabled={disabled} title="New chat">
          <span className="text-xs text-slate-200">New</span>
        </button>
        <button className={itemCls} onClick={onScrollBottom} title="Scroll to latest">
          <span className="text-xs text-slate-200">Bottom</span>
        </button>
        <button className={itemCls} onClick={onToggleReasoning} title="Toggle reasoning">
          {iconDot(reasoningEnabled)}
          <span className="text-xs text-slate-200">Reason</span>
        </button>
        <button className={itemCls} onClick={onSettings} title="Settings">
          <span className="text-xs text-slate-200">Settings</span>
        </button>
      </div>
    </div>
  )
}
