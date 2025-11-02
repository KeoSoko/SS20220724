import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MessageCircle, Send, Bot, User, Lightbulb, AlertCircle, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { GovernmentDisclaimer } from '@/components/government-disclaimer';
import { apiRequest } from '@/lib/queryClient';

interface TaxQuestion {
  id: string;
  question: string;
  response: string;
  category: 'deductions' | 'deadlines' | 'documentation' | 'calculations' | 'general';
  confidence: number;
  timestamp: Date;
  followUpSuggestions: string[];
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  category?: string;
  confidence?: number;
  followUpSuggestions?: string[];
}

interface CommonQuestion {
  question: string;
  category: string;
  quickAnswer: string;
}

interface TaxAIAssistantProps {
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
}

const TaxAIAssistant: React.FC<TaxAIAssistantProps> = ({ isOpen, onToggle }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isExpanded, setIsExpanded] = useState(isOpen || false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Update expanded state when external prop changes
  useEffect(() => {
    if (isOpen !== undefined) {
      setIsExpanded(isOpen);
    }
  }, [isOpen]);

  // Notify parent when state changes
  const handleToggle = (newState: boolean) => {
    setIsExpanded(newState);
    onToggle?.(newState);
  };

  // Clear chat messages
  const clearChat = () => {
    setMessages([]);
    toast({
      title: "Chat Cleared",
      description: "All messages have been cleared from the conversation.",
    });
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch common questions
  const { data: commonQuestionsData } = useQuery({
    queryKey: ['/api/tax/common-questions'],
    enabled: true
  });

  // Fetch personalized tips
  const { data: taxTips } = useQuery({
    queryKey: ['/api/tax/tips'],
    enabled: true
  });

  // Ask tax question mutation
  const askQuestionMutation = useMutation({
    mutationFn: async (question: string) => {
      const response = await apiRequest('POST', '/api/tax/ask', { question });
      return await response.json();
    },
    onSuccess: (response: TaxQuestion) => {
      const assistantMessage: Message = {
        id: response.id,
        type: 'assistant',
        content: response.response,
        timestamp: new Date(response.timestamp),
        category: response.category,
        confidence: response.confidence,
        followUpSuggestions: response.followUpSuggestions
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      scrollToBottom();
    },
    onError: (error) => {
      console.error('Error asking tax question:', error);
      toast({
        title: "Error",
        description: "Failed to get answer. Please try again.",
        variant: "destructive"
      });
    }
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    askQuestionMutation.mutate(inputValue);
    setInputValue('');
  };

  const handleQuickQuestion = (question: string) => {
    setInputValue(question);
    const userMessage: Message = {
      id: `user_${Date.now()}`,
      type: 'user',
      content: question,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    askQuestionMutation.mutate(question);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'deductions': return 'bg-blue-100 text-blue-800';
      case 'deadlines': return 'bg-red-100 text-red-800';
      case 'documentation': return 'bg-green-100 text-green-800';
      case 'calculations': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.8) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (confidence >= 0.6) return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  };

  if (!isExpanded) {
    return (
      <div className="fixed bottom-20 right-4 z-50 md:bottom-4 md:right-4">
        <Button
          onClick={() => handleToggle(true)}
          className="h-16 w-16 md:h-14 md:w-14 shadow-2xl bg-[#0073AA] hover:bg-[#005c8a] text-white flex flex-col items-center justify-center p-2 border-2 border-white"
          size="lg"
          title="Tax AI Assistant - Get South African tax information (guidance only)"
        >
          <MessageCircle className="h-6 w-6 mb-1 md:h-5 md:w-5" />
          <span className="text-[10px] font-bold leading-tight md:text-xs">TAX AI</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 sm:left-auto sm:right-4 sm:transform-none z-50 w-[calc(100vw-2rem)] max-w-[320px] sm:w-[400px] lg:w-[500px] xl:w-[550px] sm:max-w-none h-[500px] max-h-[calc(100vh-6rem)] bg-white shadow-2xl border-2 border-gray-300 flex flex-col md:max-h-[calc(100vh-2rem)] md:h-[600px] ml-[25px] mr-[25px] text-left">
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Tax AI Assistant
              <span className="text-xs text-gray-500 font-normal hidden sm:inline">(Informational Only)</span>
            </CardTitle>
            <div className="flex gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearChat}
                  title="Clear chat history"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggle(false)}
                title="Close chat"
              >
                ×
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col flex-1 p-2 overflow-hidden md:p-4 pt-[12px] pb-[12px] pl-[0px] pr-[0px]">
          {/* Messages Area */}
          <ScrollArea className="flex-1 mb-3 pr-2 max-h-[300px] md:mb-4 md:pr-4 md:max-h-[400px]">
            <div className="space-y-4 pb-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <Bot className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm break-words leading-relaxed px-1 max-w-full">Ask me any South African<br />tax question!</p>
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-auto py-1 px-2 border-orange-200 text-orange-700 hover:bg-orange-50"
                      onClick={() => setShowDisclaimer(!showDisclaimer)}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {showDisclaimer ? 'Hide' : 'View'} Important Disclaimer
                    </Button>
                    {showDisclaimer && (
                      <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg ml-[30px] mr-[30px]">
                        <div className="text-xs text-orange-800">
                          <p className="font-semibold mb-1">Important Notice:</p>
                          <p>Information based on publicly available SARS documentation. Not affiliated with SARS or government entities.</p>
                          <p className="mt-1"><strong>Source:</strong> <a href="https://www.sars.gov.za" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">www.sars.gov.za</a></p>
                          <p className="mt-1"><strong>Disclaimer:</strong> For guidance only - consult qualified tax professionals for official advice.</p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Personalized Tips */}
                  {taxTips && (taxTips as any).tips && (taxTips as any).tips.length > 0 && (
                    <div className="mt-6 text-left">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        Personalized Tips
                      </h4>
                      <div className="space-y-2">
                        {(taxTips as any).tips.slice(0, 3).map((tip: string, index: number) => (
                          <div key={index} className="text-xs bg-blue-50 p-2 rounded break-words leading-relaxed ml-[30px] mr-[30px]">
                            {tip}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Common Questions */}
                  {commonQuestionsData && (commonQuestionsData as any).questions && (commonQuestionsData as any).questions.length > 0 && (
                    <div className="mt-6 text-left">
                      <h4 className="font-semibold mb-3">Common Questions</h4>
                      <div className="space-y-2">
                        {(commonQuestionsData as any).questions.slice(0, 3).map((q: CommonQuestion, index: number) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            className="w-full text-left justify-start text-xs h-auto py-2"
                            onClick={() => handleQuickQuestion(q.question)}
                          >
                            {q.question}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.type === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[90%] p-3 overflow-hidden ${
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {message.type === 'assistant' && (
                        <Bot className="h-4 w-4 text-primary flex-shrink-0 mt-1" />
                      )}
                      {message.type === 'user' && (
                        <User className="h-4 w-4 flex-shrink-0 mt-1" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed" style={{overflowWrap: 'break-word', wordBreak: 'break-word'}} dangerouslySetInnerHTML={{__html: message.content}} />
                        
                        {message.category && message.confidence && (
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className={getCategoryColor(message.category)}>
                              {message.category}
                            </Badge>
                            <div className="flex items-center gap-1">
                              {getConfidenceIcon(message.confidence)}
                              <span className="text-xs text-gray-500">
                                {Math.round(message.confidence * 100)}%
                              </span>
                            </div>
                          </div>
                        )}

                        {message.followUpSuggestions && message.followUpSuggestions.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs text-gray-600">Follow up:</p>
                            {message.followUpSuggestions.map((suggestion, index) => (
                              <Button
                                key={index}
                                variant="ghost"
                                size="sm"
                                className="h-auto p-1 text-xs text-primary hover:bg-primary/10 text-left whitespace-normal break-words"
                                onClick={() => handleQuickQuestion(suggestion)}
                                style={{overflowWrap: 'break-word', wordBreak: 'break-word'}}
                              >
                                {suggestion}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {askQuestionMutation.isPending && (
                <div className="flex gap-3 justify-start">
                  <div className="bg-gray-100 p-3">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 animate-bounce delay-100"></div>
                        <div className="w-2 h-2 bg-gray-400 animate-bounce delay-200"></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          <Separator className="mb-3 flex-shrink-0 md:mb-4" />

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="flex gap-2 flex-shrink-0 pb-safe ml-[10px] mr-[10px]">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask your tax question..."
              className="flex-1"
              disabled={askQuestionMutation.isPending}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!inputValue.trim() || askQuestionMutation.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default TaxAIAssistant;