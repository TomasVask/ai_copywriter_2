import { ChatMessage } from './ChatMessage';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useEffect, useRef } from 'react';
import { Message } from '@/models/message.model';

interface ChatAreaProps {
  messages: Message[];
}

const MODEL_KEYS = [
  { key: 'openai', label: 'Model 1 (GPT-4)' },
  { key: 'anthropic', label: 'Model 2 (Claude)' },
  { key: 'gemini', label: 'Model 3 (Gemini)' },
];

const ChatArea = ({ messages }: ChatAreaProps) => {
  const containerRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];

  useEffect(() => {
    containerRefs.forEach(ref => {
      if (ref.current) {
        ref.current.scrollTop = ref.current.scrollHeight;
      }
    });
    // eslint-disable-next-line
  }, [messages]);

  return (
    <div className="flex-1 grid grid-cols-3 gap-4 p-4 overflow-hidden">
      {MODEL_KEYS.map((model, idx) => (
        <Card className="flex flex-col" key={model.key}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{model.label}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <div
              ref={containerRefs[idx]}
              className="space-y-4 px-2 overflow-y-auto min-h-[120px] max-h-[70vh]"
            >
              {messages.map(message => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  modelKey={model.key}
                  isLatestAssistantMessage={
                    // Check if this is the latest assistant message that should show streaming data
                    message.role === "assistant" &&
                    message.id === messages
                      .filter(m => m.role === "assistant")
                      .slice(-1)[0]?.id
                  }
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ChatArea;