import { useCallback, useEffect, useRef, useState } from 'react'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallIndicator[]
  timestamp: string
}

export type ChatConversation = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type ToolCallIndicator = {
  tool: string
  args?: string
  result?: string
  status: 'pending' | 'done'
}

type SSETokenEvent = { content: string }
type SSEToolCallEvent = { tool: string; args: string }
type SSEToolResultEvent = { tool: string; content: string }
type SSEDoneEvent = { conversation_id: string }
type SSEErrorEvent = { content: string }

function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
}

async function fetchConversations(): Promise<ChatConversation[]> {
  const res = await fetch(`${getApiBaseUrl()}/api/ai/conversations?user_id=demo-user`)
  if (!res.ok) return []
  const data = await res.json()
  return data.conversations ?? []
}

async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const res = await fetch(
    `${getApiBaseUrl()}/api/ai/history?conversation_id=${conversationId}`,
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.messages ?? [])
    .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
    .map((m: { role: string; content: string; timestamp: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: m.timestamp,
    }))
}

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const loadConversations = useCallback(async () => {
    const list = await fetchConversations()
    setConversations(list)
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const loadConversation = useCallback(
    async (id: string) => {
      if (isStreaming) return
      setIsLoadingHistory(true)
      setError(null)
      try {
        const history = await fetchMessages(id)
        setMessages(history)
        setConversationId(id)
      } finally {
        setIsLoadingHistory(false)
      }
    },
    [isStreaming],
  )

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return
      setError(null)

      const userMsg: ChatMessage = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: '',
        toolCalls: [],
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])

      setIsStreaming(true)
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch(`${getApiBaseUrl()}/api/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            conversation_id: conversationId,
            user_id: 'demo-user',
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const body = await res.text()
          throw new Error(body || `HTTP ${res.status}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''
        let newConversationId: string | null = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          let currentEvent = ''
          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEvent = line.slice(6).trim()
            } else if (line.startsWith('data:')) {
              const data = line.slice(5).trim()
              if (!data) continue

              try {
                const parsed = JSON.parse(data)

                if (currentEvent === 'token') {
                  setMessages((prev) => {
                    const updated = [...prev]
                    const last = updated[updated.length - 1]
                    if (last?.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...last,
                        content: last.content + (parsed as SSETokenEvent).content,
                      }
                    }
                    return updated
                  })
                } else if (currentEvent === 'tool_call') {
                  const toolEvt = parsed as SSEToolCallEvent
                  setMessages((prev) => {
                    const updated = [...prev]
                    const last = updated[updated.length - 1]
                    if (last?.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...last,
                        toolCalls: [
                          ...(last.toolCalls ?? []),
                          { tool: toolEvt.tool, args: toolEvt.args, status: 'pending' },
                        ],
                      }
                    }
                    return updated
                  })
                } else if (currentEvent === 'tool_result') {
                  const resultEvt = parsed as SSEToolResultEvent
                  setMessages((prev) => {
                    const updated = [...prev]
                    const last = updated[updated.length - 1]
                    if (last?.role === 'assistant' && last.toolCalls) {
                      const tc = [...last.toolCalls]
                      const idx = tc.findIndex(
                        (t) => t.tool === resultEvt.tool && t.status === 'pending',
                      )
                      if (idx >= 0) {
                        tc[idx] = { ...tc[idx], result: resultEvt.content, status: 'done' }
                      }
                      updated[updated.length - 1] = { ...last, toolCalls: tc }
                    }
                    return updated
                  })
                } else if (currentEvent === 'done') {
                  const doneEvt = parsed as SSEDoneEvent
                  if (doneEvt.conversation_id) {
                    newConversationId = doneEvt.conversation_id
                    setConversationId(doneEvt.conversation_id)
                  }
                } else if (currentEvent === 'error') {
                  const errEvt = parsed as SSEErrorEvent
                  setError(errEvt.content)
                }
              } catch {
                // skip unparseable lines
              }
              currentEvent = ''
            }
          }
        }

        if (newConversationId) {
          loadConversations()
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [isStreaming, conversationId, loadConversations],
  )

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const resetChat = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setError(null)
  }, [])

  return {
    messages,
    conversationId,
    isStreaming,
    isLoadingHistory,
    error,
    sendMessage,
    stopStreaming,
    resetChat,
    conversations,
    loadConversation,
    loadConversations,
  }
}
