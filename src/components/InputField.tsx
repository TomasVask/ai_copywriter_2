import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUp, AlertCircle } from 'lucide-react';
import { Textarea } from './ui/textarea';
import { normalizeQuery } from '@/utils/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Toggle } from './ui/toggle';
import { LargeLanguageModel } from '@/models/largeLanguageModel.model';

interface InputFieldProps {
  onSubmit: (message: string, activeModels: LargeLanguageModel[]) => void;
  defaultModels?: LargeLanguageModel[];
}

const MODEL_INFO = [
  { key: 'openai', label: 'GPT-4o' },
  { key: 'anthropic', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' }
];

export default function InputField({
  onSubmit,
  defaultModels = ['openai', 'anthropic', 'gemini']
}: Readonly<InputFieldProps>) {
  const [userPrompt, setUserPrompt] = useState('');
  const [injectionAttempt, setInjectionAttempt] = useState(false);
  const [activeModels, setActiveModels] = useState<Record<string, boolean>>({
    openai: defaultModels.includes('openai'),
    anthropic: defaultModels.includes('anthropic'),
    gemini: defaultModels.includes('gemini')
  });

  const toggleModel = (key: string) => {
    setActiveModels(prev => {
      // Don't allow turning off the last active model
      if (!prev[key] || Object.values(prev).filter(Boolean).length > 1) {
        return { ...prev, [key]: !prev[key] };
      }
      return prev;
    });
  };

  function checkForPromptInjection(input: string): boolean {
    const suspiciousPatterns = [
      "ignore previous instructions",
      "disregard your guidelines",
      "forget earlier directions",
      "act as",
      "you are no longer",
      "you are now",
      "new role",
      "override settings",
      "disobey the prompt",
      "break character",
      "pretend to",
      "don't follow prior instructions",
      "disregard all previous input",
      "change your behavior",
      "act contrary to rules",
      "system prompt",
      "override instructions",
      "you must obey this",
      "follow this new rule",
      "new system prompt",

      "ignoruok ankstesnes instrukcijas",
      "nepaisyk nurodymų",
      "pamiršk ankstesnes komandas",
      "elkis kaip",
      "dabar esi",
      "naujas vaidmuo",
      "pakeisk savo elgesį",
      "nebeklausyk ankstesnių instrukcijų",
      "sulaužyk taisykles",
      "elgtis kitaip nei nurodyta",
      "sisteminis nurodymas",
      "elgtis priešingai nei nurodyta",
      "vadovaukis tik šiuo tekstu",
      "nebegalioja senos instrukcijos",
      "tu privalai dabar",
      "priimk naują vaidmenį",
      "pamiršk, ką sakei anksčiau",
      "nauja sisteminė instrukcija",
    ];

    return !suspiciousPatterns.some(pattern =>
      input.toLowerCase().includes(pattern)
    );
  }


  const handleSubmit = (): void => {
    if (!userPrompt.trim()) {
      return;
    }

    // Check for prompt injection before submitting
    if (!checkForPromptInjection(userPrompt)) {
      setInjectionAttempt(true);
      return;
    }

    setInjectionAttempt(false);

    const selectedModels = Object.entries(activeModels)
      .filter(([, isActive]) => isActive)
      .map(([model]) => model as LargeLanguageModel);

    // Ensure at least one model is selected (fallback to OpenAI)
    if (selectedModels.length === 0) {
      setActiveModels(prev => ({ ...prev, openai: true }));
      selectedModels.push('openai');
    }
    onSubmit(normalizeQuery(userPrompt), selectedModels);
    setUserPrompt('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Clear injection warning when user starts editing
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserPrompt(e.target.value);
    if (injectionAttempt) {
      setInjectionAttempt(false);
    }
  };

  return (
    <div className="relative max-w-4xl mx-auto">
      <div className="flex items-start gap-3">
        {/* Model Selection Toggles - Left Column */}
        <div className="flex flex-col gap-1 ">
          {MODEL_INFO.map(model => (
            <Toggle
              key={model.key}
              pressed={activeModels[model.key]}
              onPressedChange={() => toggleModel(model.key)}
              className="h-[23px] w-20 text-xs font-medium transition-colors 
                         data-[state=on]:bg-primary data-[state=on]:text-primary-foreground 
                         hover:bg-accent hover:text-accent-foreground"
            >
              {model.label}
            </Toggle>
          ))}
        </div>
        {injectionAttempt && (
          <Alert variant="destructive" className="mb-3">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Negalimas turinys</AlertTitle>
            <AlertDescription>
              Jūsų užklausa panaši į bandymą apeiti sistemos instrukcijas.
              Prašome pateikti įprastą užklausą be nurodymų keisti sistemos elgesį.
            </AlertDescription>
          </Alert>
        )}
        <Textarea
          value={userPrompt}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Pateik savo reklamos užklausą čia..."
          className={`pr-12 min-h-[60px] resize-none ${injectionAttempt ? 'border-red-500' : ''}`}
          rows={3}
          maxLength={1000}
        />
        <Button
          onClick={handleSubmit}
          disabled={!userPrompt.trim()}
          size="icon"
          className="absolute bottom-2 right-2 h-8 w-8"
        >
          <ArrowUp className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};