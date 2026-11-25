"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Bot, User, Search, Loader2, Sparkles, Folder, Users } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

interface AiChatSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AiChatSheet({ open, onOpenChange }: AiChatSheetProps) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm your AI Research Assistant. Select your context above, and ask me anything about your papers or notes." }
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [contextTeam, setContextTeam] = useState("personal")
  const [contextFolder, setContextFolder] = useState("all")

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMsg = input
    setMessages((prev) => [...prev, { role: "user", content: userMsg }])
    setInput("")
    setLoading(true)

    // Simulate AI delay
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `I've analyzed the ${contextFolder === 'all' ? 'entire workspace' : 'selected folder'} in your ${contextTeam === 'personal' ? 'Personal Workspace' : 'Team Library'}.\n\nThis is a placeholder response for "${userMsg}". In the full implementation, I'll search through your papers and notes to give you grounded answers with citations!` }
      ])
      setLoading(false)
    }, 1500)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[450px] p-0 flex flex-col shadow-2xl border-l">
        <div className="p-5 pb-4 border-b bg-muted/20">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <SheetTitle className="text-base font-semibold">AI Assistant</SheetTitle>
            </div>
            <SheetDescription>
              Chat with your library and discover grounded insights.
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-5 flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground px-1 uppercase tracking-wider">Search Context</div>
            <div className="flex flex-col gap-2">
              <Select value={contextTeam} onValueChange={setContextTeam}>
                <SelectTrigger className="h-9">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Select Workspace" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal Workspace</SelectItem>
                  <SelectItem value="team-a">Research Team Alpha</SelectItem>
                  <SelectItem value="team-b">Data Science Pod</SelectItem>
                </SelectContent>
              </Select>

              <Select value={contextFolder} onValueChange={setContextFolder}>
                <SelectTrigger className="h-9">
                  <div className="flex items-center gap-2">
                    <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Select Folder" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Folders</SelectItem>
                  <SelectItem value="literature">Literature Review</SelectItem>
                  <SelectItem value="experiments">Experiments</SelectItem>
                  <SelectItem value="reading-list">Reading List</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 p-5 pr-4" ref={scrollRef}>
          <div className="space-y-6 pb-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 text-sm ${
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800">
                    <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                )}
                
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2.5 whitespace-pre-wrap leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted/60 text-foreground rounded-tl-sm border border-border/50"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex gap-3 text-sm justify-start">
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800">
                  <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="max-w-[80%] rounded-xl px-4 py-2.5 bg-muted/60 text-foreground rounded-tl-sm border border-border/50 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  <span className="text-sm text-muted-foreground">Searching and synthesizing...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-background shadow-[0_-4px_10px_rgb(0,0,0,0.02)]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <div className="relative">
              <Input
                placeholder="Ask about your papers..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="pr-12 bg-muted/50 border-border/60 focus-visible:ring-indigo-500"
                disabled={loading}
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!input.trim() || loading} 
                className="absolute right-1 top-1 bottom-1 h-8 w-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-all"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="text-center text-[11px] text-muted-foreground">
              AI responses are grounded in your selected folders and team.
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
