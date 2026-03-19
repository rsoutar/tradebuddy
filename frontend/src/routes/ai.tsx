import { Icon } from '@iconify/react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MarketConnectionBadge } from '../components/market-connection-badge'
import { ProtectedMenuButton, ProtectedShell } from '../components/protected-shell'
import { requireAuthenticatedViewer } from '../lib/protected-route'
import { getConnectionStatus } from '../lib/session'
import {
  useAiChat,
  type ChatConversation,
  type ChatMessage,
  type ToolCallIndicator,
} from '../hooks/use-ai-chat'
import { Route as RootRoute } from './__root'

const SUGGESTED_PROMPTS = [
  'What is the current BTC volatility regime and what grid settings suit it?',
  'Run a backtest on grid bot with 8 grids and 2% spacing over the last 90 days.',
  'Compare rebalance vs infinity-grid for current market conditions.',
  'What is my paper trading account status right now?',
  'Summarize historical BTC/USDT price data and key support/resistance levels.',
]

export const Route = createFileRoute('/ai')({
  beforeLoad: async () => {
    await requireAuthenticatedViewer()
  },
  loader: () => getConnectionStatus(),
  component: AIPage,
})

function AIPage() {
  const viewer = RootRoute.useLoaderData()
  const connection = Route.useLoaderData()
  const {
    messages,
    isStreaming,
    isLoadingHistory,
    error,
    sendMessage,
    stopStreaming,
    resetChat,
    conversations,
    conversationId,
    loadConversation,
    loadConversations,
  } = useAiChat()
  const [input, setInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    setInput('')
    sendMessage(trimmed)
  }, [input, isStreaming, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handlePromptClick = useCallback(
    (prompt: string) => {
      if (isStreaming) return
      setInput('')
      sendMessage(prompt)
    },
    [isStreaming, sendMessage],
  )

  const handleNewChat = useCallback(() => {
    resetChat()
    loadConversations()
  }, [resetChat, loadConversations])

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === conversationId) return
      loadConversation(id)
    },
    [conversationId, loadConversation],
  )

  return (
    <ProtectedShell
      activeNavId="ai"
      viewer={viewer.user!}
      header={({ openMenu }) => (
        <>
          <div className="flex items-center gap-4">
            <ProtectedMenuButton onClick={openMenu} />
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="hidden text-zinc-400 transition-colors hover:text-zinc-100 md:inline-flex"
              title={sidebarOpen ? 'Hide history' : 'Show history'}
            >
              <Icon icon="solar:sidebar-minimalistic-linear" width={20} height={20} />
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Research</p>
              <h1 className="text-lg font-medium tracking-tight text-zinc-100">AI analyst desk</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleNewChat}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
            >
              New chat
            </button>
            <MarketConnectionBadge connection={connection.connection} market={connection.market} />
          </div>
        </>
      )}
    >
      <div className="flex h-[calc(100vh-12rem)] gap-4">
        {/* Conversation sidebar */}
        {sidebarOpen && (
          <div className="hidden w-64 shrink-0 flex-col rounded-xl border border-zinc-800/60 bg-zinc-900/40 md:flex">
            <div className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                History
              </span>
              <button
                onClick={handleNewChat}
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                title="New chat"
              >
                <Icon icon="solar:pen-new-square-linear" width={14} height={14} />
              </button>
            </div>
            <ConversationList
              conversations={conversations}
              activeConversationId={conversationId}
              onSelect={handleSelectConversation}
            />
          </div>
        )}

        {/* Chat area */}
        <div className="flex flex-1 flex-col rounded-xl border border-zinc-800/60 bg-zinc-900/40">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
            {isLoadingHistory ? (
              <div className="flex h-full items-center justify-center">
                <Icon
                  icon="solar:refresh-line-duotone"
                  width={20}
                  height={20}
                  className="animate-spin text-zinc-600"
                />
              </div>
            ) : messages.length === 0 ? (
              <EmptyState onPromptClick={handlePromptClick} />
            ) : (
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} />
                ))}
                {error && (
                  <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-zinc-800/60 p-4">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 focus-within:border-zinc-600 transition">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about BTC strategy, settings, or market conditions..."
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
                  style={{ minHeight: '24px', maxHeight: '120px' }}
                />
                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200"
                  >
                    <Icon icon="solar:stop-line-duotone" width={16} height={16} />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Icon icon="solar:arrow-up-linear" width={16} height={16} />
                  </button>
                )}
              </div>
              <p className="mt-2 text-center text-[10px] text-zinc-600">
                AI suggestions are not financial advice. Always verify before executing trades.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ProtectedShell>
  )
}

function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
}: {
  conversations: ChatConversation[]
  activeConversationId: string | null
  onSelect: (id: string) => void
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="text-center text-xs text-zinc-600">
          No conversations yet.
          <br />
          Start a new chat to begin.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {conversations.map((conv) => {
        const isActive = conv.id === activeConversationId
        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
              isActive
                ? 'bg-zinc-800/50 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-200'
            }`}
          >
            <Icon
              icon="solar:chat-round-line-linear"
              width={14}
              height={14}
              className="shrink-0 opacity-60"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{conv.title}</p>
              <p className="text-[10px] text-zinc-600">{relativeTime(conv.updatedAt)}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function EmptyState({ onPromptClick }: { onPromptClick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/70">
        <Icon icon="solar:stars-line-duotone" width={24} height={24} className="text-zinc-400" />
      </div>
      <h2 className="mb-2 text-lg font-medium tracking-tight text-zinc-100">
        Strategy analyst at your service
      </h2>
      <p className="mb-8 max-w-md text-center text-sm text-zinc-500">
        Ask about market conditions, strategy settings, backtests, or your paper trading status.
        The agent pulls live data to give you specific, actionable analysis.
      </p>
      <div className="grid w-full max-w-2xl gap-3 md:grid-cols-2 lg:grid-cols-3">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPromptClick(prompt)}
            className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 text-left text-sm leading-6 text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900/60 hover:text-zinc-100"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

const markdownComponents = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="mb-2 mt-1 text-base font-semibold text-zinc-100" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mb-2 mt-1 text-sm font-semibold text-zinc-100" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mb-1 mt-1 text-sm font-medium text-zinc-100" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-2 last:mb-0" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-2 list-inside list-disc space-y-1 pl-1" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="mb-2 list-inside list-decimal space-y-1 pl-1" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => <li className="text-zinc-300" {...props} />,
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-zinc-100" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em className="text-zinc-400" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) =>
    props.inline ? (
      <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200" {...props} />
    ) : (
      <code
        className="my-2 block overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-200"
        {...props}
      />
    ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="my-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3" {...props} />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-left font-medium text-zinc-300"
      {...props}
    />
  ),
  td: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className="border border-zinc-800 px-2 py-1.5 text-zinc-400" {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="my-2 border-l-2 border-zinc-700 pl-3 text-zinc-400 italic"
      {...props}
    />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-blue-400 underline hover:text-blue-300" {...props} />
  ),
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-zinc-800 px-4 py-3 text-sm leading-7 text-zinc-100">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-3">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {message.toolCalls.map((tc, i) => (
              <ToolCallBadge key={i} toolCall={tc} />
            ))}
          </div>
        )}
        {message.content && (
          <div className="rounded-2xl rounded-bl-md border border-zinc-800/40 bg-zinc-900/60 px-4 py-3 text-sm leading-7 text-zinc-200">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        {!message.content && message.toolCalls?.some((tc) => tc.status === 'pending') && (
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <Icon icon="solar:refresh-line-duotone" width={12} height={12} className="animate-spin" />
            Working...
          </div>
        )}
      </div>
    </div>
  )
}

function ToolCallBadge({ toolCall }: { toolCall: ToolCallIndicator }) {
  const toolLabels: Record<string, string> = {
    get_market_snapshot: 'Market snapshot',
    compare_strategies: 'Comparing strategies',
    evaluate_strategy: 'Strategy evaluation',
    run_quick_backtest: 'Running backtest',
    get_historical_summary: 'Historical data',
    get_bot_status: 'Bot status',
  }
  const label = toolLabels[toolCall.tool] ?? toolCall.tool
  const isDone = toolCall.status === 'done'

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
        isDone
          ? 'border-zinc-800/40 bg-zinc-900/40 text-zinc-500'
          : 'border-blue-900/40 bg-blue-950/30 text-blue-400'
      }`}
    >
      <Icon
        icon={isDone ? 'solar:check-circle-line-duotone' : 'solar:refresh-line-duotone'}
        width={12}
        height={12}
        className={isDone ? '' : 'animate-spin'}
      />
      <span>{label}</span>
      {isDone && toolCall.result && (
        <span className="max-w-[200px] truncate text-zinc-600">
          — {toolCall.result.slice(0, 60)}
        </span>
      )}
    </div>
  )
}
