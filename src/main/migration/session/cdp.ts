interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export class CdpConnection {
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => this.handleMessage(event as MessageEvent))
  }

  static connect(url: string, timeoutMs = 20000): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      const timer = setTimeout(() => {
        try {
          socket.close()
        } catch {
          // ignore
        }
        reject(new Error('Timed out connecting to the browser automation endpoint'))
      }, timeoutMs)
      socket.addEventListener('open', () => {
        clearTimeout(timer)
        resolve(new CdpConnection(socket))
      })
      socket.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error('Unable to connect to the browser automation endpoint'))
      })
    })
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = CdpConnection.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Browser automation command timed out: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      try {
        this.socket.send(JSON.stringify({ id, method, params }))
      } catch {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new Error('Browser automation connection is closed'))
      }
    })
  }

  close(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Browser automation connection closed'))
    }
    this.pending.clear()
    try {
      this.socket.close()
    } catch {
      // ignore
    }
  }

  private static nextId = 1
  private pending = new Map<number, PendingCall>()

  private handleMessage = (event: MessageEvent): void => {
    const data = typeof event.data === 'string' ? event.data : ''
    if (!data) return
    let parsed: { id?: number; result?: unknown; error?: { message?: string } }
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    if (typeof parsed.id !== 'number') return
    const pending = this.pending.get(parsed.id)
    if (!pending) return
    this.pending.delete(parsed.id)
    clearTimeout(pending.timer)
    if (parsed.error) pending.reject(new Error(parsed.error.message ?? 'Browser automation command failed'))
    else pending.resolve(parsed.result ?? {})
  }

}
