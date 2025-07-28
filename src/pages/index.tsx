import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import InputField from "@/components/InputField";
import { Message } from "@/models/message.model";
import { ChatSession } from "@/models/chatSession.model";
import { LargeLanguageModel } from "@/models/largeLanguageModel.model";
import { useChatStore } from "@/store/chatStore";
import { sendChatMessageToRagApi } from "@/services/chatApiRequest";
import { ModelResponseAction } from "@/enums/modelResponseAction.enum";
import { GraphStep } from "@/enums/graphStep.enum";

export default function Home() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const currentSession = useChatStore((s) => s.currentSession);
  const setCurrentSession = useChatStore((s) => s.setCurrentSession);
  const chatHistory = useChatStore((s) => s.chatHistory);
  const setChatHistory = useChatStore((s) => s.setChatHistory);
  const [lastSelectedModels, setLastSelectedModels] = useState<LargeLanguageModel[]>([
    'openai', 'anthropic', 'gemini'
  ]);

  function getUpdatedSession(
    currentSession: ChatSession | null,
    newMessage: Message
  ): ChatSession {
    if (!currentSession) {
      return {
        id: Date.now().toString(),
        title: newMessage.content.slice(0, 20) + (newMessage.content.length > 15 ? "..." : ""),
        messages: [newMessage],
        createdAt: new Date(),
      };
    } else {
      return {
        ...currentSession,
        messages: [...currentSession.messages, newMessage],
      };
    }
  }

  function createAssistantMessage(models: LargeLanguageModel[]): Message {
    return {
      id: Date.now().toString() + "-assistant",
      content: "",
      role: "assistant",
      timestamp: new Date(),
      activeModels: [...models],
      responses: models.map(model => ({
        model,
        generatedContent: "",
        loading: true,
      })),
    };
  }

  function updateAssistantMessageProperty(property: string, value: string, assistantMessage: Message) {
    const currentSessionValue = useChatStore.getState().currentSession;
    if (!currentSessionValue) return;
    const updatedMessages = currentSessionValue.messages.map((msg) => {
      if (msg.id === assistantMessage.id) {
        return { ...msg, [property]: value };
      }
      return msg;
    });
    setCurrentSession({ ...currentSessionValue, messages: updatedMessages });
  }

  const handleNewMessage = async (
    content: string,
    activeModels: LargeLanguageModel[]
  ) => {
    setLastSelectedModels(activeModels);

    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      role: "user",
      timestamp: new Date(),
      activeModels: [...activeModels]
    };

    const updatedSession = getUpdatedSession(currentSession, newMessage);
    setCurrentSession(updatedSession);
    if (!currentSession) {
      const latestChatHistory = useChatStore.getState().chatHistory;
      setChatHistory([updatedSession, ...latestChatHistory.slice(0, 4)]);
    } else {
      const latestChatHistory = useChatStore.getState().chatHistory;
      setChatHistory(latestChatHistory.map(session => session.id === currentSession.id ? updatedSession : session));
    }

    const models: LargeLanguageModel[] = activeModels;
    const assistantMessage = createAssistantMessage(models);

    const sessionWithAssistant: ChatSession = {
      ...updatedSession,
      messages: [...updatedSession.messages, assistantMessage],
    };
    setCurrentSession(sessionWithAssistant);
    const latestChatHistory = useChatStore.getState().chatHistory;
    setChatHistory(latestChatHistory.map(session => session.id === sessionWithAssistant.id ? sessionWithAssistant : session));

    const cleanedMessages = filterAssistantResponsesByModels(sessionWithAssistant.messages, models);

    try {
      await sendChatMessageToRagApi(cleanedMessages, models, (stepData) => {
        const { type, model, content } = stepData;
        console.log('Step data received:', stepData);

        if (type === GraphStep.RetrievalContent) {
          updateAssistantMessageProperty("retrievedContent", content, assistantMessage);
        }

        if (type === GraphStep.ScrapedServices) {
          updateAssistantMessageProperty("scrapedServices", content, assistantMessage);
        }

        if (type === GraphStep.ScrapedServiceContent) {
          updateAssistantMessageProperty("scrapedServiceContent", content, assistantMessage);
        }

        if (type === GraphStep.Error && !model) {
          const currentSessionValue = useChatStore.getState().currentSession;
          if (!currentSessionValue) return;

          const updatedMessages = currentSessionValue.messages.map((msg) => {
            if (msg.id === assistantMessage.id) {
              const updatedResponses = (msg.responses || []).map(response => ({
                ...response,
                error: content,
                loading: false,
              }));
              return { ...msg, responses: updatedResponses };
            }
            return msg;
          });

          setCurrentSession({ ...currentSessionValue, messages: updatedMessages });
          updateChatHistory(currentSessionValue.id, updatedMessages);
        }



        if ((type === GraphStep.TaskSummary || type === GraphStep.GenerateAd || type === GraphStep.Error) && model) {
          const currentSessionValue = useChatStore.getState().currentSession;
          if (!currentSessionValue) return;

          const updatedMessages = currentSessionValue.messages.map((msg) => {
            if (msg.id === assistantMessage.id) {
              // Find the current model's response
              const existingResponses = msg.responses || [];
              const modelResponseIndex = existingResponses.findIndex(response => response.model === model);

              if (modelResponseIndex >= 0) {
                // Update existing model response
                const updatedResponses = [...existingResponses];
                const fieldToUpdate = type === GraphStep.GenerateAd ? "generatedContent" : type;

                updatedResponses[modelResponseIndex] = {
                  ...updatedResponses[modelResponseIndex],
                  [fieldToUpdate]: content,
                  action: type === GraphStep.TaskSummary ? ModelResponseAction.Generating : null,
                  loading: false
                };

                return { ...msg, responses: updatedResponses };
              } else {
                return {
                  ...msg,
                  responses: [
                    ...existingResponses,
                    {
                      model,
                      generatedContent: type === GraphStep.GenerateAd ? content : "",
                      ...(type === GraphStep.TaskSummary ? { taskSummary: content } : {}),
                      action: type === GraphStep.TaskSummary ? ModelResponseAction.Generating : null,
                      loading: false
                    }
                  ]
                };
              }
            }
            return msg;
          });

          setCurrentSession({ ...currentSessionValue, messages: updatedMessages });
          updateChatHistory(currentSessionValue.id, updatedMessages);
        }
      })
    } catch (error) {
      console.log(error)
      const currentSessionValue = useChatStore.getState().currentSession;
      if (!currentSessionValue) return;

      const updatedMessages = currentSessionValue.messages.map((msg) => {
        if (msg.id === assistantMessage.id) {
          const erroredResponses = (msg.responses || []).map(response => ({
            ...response,
            generatedContent: "",
            error: error instanceof Error ? error.message : String(error),
            loading: false,
          }));
          return {
            ...msg,
            responses: erroredResponses,
          };
        }
        return msg;
      });

      setCurrentSession({ ...currentSessionValue, messages: updatedMessages });
      updateChatHistory(currentSessionValue.id, updatedMessages);
    }
  };

  function updateChatHistory(sessionId: string, updatedMessages: Message[]) {
    const latestChatHistory = useChatStore.getState().chatHistory;
    setChatHistory(
      latestChatHistory.map(session =>
        session.id === sessionId
          ? { ...session, messages: updatedMessages }
          : session
      )
    );
  }

  const handleSelectSession = (session: ChatSession) => {
    setCurrentSession(session);
    setIsSidebarOpen(!isSidebarOpen)
  };

  const handleNewChat = () => {
    setCurrentSession(null);
  };


  function filterAssistantResponsesByModels(messages: Message[], models: LargeLanguageModel[]): Message[] {
    return messages
      .map(msg => {
        if (msg.role === "assistant") {
          const modelResponses = (msg.responses || [])
            .filter(response =>
              models.includes(response.model) &&
              response.generatedContent &&
              typeof response.generatedContent === "string" &&
              response.generatedContent.trim() !== ""
            );

          if (modelResponses.length > 0) {
            return {
              ...msg,
              content: '',
              responses: modelResponses,
            };
          }
          return null;
        }
        return msg;
      })
      .filter(Boolean) as Message[];
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        chatHistory={chatHistory}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
      />

      <div className="flex-1 flex flex-col">
        {currentSession ? (
          <>
            <ChatArea messages={currentSession.messages} />
            <div className="p-4 border-t border-border bg-white">
              <InputField onSubmit={handleNewMessage}
                defaultModels={lastSelectedModels} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-2xl px-4">
              <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
                Pateik užklausą
              </h1>
              <InputField
                onSubmit={handleNewMessage}
                defaultModels={lastSelectedModels}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
