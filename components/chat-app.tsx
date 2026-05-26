"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

type Mode = "chat" | "agent";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function MessagePart({
  part,
  messageId,
  index,
}: {
  part: UIMessage["parts"][number];
  messageId: string;
  index: number;
}) {
  if (part.type === "text") {
    return (
      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:my-1 prose-pre:bg-zinc-800 prose-code:text-[#FF5C28] prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown>{part.text}</ReactMarkdown>
      </div>
    );
  }

  if (part.type === "file" && part.mediaType?.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={part.url}
        alt={part.filename ?? "Uploaded image"}
        className="mt-2 max-h-48 rounded-lg border border-zinc-800 object-contain"
      />
    );
  }

  if (part.type.startsWith("tool-")) {
    const label = part.type.replace("tool-", "");
    const state = "state" in part ? part.state : "unknown";
    return (
      <div
        key={`${messageId}-tool-${index}`}
        className="mt-2 rounded-lg border border-[#FF5C28]/30 bg-[rgb(255_92_40/0.12)] px-3 py-2 text-xs"
      >
        <div className="font-medium text-[#FF5C28]">Tool: {label}</div>
        <div className="mt-1 text-zinc-400">
          {state === "input-available" && "Calling…"}
          {state === "output-available" && "Done"}
          {state === "output-error" && "Error"}
        </div>
      </div>
    );
  }

  return null;
}

export function ChatApp() {
  const [mode, setMode] = useState<Mode>("chat");
  const [input, setInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ mode: modeRef.current }),
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });

  const isBusy = status === "streaming" || status === "submitted";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text && !imageFile) return;

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mediaType: string; url: string; filename?: string }
    > = [];

    if (imageFile) {
      parts.push({
        type: "file",
        mediaType: imageFile.type || "image/png",
        url: await fileToDataUrl(imageFile),
        filename: imageFile.name,
      });
    }

    if (text) {
      parts.push({ type: "text", text });
    }

    sendMessage({ parts });
    setInput("");
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex min-h-full flex-col bg-black">
      <header className="border-b border-zinc-800 bg-black">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[#FF5C28]">
              On-Call Response
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              On-Call Agent
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Triage · Remediate · Notify
            </p>
          </div>

          <div className="flex items-center gap-3">
          <Link
            href="/docs"
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-[#FF5C28] hover:text-[#FF5C28]"
          >
            Team Docs
          </Link>
          <div className="flex rounded-full border border-zinc-800 bg-zinc-950 p-1">
            <button
              type="button"
              onClick={() => setMode("chat")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                mode === "chat"
                  ? "bg-[#FF5C28] text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Triage
            </button>
            <button
              type="button"
              onClick={() => setMode("agent")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                mode === "agent"
                  ? "bg-[#FF5C28] text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Agent
            </button>
          </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6">
        <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
          {mode === "chat" ? (
            <p>
              <span className="font-medium text-[#FF5C28]">Triage mode</span> — read-only investigation. Checks active alerts, queries logs, and finds runbooks. No remediation actions taken.
            </p>
          ) : (
            <p>
              <span className="font-medium text-[#FF5C28]">Agent mode</span> — full autonomous response. Investigates, executes remediation (restart / rollback / scale), and posts Slack updates. Runs up to 30 steps.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          {messages.length === 0 && (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-zinc-500">
              <p className="text-lg font-medium text-zinc-200">
                On-call agent ready
              </p>
              <ul className="mt-4 max-w-md space-y-2 text-sm">
                <li>&quot;What alerts are firing right now?&quot;</li>
                <li>&quot;Check logs for checkout-service&quot;</li>
                <li>&quot;Find the runbook for auth latency&quot;</li>
                <li>
                  Switch to Agent: &quot;Checkout is throwing 500s &mdash; investigate and remediate&quot;
                </li>
              </ul>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-[#FF5C28] text-black"
                    : "border border-zinc-800 bg-zinc-900 text-zinc-100"
                }`}
              >
                <div
                  className={`mb-1 text-xs font-medium uppercase tracking-wide ${
                    message.role === "user"
                      ? "text-black/60"
                      : "text-[#FF5C28]"
                  }`}
                >
                  {message.role}
                </div>
                {message.parts.map((part, index) => (
                  <MessagePart
                    key={`${message.id}-${index}`}
                    part={part}
                    messageId={message.id}
                    index={index}
                  />
                ))}
              </div>
            </div>
          ))}

          {isBusy && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#FF5C28]" />
              {mode === "agent" ? "Agent investigating…" : "Checking…"}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-400">
            {error.message}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {imageFile && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>
                Image:{" "}
                <span className="text-[#FF5C28]">{imageFile.name}</span>
              </span>
              <button
                type="button"
                className="text-[#FF5C28] hover:text-[#ff7347] hover:underline"
                onClick={() => {
                  setImageFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                Remove
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setImageFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-[#FF5C28] hover:text-[#FF5C28]"
              title="Attach image for multimodal reasoning"
            >
              Image
            </button>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                mode === "agent"
                  ? "Describe the incident — agent will investigate and remediate…"
                  : "Ask about alerts, logs, or runbooks…"
              }
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-[#FF5C28] focus:ring-2 focus:ring-[#FF5C28]/30"
              disabled={isBusy}
            />
            {isBusy ? (
              <button
                type="button"
                onClick={() => stop()}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-[#FF5C28]"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() && !imageFile}
                className="rounded-xl bg-[#FF5C28] px-4 py-2 text-sm font-medium text-black hover:bg-[#ff7347] disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
