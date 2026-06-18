import { ChatSession, Message, User, UploadedFile } from "../types";

const DEFAULT_URL = import.meta.env.VITE_API_URL || "/api/proxy";

export function getStoredApiUrl(): string {
  const storedUrl = localStorage.getItem("igris_api_url");
  return storedUrl || DEFAULT_URL;
}

export function setStoredApiUrl(url: string) {
  localStorage.setItem("igris_api_url", url);
  updateDiagnostics({ currentUrl: url });
}

export function getStoredToken(): string | null {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("igris_token") ||
    sessionStorage.getItem("access_token") ||
    sessionStorage.getItem("igris_token")
  );
}

export function setStoredToken(token: string, rememberMe: boolean = true) {
  if (rememberMe) {
    localStorage.setItem("access_token", token);
    localStorage.setItem("igris_token", token);
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("igris_token");
  } else {
    sessionStorage.setItem("access_token", token);
    sessionStorage.setItem("igris_token", token);
    localStorage.removeItem("access_token");
    localStorage.removeItem("igris_token");
  }
  updateDiagnostics({ tokenPresent: true });
}

export function clearStoredToken() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("igris_token");
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("igris_token");
  updateDiagnostics({ tokenPresent: false });
}

export function getStoredUser(): User | null {
  const userStr = localStorage.getItem("igris_user") || sessionStorage.getItem("igris_user");
  const token = getStoredToken();
  if (!token) return null;

  if (userStr) {
    try {
      const parsed = JSON.parse(userStr);
      if (parsed) {
        parsed.token = token;
        return parsed;
      }
    } catch {
      // Ignore
    }
  }

  return {
    username: "MONARCH",
    email: "user@example.com",
    token: token
  };
}

export function setStoredUser(user: User, rememberMe: boolean = true) {
  if (rememberMe) {
    localStorage.setItem("igris_user", JSON.stringify(user));
    sessionStorage.removeItem("igris_user");
    if (user.token) {
      setStoredToken(user.token, true);
    }
  } else {
    sessionStorage.setItem("igris_user", JSON.stringify(user));
    localStorage.removeItem("igris_user");
    if (user.token) {
      setStoredToken(user.token, false);
    }
  }
}

interface DiagState {
  currentUrl: string;
  tokenPresent: boolean;
  lastRequest: string;
  lastResponse: string;
}

export let apiDiagnostics: DiagState = {
  currentUrl: getStoredApiUrl(),
  tokenPresent: !!getStoredToken(),
  lastRequest: "None",
  lastResponse: "None",
};

type DiagListener = (diag: DiagState) => void;
const listeners = new Set<DiagListener>();

export function subscribeToDiagnostics(listener: DiagListener) {
  listeners.add(listener);
  listener({ ...apiDiagnostics });
  return () => {
    listeners.delete(listener);
  };
}

export function updateDiagnostics(updates: Partial<DiagState>) {
  apiDiagnostics = { ...apiDiagnostics, ...updates };
  listeners.forEach((listener) => listener({ ...apiDiagnostics }));
}

// Low-level request wrapper for tracing & logging
async function loggedFetch(url: string, options: RequestInit): Promise<Response> {
  const method = options.method || "GET";
  const body = options.body ? String(options.body) : "None";
  const token = getStoredToken();
  
  const headersObj = options.headers ? { ...(options.headers as Record<string, string>) } : {};
  const maskedUrl = url.replace(/(https?:\/\/)[^\/]+/, "$1••••••••");
  const requestLog = `[${method}] ${maskedUrl}\nHeaders: ${JSON.stringify(headersObj, null, 2)}\nBody: ${body}`;
  
  console.log(`>>> API REQUEST:\nURL: ${url}\nMethod: ${method}\nHeaders: ${JSON.stringify(headersObj)}\nBody: ${body}`);
  
  updateDiagnostics({
    lastRequest: requestLog,
    currentUrl: getStoredApiUrl().replace(/(https?:\/\/)[^\/]+/, "$1••••••••"),
    tokenPresent: !!token,
  });

  try {
    const res = await fetch(url, options);
    const resClone = res.clone();
    let responseBody = "";
    try {
      responseBody = await resClone.text();
    } catch {
      responseBody = "[Unparseable response stream]";
    }

    const responseLog = `Status: ${res.status} ${res.statusText}\nBody: ${responseBody}`;
    console.log(`<<< API RESPONSE:\nURL: ${url}\nStatus: ${res.status}\nBody: ${responseBody}`);

    updateDiagnostics({
      lastResponse: responseLog,
    });

    return res;
  } catch (err: any) {
    const originalMessage = err.message || String(err);
    let enhancedMessage = originalMessage;
    
    if (err instanceof TypeError && originalMessage === "Failed to fetch") {
      enhancedMessage = `Connection block to "${url}" detected. Possible causes: CORS blockage, offline backend (asleep on Render free tier), or invalid secure HTTPS protocol routing.`;
    }

    const responseLog = `Network Error:\n${enhancedMessage}`;
    console.error(`<<< API ERROR:\nURL: ${url}\nReason: ${enhancedMessage}`);

    updateDiagnostics({
      lastResponse: responseLog,
    });

    throw new Error(enhancedMessage);
  }
}

export async function checkServerStatus(baseUrl: string): Promise<boolean> {
  try {
    // Test using the official sessions API endpoint
    const res = await fetch(`${baseUrl}/sessions`, {
      method: "GET",
      headers: { "accept": "application/json" },
    });
    // Any status code indicates the server is awake and accepting connections
    return res.status !== 0;
  } catch (err) {
    return false;
  }
}

export async function registerUser(baseUrl: string, payload: any): Promise<boolean> {
  const res = await loggedFetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    let errMsg = "Registration failed";
    if (errorData.detail) {
      if (Array.isArray(errorData.detail)) {
        errMsg = errorData.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ");
      } else if (typeof errorData.detail === "string") {
        errMsg = errorData.detail;
      } else {
        errMsg = errorData.detail.msg || JSON.stringify(errorData.detail);
      }
    }
    throw new Error(errMsg);
  }
  return true;
}

export async function loginUser(baseUrl: string, payload: any): Promise<{ access_token: string }> {
  const res = await loggedFetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    let errMsg = "Login invalid credentials";
    if (errorData.detail) {
      if (typeof errorData.detail === "string") {
        errMsg = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        errMsg = errorData.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ");
      } else {
        errMsg = errorData.detail.msg || JSON.stringify(errorData.detail);
      }
    }
    throw new Error(errMsg);
  }
  return res.json();
}

export async function fetchSessions(baseUrl: string, token: string): Promise<ChatSession[]> {
  const res = await loggedFetch(`${baseUrl}/sessions`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "accept": "application/json",
    },
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to load sessions from server");
  }
  return res.json();
}

export async function createSessionOnServer(baseUrl: string, token: string): Promise<ChatSession> {
  const res = await loggedFetch(`${baseUrl}/sessions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // Backend requires a body object (e.g. { "title": "New Chat" })
    body: JSON.stringify({ title: "New Chat" }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to create session on server");
  }
  return res.json();
}

export async function renameSessionOnServer(baseUrl: string, token: string, sessionId: number, title: string): Promise<ChatSession> {
  const res = await loggedFetch(`${baseUrl}/sessions/${sessionId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to rename session");
  }
  return res.json();
}

export async function deleteSessionFromServer(baseUrl: string, token: string, sessionId: number): Promise<boolean> {
  const res = await loggedFetch(`${baseUrl}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to delete session from server");
  }
  return res.ok;
}

export async function fetchSessionMessagesFromServer(baseUrl: string, token: string, sessionId: number): Promise<Message[]> {
  try {
    const res = await loggedFetch(`${baseUrl}/sessions/${sessionId}/messages`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "accept": "application/json",
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((item: any, idx: number) => ({
          id: item.id ? String(item.id) : `msg-${Date.now()}-${idx}`,
          role: item.role === "user" ? "user" : "assistant",
          content: item.content || item.message || "",
          timestamp: item.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
      }
    }
  } catch (e) {
    console.warn("Messages subroute failed:", e);
  }

  try {
    const res = await loggedFetch(`${baseUrl}/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "accept": "application/json",
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.messages)) {
        return data.messages.map((item: any, idx: number) => ({
          id: item.id ? String(item.id) : `msg-${Date.now()}-${idx}`,
          role: item.role === "user" ? "user" : "assistant",
          content: item.content || item.message || "",
          timestamp: item.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
      }
    }
  } catch (e) {
    console.warn("Session detailed query failed:", e);
  }

  throw new Error("NOT_SUPPORTED");
}

export async function postChatMessage(
  baseUrl: string,
  token: string,
  sessionId: number,
  message: string,
  fileType?: string,
  fileName?: string,
  fileData?: string,
  fileAnalysis?: any,
  files?: UploadedFile[]
): Promise<{ response: string; session_id?: number }> {
  let bodyPayload: any;

  if (files && files.length > 0) {
    const formattedFiles = files.map(f => {
      let mappedType = f.fileType;
      // Map file types to the requested schema values: image|code|pdf|doc|text
      if (f.fileType === "docx") mappedType = "doc" as any;
      else if (f.fileType === "txt") mappedType = "text" as any;

      const analysisObj = {
        summary: f.analysis?.summary || f.analysis?.description || "",
        ocr: f.analysis?.ocrText || "",
        objects: Array.isArray(f.analysis?.detectedObjects) ? f.analysis.detectedObjects : [],
        issues: [
          ...(Array.isArray(f.analysis?.bugs) ? f.analysis.bugs : []),
          ...(Array.isArray(f.analysis?.securityIssues) ? f.analysis.securityIssues : [])
        ],
        insights: [
          ...(Array.isArray(f.analysis?.insights) ? f.analysis.insights : []),
          ...(Array.isArray(f.analysis?.keyPoints) ? f.analysis.keyPoints : []),
          ...(Array.isArray(f.analysis?.suggestedImprovements) ? f.analysis.suggestedImprovements : [])
        ]
      };

      return {
        name: f.fileName,
        type: mappedType,
        raw_content: f.rawContent,
        analysis: analysisObj
      };
    });

    const primaryFile = files[0];
    let primaryMappedType = primaryFile.fileType;
    if (primaryFile.fileType === "docx") primaryMappedType = "doc" as any;
    else if (primaryFile.fileType === "txt") primaryMappedType = "text" as any;

    const primaryAnalysisObj = {
      summary: primaryFile.analysis?.summary || primaryFile.analysis?.description || "",
      ocr: primaryFile.analysis?.ocrText || "",
      objects: Array.isArray(primaryFile.analysis?.detectedObjects) ? primaryFile.analysis.detectedObjects : [],
      issues: [
        ...(Array.isArray(primaryFile.analysis?.bugs) ? primaryFile.analysis.bugs : []),
        ...(Array.isArray(primaryFile.analysis?.securityIssues) ? primaryFile.analysis.securityIssues : [])
      ],
      insights: [
        ...(Array.isArray(primaryFile.analysis?.insights) ? primaryFile.analysis.insights : []),
        ...(Array.isArray(primaryFile.analysis?.keyPoints) ? primaryFile.analysis.keyPoints : []),
        ...(Array.isArray(primaryFile.analysis?.suggestedImprovements) ? primaryFile.analysis.suggestedImprovements : [])
      ]
    };

    bodyPayload = {
      message: message || "User uploaded files",
      session_id: sessionId,
      input_type: "file",
      file: {
        name: primaryFile.fileName,
        type: primaryMappedType,
        raw_content: primaryFile.rawContent
      },
      analysis: primaryAnalysisObj,
      files: formattedFiles
    };
  } else if (fileType) {
    // Map file types to the requested schema values: image|code|pdf|doc|text
    let mappedType = fileType;
    if (fileType === "docx") mappedType = "doc";
    else if (fileType === "txt") mappedType = "text";

    // Reconstruct analysis object with the exact keys: summary, ocr, objects, issues, insights
    const analysisObj = {
      summary: fileAnalysis?.summary || fileAnalysis?.description || "",
      ocr: fileAnalysis?.ocrText || "",
      objects: Array.isArray(fileAnalysis?.detectedObjects) ? fileAnalysis.detectedObjects : [],
      issues: [
        ...(Array.isArray(fileAnalysis?.bugs) ? fileAnalysis.bugs : []),
        ...(Array.isArray(fileAnalysis?.securityIssues) ? fileAnalysis.securityIssues : [])
      ],
      insights: [
        ...(Array.isArray(fileAnalysis?.insights) ? fileAnalysis.insights : []),
        ...(Array.isArray(fileAnalysis?.keyPoints) ? fileAnalysis.keyPoints : []),
        ...(Array.isArray(fileAnalysis?.suggestedImprovements) ? fileAnalysis.suggestedImprovements : [])
      ]
    };

    bodyPayload = {
      message: message || "User uploaded a file",
      session_id: sessionId,
      input_type: "file",
      file: {
        name: fileName || "file",
        type: mappedType,
        raw_content: fileData || ""
      },
      analysis: analysisObj
    };
  } else {
    bodyPayload = {
      message,
      session_id: sessionId,
      input_type: "text",
      file: null,
      analysis: null,
      files: []
    };
  }

  const res = await loggedFetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyPayload),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Chat service returned an error");
  }
  return res.json();
}
