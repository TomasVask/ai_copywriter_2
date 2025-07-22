import { ModelResponseAction } from "@/enums/modelResponseAction.enum";
import { LargeLanguageModel } from "@/models/largeLanguageModel.model";
import { Message } from "@/models/message.model";

interface ChatMessageProps {
  message: Message;
  modelKey: string;
  isLatestAssistantMessage: boolean;
}

export function ChatMessage({
  message,
  modelKey,
  isLatestAssistantMessage
}: Readonly<ChatMessageProps>) {
  if (modelKey && !message.activeModels?.includes(modelKey as LargeLanguageModel)) {
    return null;
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end relative">
        <div className="p-3 rounded-lg text-sm max-w-[95%] bg-accent text-right text-accent-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  const modelResponse = message.responses?.find(r => r.model === modelKey);
  const hasError = modelResponse?.error?.startsWith("❌");
  const isLoading = modelResponse?.loading;
  const hasContent = modelResponse?.taskSummary || modelResponse?.generatedContent;

  if (!modelResponse && !isLatestAssistantMessage && !isLoading && !hasContent) {
    return null;
  }

  const parsedGeneratedContent = modelResponse?.generatedContent ? JSON.parse(modelResponse.generatedContent) : null;
  console.log("Parsed Generated Content:", parsedGeneratedContent);
  return (
    <div className="flex justify-start relative">
      <div className="p-3 rounded-lg text-sm max-w-[95%] bg-gray-50">
        {/* Error state */}
        {hasError && (
          <div className="text-red-500">{modelResponse?.error}</div>
        )}

        {/* creating taskSummary */}
        {isLoading && !modelResponse?.taskSummary && (
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
            <span className="text-blue-500 font-medium">Renku informaciją...</span>
          </div>
        )}

        {/* Task Summary Section */}
        {(modelResponse?.taskSummary) && (
          <div className="mb-3">
            <div className="font-medium text-xs text-gray-500 mb-1">SUMMARY</div>
            <div>
              {modelResponse?.taskSummary}
            </div>
          </div>
        )}

        {/* Creating generatedAd */}
        {modelResponse?.taskSummary && !modelResponse?.generatedContent &&
          (modelResponse.action === ModelResponseAction.Generating) && (
            <div className="flex items-center gap-2 mt-2 pb-4">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
              <span className="text-blue-500 font-medium">Kuriu reklamą...</span>
            </div>
          )}

        {/* Generated Content Section */}
        {modelResponse?.generatedContent && !hasError && (
          <div className="mt-3">
            <div>
              {parsedGeneratedContent?.adText && (
                <div className="bg-gray-200 rounded-lg py-1 px-2 font-light">
                  <div className="font-medium text-xs text-gray-500 mb-1">REKLAMINIS TURINYS</div>
                  {parsedGeneratedContent.adText}
                </div>)
              }
              {parsedGeneratedContent?.otherText && parsedGeneratedContent.otherText}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}