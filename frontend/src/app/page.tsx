"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  CheckCircle,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  Gem,
  Globe,
  Image as ImageIcon,
  LayoutPanelLeft,
  Loader2,
  LogOut,
  Mic,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Upload,
  User,
  Video,
  Volume2,
  X
} from "lucide-react";

type AppTab = "chat" | "canvas" | "research" | "media" | "rag" | "gems";
type MediaType = "image" | "video" | "audio";
type MessageRole = "user" | "assistant";

type Message = {
  id: number | string;
  role: MessageRole;
  content: string;
  thoughts?: AgentStep[];
  citations?: Citation[];
  attachment?: AttachmentPreview | null;
  feedback?: "up" | "down" | null;
  created_at?: string;
};

type AgentStep = {
  agent: string;
  thought: string;
  action: string;
};

type Citation = {
  title: string;
  url: string;
  snippet?: string;
  credibility_score: number;
};

type AttachmentPreview = {
  name: string;
  size: number;
  type: string;
  url?: string;
};

type UserProfile = {
  email: string;
  full_name: string;
  role: string;
  id?: number;
};

type Workspace = {
  id: number;
  name: string;
  description?: string;
};

type Session = {
  id: string;
  title: string;
};

type GemConfig = {
  name: string;
  tone: string;
  instruction: string;
  active: boolean;
};

type DocumentRecord = {
  id?: number | string;
  filename: string;
  file_size?: number;
  size?: number;
  status?: string;
};

type SpeechRecognitionResultEventLike = {
  results?: {
    [index: number]: {
      [index: number]: {
        transcript?: string;
      };
    };
  };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const OFFLINE_THOUGHTS: AgentStep[] = [
  { agent: "Gemini Supervisor", action: "Route Request", thought: "Classifying intent, context, and needed tools." },
  { agent: "ResearchAgent", action: "Ground Sources", thought: "Checking trusted references and extracting source cards." },
  { agent: "CodingAgent", action: "Compose Answer", thought: "Drafting a concise answer with workspace memory in scope." }
];

const MODEL_OPTIONS = ["Gemini 2.5 Pro", "Gemini 2.5 Flash", "Gemini Nano Local", "OmniAgent Supervisor"];

const SUGGESTIONS = [
  "Create a launch plan for a local AI product",
  "Compare three approaches and cite sources",
  "Turn this idea into a working spec",
  "Draft code, tests, and edge cases"
];

const GEM_PRESETS: GemConfig[] = [
  {
    name: "Research Analyst",
    tone: "Precise",
    instruction: "Answer with evidence, caveats, citations, and a short conclusion.",
    active: true
  },
  {
    name: "Product Strategist",
    tone: "Practical",
    instruction: "Turn fuzzy goals into scoped product decisions, risks, and next steps.",
    active: false
  },
  {
    name: "Code Partner",
    tone: "Direct",
    instruction: "Prefer implementation details, tests, and maintainable tradeoffs.",
    active: false
  }
];

const formatBytes = (size: number) => {
  if (!size) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const stripMarkdown = (text: string) =>
  text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authEmail, setAuthEmail] = useState("admin@platform.ai");
  const [authPass, setAuthPass] = useState("password123");
  const [authName, setAuthName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:8000/api/v1");

  const [activeTab, setActiveTab] = useState<AppTab>("chat");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showThoughtsId, setShowThoughtsId] = useState<number | string | null>(null);
  const [selectedChatFile, setSelectedChatFile] = useState<AttachmentPreview | null>(null);
  const [model, setModel] = useState(MODEL_OPTIONS[0]);
  const [groundingEnabled, setGroundingEnabled] = useState(true);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [isListening, setIsListening] = useState(false);

  const [canvasTitle, setCanvasTitle] = useState("Working draft");
  const [canvasContent, setCanvasContent] = useState(
    "Ask Gemini to draft a plan, then pin or rewrite the answer here.\n\n## Notes\n- Capture useful responses\n- Refine tone and structure\n- Export when ready"
  );

  const [researchQuery, setResearchQuery] = useState("");
  const [researchRunning, setResearchRunning] = useState(false);
  const [credibilityScore, setCredibilityScore] = useState(0.92);
  const [topicClusters, setTopicClusters] = useState<Record<string, string[]>>({
    "Verified Sources": ["Search grounding enabled for fresh source cards.", "Workspace memory considered when available."],
    "Open Questions": ["Run a research brief to populate contradictions and timeline."]
  });
  const [timelineEvents, setTimelineEvents] = useState([
    { year: "Step 1", event: "Intent mapped to research topics.", source: "workspace://research-plan" },
    { year: "Step 2", event: "Sources grouped by credibility and relevance.", source: "workspace://sources" }
  ]);
  const [contradictions, setContradictions] = useState([
    { type: "Needs Verification", description: "Run a research brief before relying on fast sandbox output." }
  ]);

  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [mediaPrompt, setMediaPrompt] = useState("");
  const [mediaStyle, setMediaStyle] = useState("Cinematic");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [generatingMedia, setGeneratingMedia] = useState(false);
  const [mediaResultUrl, setMediaResultUrl] = useState<string | null>(null);
  const [mediaGallery, setMediaGallery] = useState([
    { type: "image" as MediaType, prompt: "Cyberpunk computer hub", url: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=400&auto=format&fit=crop" },
    { type: "image" as MediaType, prompt: "A glowing galaxy", url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&auto=format&fit=crop" }
  ]);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [ragQuestion, setRagQuestion] = useState("");

  const [gems, setGems] = useState<GemConfig[]>(GEM_PRESETS);
  const [newGemName, setNewGemName] = useState("");
  const [newGemInstruction, setNewGemInstruction] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const idCounterRef = useRef(0);

  const isSandbox = token === "sandbox" || user?.email === "sandbox@platform.ai";
  const activeGem = gems.find((gem) => gem.active);

  const activeCapabilities = useMemo(() => {
    const caps = [model, activeGem?.name || "General"];
    if (groundingEnabled) caps.push("Search");
    if (deepResearchEnabled) caps.push("Deep Research");
    if (memoryEnabled) caps.push("Memory");
    return caps;
  }, [activeGem?.name, deepResearchEnabled, groundingEnabled, memoryEnabled, model]);

  const nextId = () => {
    idCounterRef.current += 1;
    return `local-${idCounterRef.current}`;
  };

  const createSandboxState = () => {
    const workspace = { id: 1, name: "Gemini Sandbox", description: "Offline multimodal playground" };
    const session = { id: "s1", title: "Welcome chat" };
    setUser({ email: "sandbox@platform.ai", full_name: "Local Sandbox", role: "admin" });
    setWorkspaces([workspace]);
    setCurrentWorkspace(workspace);
    setSessions([session]);
    setCurrentSession(session);
    setToken("sandbox");
    localStorage.setItem("platform_token", "sandbox");
    setMessages([
      {
        id: 1,
        role: "assistant",
        content:
          "### Gemini-style workspace ready\nAsk, search, attach files, draft in Canvas, create media, or build a custom Gem. Backend calls are used when available; sandbox mode keeps the interface interactive offline.",
        thoughts: OFFLINE_THOUGHTS,
        citations: [
          { title: "Workspace sandbox", url: "workspace://sandbox", snippet: "Local preview mode", credibility_score: 0.91 }
        ]
      }
    ]);
  };

  const fetchUserData = async (jwtToken: string) => {
    if (jwtToken === "sandbox") {
      createSandboxState();
      return;
    }

    try {
      const userRes = await fetch(`${apiBaseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData);
        fetchWorkspaces(jwtToken);
      } else {
        handleLogout();
      }
    } catch {
      createSandboxState();
    }
  };

  const fetchWorkspaces = async (jwtToken: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/workspaces`, {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data);
        if (data.length > 0) {
          setCurrentWorkspace(data[0]);
          fetchSessions(data[0].id, jwtToken);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSessions = async (workspaceId: number, jwtToken: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/workspaces/${workspaceId}/sessions`, {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0) {
          setCurrentSession(data[0]);
          fetchMessages(data[0].id, jwtToken);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMessages = async (sessionId: string, jwtToken: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/chat/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDocuments = async () => {
    if (!token || !currentWorkspace || isSandbox) return;
    try {
      const res = await fetch(`${apiBaseUrl}/workspaces/${currentWorkspace.id}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem("platform_token");
    if (savedToken) {
      window.setTimeout(() => {
        setToken(savedToken);
        fetchUserData(savedToken);
      }, 0);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    if (currentWorkspace && token) {
      fetchDocuments();
    }
  }, [currentWorkspace, token, activeTab]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPass })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("platform_token", data.access_token);
        setToken(data.access_token);
        fetchUserData(data.access_token);
      } else {
        const err = await res.json();
        setAuthError(err.detail || "Authentication failed");
      }
    } catch {
      setAuthError("Backend unavailable. Launch Sandbox Mode to continue locally.");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch(`${apiBaseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPass, full_name: authName })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("platform_token", data.access_token);
        setToken(data.access_token);
        fetchUserData(data.access_token);
      } else {
        const err = await res.json();
        setAuthError(err.detail || "Registration failed");
      }
    } catch {
      setAuthError("Server unavailable.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("platform_token");
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    setSessions([]);
    setCurrentSession(null);
    setMessages([]);
  };

  const startNewChat = () => {
    const session = { id: nextId(), title: "New chat" };
    setCurrentSession(session);
    setSessions((prev) => [session, ...prev]);
    setMessages([]);
    setInputText("");
    setSelectedChatFile(null);
    setActiveTab("chat");
  };

  const buildSandboxAnswer = (prompt: string) => {
    const attachmentLine = selectedChatFile ? `\n\nAttached context: ${selectedChatFile.name} (${formatBytes(selectedChatFile.size)}).` : "";
    const modeLine = `Model: ${model}. Tools: ${activeCapabilities.join(", ")}.`;
    return `### ${deepResearchEnabled ? "Deep research" : "Assistant"} response\n${modeLine}\n\n${stripMarkdown(prompt)}${attachmentLine}\n\nHere is a practical answer with the current workspace context in mind:\n\n1. Clarify the desired outcome and constraints.\n2. Break the work into small verifiable steps.\n3. Use grounded search when the answer depends on current facts.\n4. Keep useful drafts in Canvas and convert final outputs into documents, media, or tasks.`;
  };

  const ensureRemoteSession = async (title: string) => {
    if (currentSession?.id && !currentSession.id.startsWith("local-")) return currentSession.id;
    const workspaceId = currentWorkspace?.id || workspaces[0]?.id;
    if (!workspaceId || !token) return null;

    const res = await fetch(`${apiBaseUrl}/workspaces/${workspaceId}/sessions?title=${encodeURIComponent(title)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const newSession = await res.json();
    setSessions((prev) => [newSession, ...prev.filter((session) => session.id !== currentSession?.id)]);
    setCurrentSession(newSession);
    return newSession.id;
  };

  const handleSendMessage = async (e?: React.FormEvent, overridePrompt?: string) => {
    e?.preventDefault();
    const userText = (overridePrompt || inputText).trim();
    if (!userText || isSending) return;

    abortRef.current = false;
    setInputText("");
    setIsSending(true);

    const userMessage: Message = {
      id: nextId(),
      role: "user",
      content: userText,
      attachment: selectedChatFile
    };
    setMessages((prev) => [...prev, userMessage]);

    if (isSandbox || !token) {
      setTimeout(() => {
        if (abortRef.current) {
          setIsSending(false);
          return;
        }
        const assistantMessage: Message = {
          id: nextId(),
          role: "assistant",
          content: buildSandboxAnswer(userText),
          thoughts: OFFLINE_THOUGHTS,
          citations: groundingEnabled
            ? [
                { title: "Workspace memory", url: "workspace://memory", snippet: "Local session context", credibility_score: 0.9 },
                { title: "Sandbox source card", url: "workspace://source", snippet: "Grounding simulation", credibility_score: 0.86 }
              ]
            : []
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setSelectedChatFile(null);
        setIsSending(false);
      }, deepResearchEnabled ? 1800 : 900);
      return;
    }

    try {
      const sessionId = await ensureRemoteSession(userText.substring(0, 40) || "New chat");
      if (!sessionId) throw new Error("No session available");

      const res = await fetch(`${apiBaseUrl}/chat/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          session_id: sessionId,
          content: `${userText}\n\n[mode=${model}; grounding=${groundingEnabled}; deep_research=${deepResearchEnabled}; gem=${activeGem?.name || "General"}]`
        })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            content: data.assistant_message.content,
            thoughts: data.assistant_message.thoughts,
            citations: data.assistant_message.citations
          }
        ]);
      }
      setSelectedChatFile(null);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: "I could not reach the backend for this request. Sandbox mode is still available for local interaction.",
          thoughts: [{ agent: "Network", action: "Request Failed", thought: "Backend call did not complete." }],
          citations: []
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleFilePicked = (file?: File) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    setSelectedChatFile({
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      url: isImage ? URL.createObjectURL(file) : undefined
    });
  };

  const handleVoiceInput = () => {
    const speechWindow = window as WindowWithSpeechRecognition;
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setInputText((prev) => `${prev}${prev ? " " : ""}Voice input is not supported in this browser.`);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setInputText((prev) => `${prev}${prev ? " " : ""}${transcript}`.trim());
    };
    recognition.start();
  };

  const stopResponse = () => {
    abortRef.current = true;
    setIsSending(false);
  };

  const copyMessage = async (message: Message) => {
    await navigator.clipboard.writeText(stripMarkdown(message.content));
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  const regenerateLast = () => {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (lastUser) {
      setMessages((prev) => prev.filter((message) => message.id !== messages[messages.length - 1]?.id));
      handleSendMessage(undefined, lastUser.content);
    }
  };

  const pinToCanvas = (message: Message) => {
    setCanvasContent((prev) => `${prev}\n\n---\n\n${message.content}`);
    setActiveTab("canvas");
  };

  const exportChat = () => {
    const text = messages.map((message) => `## ${message.role}\n\n${message.content}`).join("\n\n");
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentSession?.title || "chat"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleResearchRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!researchQuery.trim()) return;
    setResearchRunning(true);
    setTimeout(() => {
      setCredibilityScore(0.88 + Math.random() * 0.08);
      setTopicClusters({
        "Source Consensus": [
          `Most reliable matches for "${researchQuery}" agree on the core framing.`,
          "High-confidence results are grouped before speculative claims."
        ],
        "Next Checks": [
          "Validate dates and named entities before publishing.",
          "Ask follow-up questions for uncertain tradeoffs."
        ]
      });
      setTimelineEvents([
        { year: "Query", event: `Research brief started for "${researchQuery}".`, source: "workspace://query" },
        { year: "Grounding", event: "Sources scored by credibility and relevance.", source: "workspace://grounding" },
        { year: "Synthesis", event: "Brief prepared with contradictions and open questions.", source: "workspace://brief" }
      ]);
      setContradictions([
        { type: "Confidence Boundary", description: "Claims that depend on current facts should be rechecked against live sources before final use." }
      ]);
      setResearchRunning(false);
    }, 1000);
  };

  const handleGenerateMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaPrompt.trim()) return;

    setGeneratingMedia(true);
    setMediaResultUrl(null);
    const prompt = `${mediaPrompt}. Style: ${mediaStyle}. Aspect ratio: ${aspectRatio}.`;

    if (isSandbox || !token) {
      setTimeout(() => {
        let dummyUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop";
        if (mediaType === "video") dummyUrl = "https://assets.mixkit.co/videos/preview/mixkit-abstract-laser-lights-background-32124-large.mp4";
        if (mediaType === "audio") dummyUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
        setMediaResultUrl(dummyUrl);
        setMediaGallery((prev) => [{ type: mediaType, prompt, url: dummyUrl }, ...prev]);
        setGeneratingMedia(false);
      }, 1200);
      return;
    }

    try {
      const res = await fetch(`${apiBaseUrl}/generate/${mediaType}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt, aspect_ratio: aspectRatio })
      });
      if (res.ok) {
        const data = await res.json();
        setMediaResultUrl(data.url);
        setMediaGallery((prev) => [{ type: mediaType, prompt, url: data.url }, ...prev]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingMedia(false);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileToUpload || !currentWorkspace) return;

    setUploadingDoc(true);
    if (isSandbox || !token) {
      setTimeout(() => {
        setDocuments((prev) => [
          { id: nextId(), filename: fileToUpload.name, file_size: fileToUpload.size, status: "indexed" },
          ...prev
        ]);
        setFileToUpload(null);
        setUploadingDoc(false);
      }, 700);
      return;
    }

    const formData = new FormData();
    formData.append("file", fileToUpload);
    try {
      const res = await fetch(`${apiBaseUrl}/workspaces/${currentWorkspace.id}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        setFileToUpload(null);
        fetchDocuments();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUploadingDoc(false);
    }
  };

  const createGem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGemName.trim() || !newGemInstruction.trim()) return;
    setGems((prev) => [
      ...prev.map((gem) => ({ ...gem, active: false })),
      { name: newGemName.trim(), tone: "Custom", instruction: newGemInstruction.trim(), active: true }
    ]);
    setNewGemName("");
    setNewGemInstruction("");
  };

  if (!token && user?.email !== "sandbox@platform.ai") {
    return (
      <div className="min-h-screen w-full bg-[#050508] text-gray-100 flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(20,184,166,0.16),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(244,114,182,0.12),transparent_30%)]" />
        <div className="relative w-full max-w-md rounded-lg border border-white/10 bg-[#101018]/90 p-7 shadow-2xl">
          <div className="mb-7">
            <div className="flex items-center gap-3 text-xl font-semibold">
              <Sparkles className="h-6 w-6 text-teal-300" />
              OmniAgent Gemini Console
            </div>
            <p className="mt-2 text-sm text-gray-400">Multimodal chat, search, Canvas, RAG, media, and custom Gems.</p>
          </div>

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
            {isRegistering && (
              <label className="block text-xs font-semibold text-gray-400">
                Full name
                <input
                  type="text"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="mt-2 w-full rounded-md border border-white/10 bg-[#09090f] px-3 py-3 text-sm text-gray-100 outline-none focus:border-teal-400"
                  required
                />
              </label>
            )}
            <label className="block text-xs font-semibold text-gray-400">
              Email
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="mt-2 w-full rounded-md border border-white/10 bg-[#09090f] px-3 py-3 text-sm text-gray-100 outline-none focus:border-teal-400"
                required
              />
            </label>
            <label className="block text-xs font-semibold text-gray-400">
              Password
              <input
                type="password"
                value={authPass}
                onChange={(e) => setAuthPass(e.target.value)}
                className="mt-2 w-full rounded-md border border-white/10 bg-[#09090f] px-3 py-3 text-sm text-gray-100 outline-none focus:border-teal-400"
                required
              />
            </label>

            {authError && (
              <div className="flex gap-2 rounded-md border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {authError}
              </div>
            )}

            <button type="submit" className="w-full rounded-md bg-teal-400 px-4 py-3 text-sm font-semibold text-[#04100f] transition hover:bg-teal-300">
              {isRegistering ? "Create account" : "Sign in"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs text-gray-400">
            <button onClick={() => setIsRegistering((prev) => !prev)} className="font-semibold text-teal-300 hover:underline">
              {isRegistering ? "Use existing account" : "Create account"}
            </button>
            <button onClick={createSandboxState} className="font-semibold text-pink-300 hover:underline">
              Launch Sandbox
            </button>
          </div>

          <label className="mt-5 block text-[11px] text-gray-500">
            API base URL
            <input
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              className="mt-2 w-full rounded-md border border-white/10 bg-[#09090f] px-3 py-2 text-xs text-gray-300 outline-none focus:border-teal-400"
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#050508] text-gray-100">
      <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[#0b0b10] p-4 lg:flex lg:flex-col">
        <button onClick={startNewChat} className="mb-4 flex w-full items-center justify-center gap-2 rounded-md bg-white px-3 py-2.5 text-sm font-semibold text-[#08080d] transition hover:bg-teal-100">
          <Plus className="h-4 w-4" />
          New chat
        </button>

        <nav className="space-y-1">
          {[
            { id: "chat", label: "Chat", icon: Sparkles },
            { id: "canvas", label: "Canvas", icon: LayoutPanelLeft },
            { id: "research", label: "Deep Research", icon: Search },
            { id: "media", label: "Media", icon: ImageIcon },
            { id: "rag", label: "Files", icon: FileText },
            { id: "gems", label: "Gems", icon: Gem }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as AppTab)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                  activeTab === item.id ? "bg-teal-400/12 text-teal-200" : "text-gray-400 hover:bg-white/5 hover:text-gray-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
          <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Recent chats</div>
          <div className="space-y-1">
            {sessions.length === 0 ? (
              <div className="rounded-md border border-white/10 p-3 text-xs text-gray-500">No conversations yet.</div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    setCurrentSession(session);
                    if (token && !isSandbox && !session.id.startsWith("local-")) fetchMessages(session.id, token);
                    setActiveTab("chat");
                  }}
                  className={`w-full truncate rounded-md px-3 py-2 text-left text-xs transition ${
                    currentSession?.id === session.id ? "bg-white/10 text-gray-100" : "text-gray-400 hover:bg-white/5"
                  }`}
                >
                  {session.title}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 rounded-md border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4 text-teal-300" />
            <span className="truncate">{user?.full_name || "User"}</span>
          </div>
          <div className="mt-1 truncate text-xs text-gray-500">{currentWorkspace?.name || "No workspace"}</div>
          <button onClick={handleLogout} className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-gray-100">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#08080d]/95 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-400/12">
              <Sparkles className="h-5 w-5 text-teal-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <select value={model} onChange={(e) => setModel(e.target.value)} className="max-w-[190px] rounded-md border border-white/10 bg-[#111118] px-2 py-1 text-sm outline-none">
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
                <ChevronDown className="hidden h-4 w-4 text-gray-500" />
              </div>
              <div className="truncate text-xs text-gray-500">{activeCapabilities.join(" + ")}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {[
              { label: "Search", active: groundingEnabled, set: setGroundingEnabled, icon: Globe },
              { label: "Research", active: deepResearchEnabled, set: setDeepResearchEnabled, icon: BookOpen },
              { label: "Memory", active: memoryEnabled, set: setMemoryEnabled, icon: Bot }
            ].map((toggle) => {
              const Icon = toggle.icon;
              return (
                <button
                  key={toggle.label}
                  onClick={() => toggle.set(!toggle.active)}
                  title={toggle.label}
                  className={`hidden items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition sm:flex ${
                    toggle.active ? "border-teal-400/30 bg-teal-400/12 text-teal-200" : "border-white/10 bg-white/[0.03] text-gray-400"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {toggle.label}
                </button>
              );
            })}
            <button title="Settings" className="rounded-md border border-white/10 bg-white/[0.03] p-2 text-gray-400 hover:text-gray-100">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </header>

        {activeTab === "chat" && (
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
              {messages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-4xl flex-col justify-center">
                  <div className="mb-8">
                    <h1 className="text-4xl font-semibold tracking-normal text-gray-100">Hello, {user?.full_name?.split(" ")[0] || "there"}</h1>
                    <p className="mt-3 text-sm text-gray-400">Ask anything, attach context, search the web, or move a draft into Canvas.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button key={suggestion} onClick={() => handleSendMessage(undefined, suggestion)} className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-left text-sm text-gray-200 transition hover:border-teal-400/30 hover:bg-teal-400/10">
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-4xl space-y-6">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      {message.role === "assistant" && (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-400/12">
                          <Sparkles className="h-4 w-4 text-teal-300" />
                        </div>
                      )}
                      <div className={`max-w-[82%] rounded-lg border p-4 ${message.role === "user" ? "border-teal-400/20 bg-teal-400/10" : "border-white/10 bg-[#101018]"}`}>
                        {message.attachment && (
                          <div className="mb-3 flex items-center gap-3 rounded-md border border-white/10 bg-black/20 p-2 text-xs text-gray-300">
                            {message.attachment.url ? (
                              <img src={message.attachment.url} alt="" className="h-10 w-10 rounded object-cover" />
                            ) : (
                              <FileText className="h-5 w-5 text-teal-300" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{message.attachment.name}</div>
                              <div className="text-gray-500">{formatBytes(message.attachment.size)}</div>
                            </div>
                          </div>
                        )}
                        <div className="whitespace-pre-wrap text-sm leading-6 text-gray-200">{message.content}</div>

                        {message.role === "assistant" && (
                          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                            <button onClick={() => copyMessage(message)} title="Copy" className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-gray-100">
                              {copiedId === message.id ? <Check className="h-4 w-4 text-teal-300" /> : <Clipboard className="h-4 w-4" />}
                            </button>
                            <button onClick={() => pinToCanvas(message)} title="Open in Canvas" className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-gray-100">
                              <PenLine className="h-4 w-4" />
                            </button>
                            <button onClick={() => setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, feedback: "up" } : m)))} title="Good response" className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-gray-100">
                              <ThumbsUp className={`h-4 w-4 ${message.feedback === "up" ? "text-teal-300" : ""}`} />
                            </button>
                            <button onClick={() => setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, feedback: "down" } : m)))} title="Bad response" className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-gray-100">
                              <ThumbsDown className={`h-4 w-4 ${message.feedback === "down" ? "text-pink-300" : ""}`} />
                            </button>
                            {message.thoughts && message.thoughts.length > 0 && (
                              <button onClick={() => setShowThoughtsId(showThoughtsId === message.id ? null : message.id)} className="ml-auto rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-gray-400 hover:text-gray-100">
                                Agent trace
                              </button>
                            )}
                          </div>
                        )}

                        {showThoughtsId === message.id && message.thoughts && (
                          <div className="mt-3 space-y-2 rounded-md border border-teal-400/20 bg-teal-400/5 p-3">
                            {message.thoughts.map((step, index) => (
                              <div key={index} className="text-xs text-gray-400">
                                <span className="font-semibold text-teal-200">{step.agent}</span> · {step.action}: {step.thought}
                              </div>
                            ))}
                          </div>
                        )}

                        {message.citations && message.citations.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.citations.map((citation, index) => (
                              <a key={`${citation.url}-${index}`} href={citation.url.startsWith("workspace://") ? undefined : citation.url} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-teal-200">
                                {citation.title} · {Math.round(citation.credibility_score * 100)}%
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isSending && (
                    <div className="flex gap-4">
                      <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-md bg-teal-400/12">
                        <Loader2 className="h-4 w-4 animate-spin text-teal-300" />
                      </div>
                      <div className="rounded-lg border border-white/10 bg-[#101018] p-4 text-sm text-gray-400">
                        Gemini is thinking across {activeCapabilities.join(", ")}...
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-white/10 bg-[#08080d] p-4">
              <form onSubmit={handleSendMessage} className="mx-auto max-w-4xl rounded-lg border border-white/10 bg-[#111118] p-3">
                {selectedChatFile && (
                  <div className="mb-3 flex w-fit items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-gray-300">
                    <Paperclip className="h-3.5 w-3.5 text-teal-300" />
                    {selectedChatFile.name}
                    <button type="button" onClick={() => setSelectedChatFile(null)} title="Remove attachment">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={2}
                  className="max-h-36 w-full resize-none bg-transparent px-1 text-sm text-gray-100 outline-none placeholder:text-gray-500"
                  placeholder="Ask Gemini, upload an image, or request deep research..."
                  disabled={isSending}
                />
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <input ref={chatFileInputRef} type="file" className="hidden" onChange={(e) => handleFilePicked(e.target.files?.[0])} />
                    <button type="button" onClick={() => chatFileInputRef.current?.click()} title="Attach file" className="rounded-md p-2 text-gray-400 hover:bg-white/10 hover:text-gray-100">
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={handleVoiceInput} title="Voice input" className={`rounded-md p-2 hover:bg-white/10 ${isListening ? "text-pink-300" : "text-gray-400 hover:text-gray-100"}`}>
                      <Mic className="h-4 w-4" />
                    </button>
                    {messages.length > 0 && (
                      <>
                        <button type="button" onClick={exportChat} title="Export chat" className="rounded-md p-2 text-gray-400 hover:bg-white/10 hover:text-gray-100">
                          <Download className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={regenerateLast} title="Regenerate" className="rounded-md p-2 text-gray-400 hover:bg-white/10 hover:text-gray-100">
                          <RefreshCcw className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                  {isSending ? (
                    <button type="button" onClick={stopResponse} className="rounded-md bg-pink-400 px-3 py-2 text-xs font-semibold text-[#16070e]">
                      <Square className="inline h-3.5 w-3.5" /> Stop
                    </button>
                  ) : (
                    <button type="submit" className="rounded-md bg-teal-400 px-3 py-2 text-xs font-semibold text-[#04100f] hover:bg-teal-300">
                      <Send className="inline h-3.5 w-3.5" /> Send
                    </button>
                  )}
                </div>
              </form>
            </div>
          </section>
        )}

        {activeTab === "canvas" && (
          <section className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[1fr_320px]">
            <div className="flex min-h-0 flex-col p-5">
              <input value={canvasTitle} onChange={(e) => setCanvasTitle(e.target.value)} className="mb-3 bg-transparent text-2xl font-semibold outline-none" />
              <textarea value={canvasContent} onChange={(e) => setCanvasContent(e.target.value)} className="min-h-0 flex-1 resize-none rounded-md border border-white/10 bg-[#101018] p-5 text-sm leading-7 text-gray-200 outline-none focus:border-teal-400/40" />
            </div>
            <aside className="border-l border-white/10 bg-[#0b0b10] p-5">
              <h2 className="text-sm font-semibold">Canvas tools</h2>
              <div className="mt-4 space-y-2">
                {["Make concise", "Add action items", "Turn into email", "Create outline"].map((action) => (
                  <button key={action} onClick={() => setCanvasContent((prev) => `${prev}\n\n### ${action}\nGenerated revision placeholder.`)} className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-gray-300 hover:border-teal-400/30">
                    {action}
                  </button>
                ))}
              </div>
              <button onClick={() => navigator.clipboard.writeText(canvasContent)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-teal-400 px-3 py-2 text-xs font-semibold text-[#04100f]">
                <Clipboard className="h-3.5 w-3.5" />
                Copy draft
              </button>
            </aside>
          </section>
        )}

        {activeTab === "research" && (
          <section className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-8">
            <div className="mx-auto max-w-6xl space-y-5">
              <div>
                <h1 className="text-2xl font-semibold">Deep Research</h1>
                <p className="mt-1 text-sm text-gray-400">Build a source-grounded brief with topic clusters, confidence, timeline, and contradictions.</p>
              </div>
              <form onSubmit={handleResearchRun} className="flex gap-2 rounded-lg border border-white/10 bg-[#101018] p-2">
                <input value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" placeholder="Research a topic..." />
                <button className="rounded-md bg-teal-400 px-4 py-2 text-xs font-semibold text-[#04100f]">
                  {researchRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run brief"}
                </button>
              </form>

              <div className="grid gap-5 lg:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-[#101018] p-5">
                  <div className="text-xs font-semibold uppercase text-gray-500">Credibility</div>
                  <div className="mt-3 text-4xl font-semibold text-teal-300">{Math.round(credibilityScore * 100)}%</div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-teal-300" style={{ width: `${credibilityScore * 100}%` }} />
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#101018] p-5 lg:col-span-2">
                  <div className="mb-3 text-xs font-semibold uppercase text-gray-500">Topic clusters</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(topicClusters).map(([cluster, items]) => (
                      <div key={cluster} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                        <div className="text-sm font-semibold text-teal-200">{cluster}</div>
                        {items.map((item) => (
                          <div key={item} className="mt-2 text-xs text-gray-400">{item}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-[#101018] p-5">
                  <div className="mb-4 text-xs font-semibold uppercase text-gray-500">Timeline</div>
                  <div className="space-y-4 border-l border-white/10 pl-4">
                    {timelineEvents.map((event, index) => (
                      <div key={`${event.year}-${index}`}>
                        <div className="text-xs font-semibold text-teal-200">{event.year}</div>
                        <div className="mt-1 text-sm text-gray-300">{event.event}</div>
                        <div className="mt-1 text-xs text-gray-500">{event.source}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#101018] p-5">
                  <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
                    <AlertTriangle className="h-4 w-4 text-pink-300" />
                    Contradictions
                  </div>
                  <div className="space-y-3">
                    {contradictions.map((item, index) => (
                      <div key={`${item.type}-${index}`} className="rounded-md border border-pink-400/20 bg-pink-400/5 p-3">
                        <div className="text-sm font-semibold text-pink-200">{item.type}</div>
                        <div className="mt-1 text-xs text-gray-400">{item.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "media" && (
          <section className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_1fr]">
            <div className="border-r border-white/10 bg-[#0b0b10] p-5">
              <h1 className="text-xl font-semibold">Media Studio</h1>
              <p className="mt-1 text-sm text-gray-400">Generate image, video, or audio with local/fallback services.</p>
              <form onSubmit={handleGenerateMedia} className="mt-5 space-y-4">
                <div className="grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-[#101018] p-1">
                  {(["image", "video", "audio"] as MediaType[]).map((type) => (
                    <button key={type} type="button" onClick={() => setMediaType(type)} className={`rounded px-2 py-2 text-xs font-semibold capitalize ${mediaType === type ? "bg-teal-400 text-[#04100f]" : "text-gray-400"}`}>
                      {type}
                    </button>
                  ))}
                </div>
                <textarea value={mediaPrompt} onChange={(e) => setMediaPrompt(e.target.value)} rows={5} className="w-full resize-none rounded-md border border-white/10 bg-[#101018] p-3 text-sm outline-none focus:border-teal-400/40" placeholder={`Describe the ${mediaType}...`} />
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-gray-400">
                    Style
                    <select value={mediaStyle} onChange={(e) => setMediaStyle(e.target.value)} className="mt-2 w-full rounded-md border border-white/10 bg-[#101018] px-2 py-2 text-sm outline-none">
                      {["Cinematic", "Product", "Editorial", "Minimal", "Photoreal"].map((style) => <option key={style}>{style}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-gray-400">
                    Ratio
                    <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="mt-2 w-full rounded-md border border-white/10 bg-[#101018] px-2 py-2 text-sm outline-none">
                      {["1:1", "16:9", "9:16", "4:3"].map((ratio) => <option key={ratio}>{ratio}</option>)}
                    </select>
                  </label>
                </div>
                <button className="flex w-full items-center justify-center gap-2 rounded-md bg-teal-400 px-3 py-3 text-xs font-semibold text-[#04100f]">
                  {generatingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate
                </button>
              </form>
            </div>
            <div className="min-h-0 overflow-y-auto p-5">
              <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-white/10 bg-[#101018] p-4">
                {generatingMedia && <Loader2 className="h-8 w-8 animate-spin text-teal-300" />}
                {!generatingMedia && !mediaResultUrl && <div className="text-sm text-gray-500">Your generation appears here.</div>}
                {!generatingMedia && mediaResultUrl && mediaType === "image" && <img src={mediaResultUrl} alt="Generated media" className="max-h-[520px] rounded-md object-contain" />}
                {!generatingMedia && mediaResultUrl && mediaType === "video" && <video src={mediaResultUrl} controls className="max-h-[520px] rounded-md" />}
                {!generatingMedia && mediaResultUrl && mediaType === "audio" && (
                  <div className="w-full max-w-md rounded-md border border-white/10 bg-white/[0.03] p-5 text-center">
                    <Volume2 className="mx-auto mb-4 h-8 w-8 text-teal-300" />
                    <audio src={mediaResultUrl} controls className="w-full" />
                  </div>
                )}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                {mediaGallery.map((item, index) => (
                  <button key={`${item.url}-${index}`} onClick={() => { setMediaType(item.type); setMediaResultUrl(item.url); }} className="h-28 overflow-hidden rounded-md border border-white/10 bg-[#101018] text-left">
                    {item.type === "image" ? <img src={item.url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-teal-300">{item.type === "video" ? <Video /> : <Volume2 />}</div>}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "rag" && (
          <section className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-8">
            <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[340px_1fr]">
              <div className="rounded-lg border border-white/10 bg-[#101018] p-5">
                <h1 className="text-xl font-semibold">Files</h1>
                <p className="mt-1 text-sm text-gray-400">Upload documents for workspace memory and retrieval.</p>
                <form onSubmit={handleUploadDocument} className="mt-5 space-y-4">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
                    <Upload className="mb-2 h-7 w-7 text-teal-300" />
                    <span className="text-sm font-semibold">{fileToUpload ? fileToUpload.name : "Select file"}</span>
                    <span className="mt-1 text-xs text-gray-500">PDF, TXT, MD, CSV</span>
                    <input type="file" className="hidden" onChange={(e) => setFileToUpload(e.target.files?.[0] || null)} />
                  </label>
                  <button disabled={!fileToUpload || uploadingDoc} className="flex w-full items-center justify-center gap-2 rounded-md bg-teal-400 px-3 py-3 text-xs font-semibold text-[#04100f] disabled:opacity-50">
                    {uploadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    Index document
                  </button>
                </form>
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(undefined, `Answer from my uploaded files: ${ragQuestion}`); }} className="mt-5 space-y-3">
                  <input value={ragQuestion} onChange={(e) => setRagQuestion(e.target.value)} className="w-full rounded-md border border-white/10 bg-[#08080d] px-3 py-2 text-sm outline-none" placeholder="Ask your files..." />
                  <button className="w-full rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-teal-400/30">Ask with RAG</button>
                </form>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#101018] p-5">
                <div className="mb-4 text-xs font-semibold uppercase text-gray-500">Indexed documents</div>
                <div className="space-y-2">
                  {documents.length === 0 ? (
                    <div className="rounded-md border border-white/10 p-8 text-center text-sm text-gray-500">No indexed files yet.</div>
                  ) : (
                    documents.map((doc) => (
                      <div key={doc.id || doc.filename} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="h-5 w-5 shrink-0 text-teal-300" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{doc.filename}</div>
                            <div className="text-xs text-gray-500">{formatBytes(doc.file_size || doc.size || 0)}</div>
                          </div>
                        </div>
                        <span className="rounded-full bg-teal-400/10 px-2 py-1 text-xs text-teal-200">Indexed</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "gems" && (
          <section className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-8">
            <div className="mx-auto max-w-5xl">
              <h1 className="text-2xl font-semibold">Gems</h1>
              <p className="mt-1 text-sm text-gray-400">Create reusable specialist assistants with custom instructions.</p>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {gems.map((gem) => (
                  <button key={gem.name} onClick={() => setGems((prev) => prev.map((item) => ({ ...item, active: item.name === gem.name })))} className={`rounded-lg border p-4 text-left transition ${gem.active ? "border-teal-400/40 bg-teal-400/10" : "border-white/10 bg-[#101018] hover:border-white/20"}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{gem.name}</div>
                      <MoreHorizontal className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="mt-1 text-xs text-teal-200">{gem.tone}</div>
                    <div className="mt-3 text-xs leading-5 text-gray-400">{gem.instruction}</div>
                  </button>
                ))}
              </div>
              <form onSubmit={createGem} className="mt-6 rounded-lg border border-white/10 bg-[#101018] p-5">
                <h2 className="text-sm font-semibold">Create a Gem</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-[240px_1fr_auto]">
                  <input value={newGemName} onChange={(e) => setNewGemName(e.target.value)} className="rounded-md border border-white/10 bg-[#08080d] px-3 py-2 text-sm outline-none" placeholder="Name" />
                  <input value={newGemInstruction} onChange={(e) => setNewGemInstruction(e.target.value)} className="rounded-md border border-white/10 bg-[#08080d] px-3 py-2 text-sm outline-none" placeholder="Custom instruction" />
                  <button className="rounded-md bg-teal-400 px-4 py-2 text-xs font-semibold text-[#04100f]">Create</button>
                </div>
              </form>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
