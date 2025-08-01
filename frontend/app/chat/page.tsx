"use client";

import ChatBar from "../components/ui/chat-bar";
import ChatHeader from "../components/ui/chat-header";
import ChatHistorySidebar from "../components/ui/chat-history-sidebar";
import TypingIndicator from "../components/ui/typing-indicator";
import FeatureSections from "../components/ui/feature-sections";
import { useState, useEffect, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokenCount?: number;
  structuredResponse?: { [key: string]: string };
  hasFeatures?: boolean;
}

interface Model {
  _id: string;
  name: string;
  description: string;
  categoryId: string;
  masterPrompt: string;
  featureIds: string[];
  isActive: boolean;
  inputCostPer1KTokens?: number;
  outputCostPer1KTokens?: number;
}

interface Feature {
  _id: string;
  name: string;
  description: string;
  prompt: string;
  order: number;
  isOptional: boolean;
}

// Function to clean up markdown formatting
const cleanMarkdown = (text: string): string => {
  return text
    // Remove bold markdown (**text** -> text)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    // Remove italic markdown (*text* -> text)
    .replace(/\*(.*?)\*/g, '$1')
    // Remove code markdown (`text` -> text)
    .replace(/`(.*?)`/g, '$1')
    // Remove heading markdown (# Heading -> Heading)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove list markdown (- item -> item)
    .replace(/^[-*+]\s+/gm, '')
    // Remove numbered list markdown (1. item -> item)
    .replace(/^\d+\.\s+/gm, '')
    // Clean up extra whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
};

function ChatPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const botId = searchParams.get('id');
  const { user } = useAuth();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [userCredits, setUserCredits] = useState<number>(0);
  const [showHistory, setShowHistory] = useState(false);
  const [modelFeatures, setModelFeatures] = useState<Feature[]>([]);
  const [regeneratingFeature, setRegeneratingFeature] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

  // Fetch model data when botId changes
  useEffect(() => {
    const fetchModel = async () => {
      if (!botId) {
        setError('No bot ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/ai-models/models/${botId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          setModel(data.data);
          
          // Fetch model features if the model has featureIds
          if (data.data.featureIds && data.data.featureIds.length > 0) {
            try {
              const featuresResponse = await fetch(`${API_BASE}/ai-models/features`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                credentials: "include",
                body: JSON.stringify({ featureIds: data.data.featureIds })
              });
              
              if (featuresResponse.ok) {
                const featuresData = await featuresResponse.json();
                if (featuresData.success) {
                  setModelFeatures(featuresData.data);
                }
              }
            } catch (error) {
              console.error('Error fetching model features:', error);
            }
          }
        } else {
          throw new Error(data.error || 'Failed to fetch model');
        }
      } catch (err) {
        console.error('Error fetching model:', err);
        setError(err instanceof Error ? err.message : 'Failed to load bot');
      } finally {
        setLoading(false);
      }
    };

    fetchModel();
  }, [botId, API_BASE]);

  // Fetch user credits
  useEffect(() => {
    const fetchCredits = async () => {
      if (!user) return;
      
      try {
        const response = await fetch(`${API_BASE}/generate/credits`, {
          credentials: "include",
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setUserCredits(data.data.creditsRemaining);
          }
        }
      } catch (error) {
        console.error('Error fetching credits:', error);
      }
    };

    fetchCredits();
  }, [user, API_BASE]);

  // Load chat history if chatId is provided in URL
  useEffect(() => {
    const loadChatHistory = async () => {
      const chatId = searchParams.get('chatId');
      if (!chatId || !user) return;

      try {
        const response = await fetch(`${API_BASE}/generate/chat/${chatId}/history`, {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setMessages(data.data.messages.map((msg: {
              id: string;
              role: 'user' | 'assistant';
              content: string;
              timestamp: string;
              tokenCount: number;
              structuredResponse?: { [key: string]: string };
              hasFeatures?: boolean;
            }) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: new Date(msg.timestamp),
              tokenCount: msg.tokenCount,
              structuredResponse: msg.structuredResponse,
              hasFeatures: msg.hasFeatures
            })));
            setCurrentChatId(chatId);
          }
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
      }
    };

    loadChatHistory();
  }, [searchParams, user, API_BASE]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSelectChat = (chatId: string) => {
    // Navigate to the chat with the selected chatId
    router.push(`/chat?id=${botId}&chatId=${chatId}`);
  };

  const handleClearChat = (chatId: string) => {
    // If the cleared chat is the current one, clear the messages
    if (currentChatId === chatId) {
      setMessages([]);
      setCurrentChatId(null);
      // Navigate back to just the bot without chatId
      router.push(`/chat?id=${botId}`);
    }
  };

  const handleShowHistory = () => {
    setShowHistory(true);
  };

  const handleRegenerateFeature = async (featureName: string, feedback: string) => {
    if (!user || !model || !currentChatId || regeneratingFeature) return;

    setRegeneratingFeature(true);
    try {
      // Find the last assistant message with structured response
      const lastAssistantMessage = messages
        .filter(msg => msg.role === 'assistant' && msg.structuredResponse)
        .pop();

      if (!lastAssistantMessage || !lastAssistantMessage.structuredResponse) {
        throw new Error('No structured response found to regenerate');
      }

      const payload = {
        modelId: model._id,
        featureName,
        userFeedback: feedback,
        currentResponse: lastAssistantMessage.structuredResponse,
        chatId: currentChatId
      };

      const response = await fetch(`${API_BASE}/generate/regenerate-feature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to regenerate feature');
      }

      const data = await response.json();
      
      if (data.success) {
        // Update the last assistant message with the new structured response
        setMessages(prev => prev.map(msg => 
          msg.id === lastAssistantMessage.id 
            ? { ...msg, structuredResponse: data.data.updatedResponse }
            : msg
        ));
        
        // Update user credits
        if (data.data.cost) {
          setUserCredits(prev => Math.max(0, prev - data.data.cost));
        }
      } else {
        throw new Error(data.message || 'Failed to regenerate feature');
      }

    } catch (error) {
      console.error('Error regenerating feature:', error);
      setError(error instanceof Error ? error.message : 'Failed to regenerate feature');
    } finally {
      setRegeneratingFeature(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!user || !model || sending) return;

    // Add user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setSending(true);

    try {
      // Prepare request payload
      const payload = {
        modelId: model._id,
        userInput: text,
        userId: user.id,
        ...(currentChatId && { sessionId: currentChatId })
      };

      const response = await fetch(`${API_BASE}/generate/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send message');
      }

      const data = await response.json();
      
      if (data.success) {
        // Add AI response
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.data.response,
          timestamp: new Date(),
          structuredResponse: data.data.structuredResponse,
          hasFeatures: data.data.hasFeatures
        };
        
        setMessages(prev => [...prev, aiMessage]);
        
        // Set chat ID for future messages
        if (data.data.chatId) {
          setCurrentChatId(data.data.chatId);
        }
        
        // Update user credits
        if (data.data.cost) {
          setUserCredits(prev => Math.max(0, prev - data.data.cost));
        }
      } else {
        throw new Error(data.message || 'Failed to get response');
      }

    } catch (error) {
      console.error('Error sending message:', error);
      setError(error instanceof Error ? error.message : 'Failed to send message');
      
      // Remove the user message if there was an error
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="flex-none">
          <ChatHeader />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading bot...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="flex-none">
          <ChatHeader />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-500 mb-2">Error</p>
            <p className="text-muted-foreground">{error || 'Bot not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-none">
        <ChatHeader 
          onShowHistory={handleShowHistory}
          hasHistory={user !== null}
          modelFeatures={modelFeatures}
        />
      </div>
      
      {/* Chat History Sidebar */}
      <ChatHistorySidebar
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onSelectChat={handleSelectChat}
        onClearChat={handleClearChat}
        currentChatId={currentChatId}
      />
      
      <div className="flex-1 overflow-hidden pt-15">
        <div className="h-full relative">
          <AnimatePresence>
            {messages.length === 0 && currentChatId === null ? (
              <motion.div
                initial={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex items-center justify-center h-full text-foreground flex-col gap-6 px-4"
              >
                {/* Main Container with Gradient Background */}
                <div className="relative max-w-md w-full">
                  {/* Gradient Background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 rounded-2xl blur-xl"></div>
                  
                  {/* Content Card */}
                  <div className="relative bg-background/80 backdrop-blur-sm border border-primary/20 rounded-2xl p-8 shadow-xl">
                    {/* AI Icon with Glow */}
                    <div className="flex justify-center mb-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-primary/30 rounded-xl blur-lg animate-pulse"></div>
                        <div className="relative h-16 w-16 bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-lg ring-2 ring-primary/20 hover:ring-primary/40 transition-all duration-300 hover:scale-105 flex items-center justify-center">
                          <span className="text-primary-foreground font-bold text-xl">AI</span>
                        </div>
                      </div>
                    </div>

                    {/* Model Name */}
                    <h1 className="text-3xl font-bold text-center mb-3 relative">
                      <span className="text-transparent bg-gradient-to-r from-green-600 via-green-700 to-emerald-700 bg-clip-text">
                        {model.name}
                      </span>
                    </h1>

                    {/* Model Description */}
                    <p className="text-sm text-muted-foreground text-center leading-relaxed mb-6">
                      {model.description}
                    </p>

                    {/* Features Badge if model has features */}
                    {modelFeatures.length > 0 && (
                      <div className="flex justify-center mb-4">
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-foreground text-xs font-medium rounded-full border border-green-700/20">
                          <div className="w-1.5 h-1.5 bg-green-700 rounded-full"></div>
                          {modelFeatures.length} Features Available
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full overflow-y-auto scrollbar-hide px-4">
                {/* Small Model Info Card - only when chat has messages AND it's not a history conversation */}
                {currentChatId === null && (
                  <div className="max-w-4xl mx-auto pt-2 pb-1">
                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border border-border/30 w-fit">
                      <div className="h-5 w-5 bg-primary rounded-sm flex items-center justify-center">
                        <span className="text-primary-foreground font-bold text-xs">AI</span>
                      </div>
                      <span className="text-xs font-medium text-foreground">{model.name}</span>
                    </div>
                  </div>
                )}
                
                <div className="max-w-4xl mx-auto space-y-4 py-2">
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ 
                        duration: 0.3, 
                        delay: message.role === 'assistant' ? 0.1 : 0 
                      }}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-[80%] p-4 rounded-3xl border ${
                          message.role === 'user' 
                            ? 'bg-primary text-primary-foreground border-primary/30' 
                            : 'bg-muted border-border'
                        }`}
                      >
                        {message.role === 'assistant' && message.hasFeatures && message.structuredResponse ? (
                          <FeatureSections
                            features={modelFeatures}
                            structuredResponse={message.structuredResponse}
                            onRegenerateFeature={handleRegenerateFeature}
                            isRegenerating={regeneratingFeature}
                          />
                        ) : (
                          <div className="whitespace-pre-wrap">
                            {message.role === 'assistant' ? cleanMarkdown(message.content) : message.content}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {sending && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="bg-muted border border-border max-w-[80%] p-4 rounded-3xl">
                        <TypingIndicator />
                      </div>
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-none px-4 max-w-4xl mx-auto w-full">
        <ChatBar 
          onSendMessage={handleSendMessage} 
          disabled={sending || userCredits <= 0.01}
          placeholder={userCredits <= 0.01 ? "Insufficient credits" : "Type your message..."}
        />
        {userCredits <= 0.01 && (
          <div className="text-center text-sm text-red-500 mt-2">
            Insufficient credits. Please upgrade your plan.
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="flex-none">
          <ChatHeader />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
} 