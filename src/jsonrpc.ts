/**
 * JSON-RPC 2.0 framing, transport-agnostic.
 *
 * A peer turns method calls into frames and frames back into handler calls. It
 * never touches a socket: the caller supplies `send` and feeds it `receive`.
 * That is what lets the whole protocol be tested without opening a port.
 */

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
/** Implementation-defined range: the handler itself failed. */
export const HANDLER_ERROR = -32000;
export const CONNECTION_CLOSED = -32001;

export class RpcError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

export type MethodSpec = { params: unknown; result: unknown };
/** A direction of the protocol: method name to its params and result. */
export type MethodMap = Record<string, MethodSpec>;

export type Handlers<In extends MethodMap> = {
  [M in keyof In]?: (params: In[M]["params"]) => In[M]["result"] | Promise<In[M]["result"]>;
};

export type RpcPeerOptions<In extends MethodMap> = {
  send: (frame: string) => void;
  handlers: Handlers<In>;
  onError?: (error: Error) => void;
};

type Pending = { resolve: (value: never) => void; reject: (error: Error) => void };

/**
 * `Out` is what this peer calls on the other side, `In` is what it answers.
 * Server and runner instantiate the same class with the two swapped.
 */
export class RpcPeer<Out extends MethodMap, In extends MethodMap> {
  #send: (frame: string) => void;
  #handlers: Handlers<In>;
  #onError: (error: Error) => void;
  #pending = new Map<number, Pending>();
  #nextId = 1;
  #closed = false;

  constructor(options: RpcPeerOptions<In>) {
    this.#send = options.send;
    this.#handlers = options.handlers;
    this.#onError = options.onError ?? ((error) => console.error("[rpc]", error.message));
  }

  request<M extends keyof Out & string>(
    method: M,
    params: Out[M]["params"],
  ): Promise<Out[M]["result"]> {
    if (this.#closed) {
      return Promise.reject(
        new RpcError(CONNECTION_CLOSED, `rpc peer closed, cannot call ${method}`),
      );
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as Pending["resolve"], reject });
      try {
        this.#send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      } catch (error) {
        this.#pending.delete(id);
        reject(asError(error));
      }
    });
  }

  notify<M extends keyof Out & string>(method: M, params: Out[M]["params"]): void {
    if (this.#closed) return;
    this.#write({ jsonrpc: "2.0", method, params });
  }

  /** Called by the transport for every inbound frame. Never throws. */
  receive(frame: string): void {
    let message: unknown;
    try {
      message = JSON.parse(frame);
    } catch {
      this.#fail(new RpcError(PARSE_ERROR, `malformed frame: ${preview(frame)}`));
      return;
    }
    void this.#dispatch(message);
  }

  /** Rejects everything in flight. Idempotent, so both close paths can call it. */
  close(reason: string): void {
    if (this.#closed) return;
    this.#closed = true;
    const error = new RpcError(CONNECTION_CLOSED, `rpc peer closed: ${reason}`);
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }

  get closed(): boolean {
    return this.#closed;
  }

  async #dispatch(message: unknown): Promise<void> {
    if (typeof message !== "object" || message === null) {
      this.#fail(new RpcError(INVALID_REQUEST, "frame is not a JSON-RPC object"));
      return;
    }
    const frame = message as Record<string, unknown>;
    if (typeof frame.method === "string") {
      await this.#handleCall(frame.method, frame.params, frame.id);
      return;
    }
    if (typeof frame.id === "number") {
      this.#settle(frame.id, frame);
      return;
    }
    this.#fail(
      new RpcError(
        INVALID_REQUEST,
        `frame is neither a call nor a response: ${preview(JSON.stringify(frame))}`,
      ),
    );
  }

  async #handleCall(method: string, params: unknown, id: unknown): Promise<void> {
    const isRequest = typeof id === "number";
    const handler = this.#handlers[method as keyof In];

    if (!handler) {
      const error = new RpcError(METHOD_NOT_FOUND, `unknown method: ${method}`);
      if (isRequest) this.#writeError(id as number, error);
      else this.#fail(error);
      return;
    }

    try {
      const result = await handler(params as In[keyof In]["params"]);
      if (isRequest) this.#write({ jsonrpc: "2.0", id, result: result ?? null });
    } catch (cause) {
      const error = asError(cause);
      if (isRequest) this.#writeError(id as number, new RpcError(HANDLER_ERROR, error.message));
      else this.#fail(error);
    }
  }

  #settle(id: number, frame: Record<string, unknown>): void {
    const pending = this.#pending.get(id);
    if (!pending) {
      this.#fail(new RpcError(INVALID_REQUEST, `response for unknown id ${id}`));
      return;
    }
    this.#pending.delete(id);
    const error = frame.error as { code?: number; message?: string; data?: unknown } | undefined;
    if (error) {
      pending.reject(
        new RpcError(error.code ?? HANDLER_ERROR, error.message ?? "rpc error", error.data),
      );
      return;
    }
    pending.resolve(frame.result as never);
  }

  #writeError(id: number, error: RpcError): void {
    this.#write({ jsonrpc: "2.0", id, error: { code: error.code, message: error.message } });
  }

  #write(frame: unknown): void {
    try {
      this.#send(JSON.stringify(frame));
    } catch (cause) {
      this.#fail(asError(cause));
    }
  }

  #fail(error: Error): void {
    this.#onError(error);
  }
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function preview(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}...` : text;
}
