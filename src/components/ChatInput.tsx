import React, { useRef } from "react";
import { Paperclip, Loader2, Send } from "lucide-react";

interface ChatInputProps {
  inputText: string;
  onChangeInput: (text: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSending: boolean;
  isFileAnalyzing: boolean;
  onFileSelect: (file: File) => void;
  activeSessionId: number | null;
  theme: {
    sendBtn: string;
  };
  hasAttachments: boolean;
}

function ChatInput({
  inputText,
  onChangeInput,
  onSubmit,
  isSending,
  isFileAnalyzing,
  onFileSelect,
  activeSessionId,
  theme,
  hasAttachments,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Allow uploading multiple files at once!
      Array.from(e.target.files).forEach((file: any) => {
        onFileSelect(file as File);
      });
      // Clear file inputs so selecting identical file names in succession works as well
      e.target.value = "";
    }
  };

  const isButtonDisabled = (!inputText.trim() && !hasAttachments) || isSending || isFileAnalyzing;

  return (
    <form
      id="combat-input-form"
      onSubmit={onSubmit}
      className="max-w-3xl mx-auto relative group select-none"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}  
      name="message-form"
      aria-label="message-form"
    >
      <div className="relative rounded-2xl border border-white/10 bg-zinc-900/90 p-2 backdrop-blur-xl flex items-center justify-between gap-1 shadow-2xl transition duration-150 hover:border-white/15">
        <button
          id="btn-upload-paperclip"
          type="button"
          disabled={isFileAnalyzing || isSending || !activeSessionId}
          onClick={() => fileInputRef.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none"
          title="Upload image, code, pdf, or docs to analyze"
        >
          {isFileAnalyzing ? <Loader2 className="animate-spin text-purple-400" size={15} /> : <Paperclip size={15} />}
        </button>

        <input
          id="hidden-file-uploader"
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          className="hidden"
          accept=".png,.jpg,.jpeg,.webp,.py,.js,.ts,.html,.css,.php,.java,.c,.cpp,.json,.pdf,.docx,.txt"
        />

        <input
          id="message"
          name="message"
          type="text"
          value={inputText}
          autocomplete="off"
         autocorrect="off"
         autocapitalize="off"
         data-form-type="combat-input"
         data-lpignore="true"
         spellcheck={false}
          onChange={(e) => onChangeInput(e.target.value)}
          disabled={isSending || !activeSessionId}
          placeholder={
            activeSessionId
              ? "Send a command… (supports paste: images + files)"
              : "Select or spawn active session first…"
          }

          className="flex-1 bg-transparent py-3 px-3 font-sans text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-0 disabled:opacity-50"
          autoComplete="off"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onPaste={(e) => {
            if (!activeSessionId) return;
            const items = e.clipboardData?.items;
            if (!items) return;

            // If user pastes an image from clipboard (screenshots, etc.), stage it as an attachment.
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (!item) continue;
              if (item.type && item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) onFileSelect(file);
              }
            }
          }}
        />

        <button
          id="btn-submit-message"
          type="submit"
          disabled={isButtonDisabled}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-purple-950 transition-all duration-200 ${
            isButtonDisabled
              ? "bg-zinc-800 text-zinc-600 cursor-not-allowed border border-white/5 opacity-50"
              : theme.sendBtn + " cursor-pointer scale-100 hover:scale-105 active:scale-95 shadow-lg shadow-purple-500/10"
          }`}
          title="Dispatch squad query"
        >
          <Send size={15} />
        </button>
      </div>
    </form>
  );
}

export default React.memo(ChatInput);
