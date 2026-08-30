import { describe, expect, test } from "vitest";
import { type Handlers, type MethodSpec, RpcError, RpcPeer } from "./jsonrpc.ts";

type Calls = {
  "math.add": { params: { a: number; b: number }; result: number };
  "slow.echo": { params: { text: string; delayMs: number }; result: string };
  boom: { params: null; result: never };
  rude: { params: null; result: never };
  // biome-ignore lint/suspicious/noConfusingVoidType: a notification has no result
  log: { params: { line: string }; result: void };
};

/** The side that only answers, like a runner that never calls back. */
type NoCalls = Record<never, MethodSpec>;

/** Two peers wired to each other in memory: no socket, no port, no timing. */
function link(handlers: Handlers<Calls>) {
  const toServer: string[] = [];
  const toClient: string[] = [];
  const clientErrors: Error[] = [];
  const serverErrors: Error[] = [];
  let deliverToServer = (_frame: string) => {};
  let deliverToClient = (_frame: string) => {};

  const client = new RpcPeer<Calls, NoCalls>({
    send: (frame) => {
      toServer.push(frame);
      deliverToServer(frame);
    },
    handlers: {},
    onError: (error) => clientErrors.push(error),
  });
  const server = new RpcPeer<NoCalls, Calls>({
    send: (frame) => {
      toClient.push(frame);
      deliverToClient(frame);
    },
    handlers,
    onError: (error) => serverErrors.push(error),
  });

  deliverToServer = (frame) => server.receive(frame);
  deliverToClient = (frame) => client.receive(frame);

  return { client, server, toServer, toClient, clientErrors, serverErrors };
}

const handlers: Handlers<Calls> = {
  "math.add": ({ a, b }) => a + b,
  "slow.echo": async ({ text, delayMs }) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return text;
  },
  boom: () => {
    throw new Error("handler exploded");
  },
  rude: () => {
    throw "not even an error";
  },
  log: () => {},
};

describe("RpcPeer", () => {
  test("correlates a response to its request by id", async () => {
    const { client } = link(handlers);

    expect(await client.request("math.add", { a: 2, b: 3 })).toBe(5);
  });

  test("keeps concurrent requests apart", async () => {
    const { client } = link(handlers);

    const slow = client.request("slow.echo", { text: "first", delayMs: 20 });
    const fast = client.request("slow.echo", { text: "second", delayMs: 0 });

    expect(await fast).toBe("second");
    expect(await slow).toBe("first");
  });

  test("a notification carries no id and gets no reply", () => {
    const lines: string[] = [];
    const { client, toServer, toClient } = link({
      ...handlers,
      log: ({ line }) => {
        lines.push(line);
      },
    });

    client.notify("log", { line: "hello" });

    expect(lines).toEqual(["hello"]);
    expect(JSON.parse(toServer[0] as string)).not.toHaveProperty("id");
    expect(toClient).toEqual([]);
  });

  test("a malformed frame is reported but does not kill the connection", async () => {
    const { client, server, serverErrors } = link(handlers);

    server.receive("{ this is not json");

    expect(serverErrors).toHaveLength(1);
    expect(await client.request("math.add", { a: 1, b: 1 })).toBe(2);
  });

  test("an unknown method rejects with -32601 without killing the connection", async () => {
    const { client } = link(handlers);

    // biome-ignore lint/suspicious/noExplicitAny: calling off-contract on purpose
    const error = await (client as any)
      .request("does.not.exist", {})
      .catch((cause: Error) => cause);

    expect(error).toBeInstanceOf(RpcError);
    expect((error as RpcError).code).toBe(-32601);
    expect(await client.request("math.add", { a: 4, b: 4 })).toBe(8);
  });

  test("a handler that throws becomes an error response", async () => {
    const { client } = link(handlers);

    const error = await client.request("boom", null).catch((cause: Error) => cause);

    expect(error).toBeInstanceOf(RpcError);
    expect((error as RpcError).code).toBe(-32000);
    expect((error as RpcError).message).toContain("handler exploded");
  });

  test("a handler that throws something that is not an Error still says what it was", async () => {
    const { client } = link(handlers);

    const error = await client.request("rude", null).catch((cause: Error) => cause);

    expect((error as RpcError).code).toBe(-32000);
    expect(error.message).toBe("not even an error");
  });

  test("a response with an unknown id is reported, not thrown", () => {
    const { client, clientErrors } = link(handlers);

    client.receive(JSON.stringify({ jsonrpc: "2.0", id: 999, result: "nobody asked" }));

    expect(clientErrors).toHaveLength(1);
  });

  test("close rejects every request still in flight", async () => {
    const { client } = link(handlers);

    const pending = client.request("slow.echo", { text: "never", delayMs: 50 });
    client.close("connection lost");

    expect(await pending.catch((cause: Error) => cause.message)).toContain("connection lost");
  });
});

/**
 * One peer with a transport the test owns, for the frames a linked pair cannot
 * produce and the writes a working socket never refuses.
 *
 * The two promises are the seams. `written` settles on the transport being
 * handed a frame, because answering a request goes through the handler and a
 * handler is awaited. `reported` settles on the first `onError`, which is where
 * every path that answers nobody ends: a notification has no id to reply to,
 * and a response that cannot be written has nowhere else to go.
 */
function peer(send?: (frame: string) => void) {
  const sent: string[] = [];
  const errors: Error[] = [];
  let announceWrite = (_frame: string) => {};
  let announceError = (_error: Error) => {};
  const written = new Promise<string>((resolve) => {
    announceWrite = resolve;
  });
  const reported = new Promise<Error>((resolve) => {
    announceError = resolve;
  });

  const rpc = new RpcPeer<Calls, Calls>({
    send: (frame) => {
      send?.(frame);
      sent.push(frame);
      announceWrite(frame);
    },
    handlers,
    onError: (error) => {
      errors.push(error);
      announceError(error);
    },
  });

  return { rpc, sent, errors, written, reported };
}

const refusing = (message: string) => () => {
  throw new Error(message);
};

describe("a peer whose connection is already gone", () => {
  test("rejects a request instead of leaving the caller waiting on a reply nobody will send", async () => {
    const { rpc } = peer();
    rpc.close("socket gone");

    const error = await rpc.request("math.add", { a: 1, b: 1 }).catch((cause: Error) => cause);

    expect(error).toBeInstanceOf(RpcError);
    expect((error as RpcError).code).toBe(-32001);
  });

  test("drops a notification rather than writing to a transport that is gone", () => {
    const { rpc, sent } = peer();
    rpc.close("socket gone");

    rpc.notify("log", { line: "after the end" });

    expect(sent).toEqual([]);
  });
});

describe("a frame that is neither a call nor a response", () => {
  test("valid JSON that is not an object is reported and the connection survives", () => {
    const { rpc, errors } = peer();

    rpc.receive("null");
    rpc.receive("5");
    rpc.receive('"hello"');

    expect(errors.map((error) => (error as RpcError).code)).toEqual([-32600, -32600, -32600]);
  });

  /**
   * JSON-RPC 2.0 permits a string id. This peer numbers its own and settles
   * nothing else, so a spec-compliant peer that uses string ids is one it
   * cannot talk to: every reply would arrive as this error instead of the
   * answer somebody is waiting for.
   */
  test("a response whose id is a string is not one this peer can settle", () => {
    const { rpc, errors } = peer();

    rpc.receive(JSON.stringify({ jsonrpc: "2.0", id: "abc", result: 7 }));

    expect((errors[0] as RpcError).code).toBe(-32600);
    expect(errors[0]?.message).toContain("neither a call nor a response");
  });

  /** The quoted frame is bounded, so one enormous payload cannot become the log. */
  test("is quoted at a length somebody can read", () => {
    const { rpc, errors } = peer();

    rpc.receive(`{"jsonrpc":"2.0","padding":"${"x".repeat(5000)}`);

    expect(errors[0]?.message).toContain("...");
    expect(errors[0]?.message.length).toBeLessThan(300);
  });
});

/**
 * A notification has no id, so there is no frame that could carry the failure
 * back. Answering one anyway would put an error frame with no id on the wire,
 * which the other side classifies as neither a call nor a response: it reports
 * an error of its own and the original is still lost.
 */
describe("a notification that cannot be handled", () => {
  test("an unknown method is reported here rather than answered", async () => {
    const { rpc, sent, reported } = peer();

    rpc.receive(JSON.stringify({ jsonrpc: "2.0", method: "does.not.exist", params: {} }));

    expect((await reported).message).toContain("does.not.exist");
    expect(sent).toEqual([]);
  });

  test("a handler that throws is reported here rather than answered", async () => {
    const { rpc, sent, reported } = peer();

    rpc.receive(JSON.stringify({ jsonrpc: "2.0", method: "boom", params: null }));

    expect((await reported).message).toContain("handler exploded");
    expect(sent).toEqual([]);
  });
});

describe("answering a request", () => {
  /**
   * `JSON.stringify` drops a key whose value is `undefined`, so a handler that
   * returns nothing would otherwise answer with a frame carrying neither
   * `result` nor `error`, which is not a response any peer has to accept.
   */
  test("a handler that returns nothing still answers with a result", async () => {
    const { rpc, written } = peer();

    rpc.receive(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "log", params: { line: "x" } }));

    expect(JSON.parse(await written)).toHaveProperty("result", null);
  });

  test("a response the transport refuses is reported, not left to a promise nobody holds", async () => {
    const { rpc, reported } = peer(refusing("socket closed while the handler ran"));

    rpc.receive(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "math.add", params: { a: 1, b: 1 } }),
    );

    expect((await reported).message).toBe("socket closed while the handler ran");
  });
});

describe("a request whose frame never left", () => {
  test("rejects with what the transport said", async () => {
    const { rpc } = peer(refusing("socket is closed"));

    const error = await rpc.request("math.add", { a: 1, b: 1 }).catch((cause: Error) => cause);

    expect((error as Error).message).toBe("socket is closed");
  });

  /**
   * The reply is what proves it: id 1 was spent on a frame that never left, so
   * nothing may still be waiting on it. An entry left behind would swallow this
   * silently, and the peer would answer a stranger's response as its own.
   */
  test("leaves nothing behind waiting for a reply to it", async () => {
    const { rpc, errors } = peer(refusing("socket is closed"));
    await rpc.request("math.add", { a: 1, b: 1 }).catch(() => {});

    rpc.receive(JSON.stringify({ jsonrpc: "2.0", id: 1, result: 2 }));

    expect(errors.map((error) => error.message)).toEqual(["response for unknown id 1"]);
  });
});

describe("an error frame", () => {
  test("with neither a code nor a message still rejects with something readable", async () => {
    const { rpc, sent } = peer();
    const pending = rpc.request("math.add", { a: 1, b: 1 }).catch((cause: Error) => cause);

    rpc.receive(
      JSON.stringify({ jsonrpc: "2.0", id: JSON.parse(sent[0] as string).id, error: {} }),
    );

    const error = await pending;
    expect((error as RpcError).code).toBe(-32000);
    expect((error as RpcError).message).toBe("rpc error");
  });
});
