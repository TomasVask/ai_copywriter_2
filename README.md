## Ai_copywriter_app

RAG application based on 3 models generating ads for for media channels based on knowledge base context.

## 🚀 Features

- Multi-model ad generation (OpenAI, Gemini, Claude)
- Retrieval-Augmented Generation (RAG) using a knowledge base
- Model selection: run all models or just one
- Context-aware ad creation for various media channels (Facebook, Google Ads, Email, etc.)
- Save generated ads to the knowledge base on request
- Tone matching and self-feedback for ads
- Web browsing tool for fetching information from URLs
- Adjustable AI settings (prompt strategy, temperature, top-p)
- Chat history and session management
- Download chat sessions (JSON, CSV, PDF)
- Rate limiting with Upstash
- Logging and tracing with Langsmith

---

## 📊 Architecture

copywriter_ai/
├── .gitignore
├── README.md
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── .env.local.example
├── /public
├── /src
│   ├── /components
│   │   ├── ChatArea.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── InputField.tsx
│   │   ├── Sidebar.tsx
│   │   ├── ui/
│   │   │   ├── button.tsx
│   │   │   ├── download-select.tsx
│   │   │   ├── toggle.tsx
│   ├── /models
│   │   ├── chatSession.model.ts
│   │   ├── documentMetadata.model.ts
│   │   ├── message.model.ts
│   ├── /pages
│   │   ├── _app.tsx
│   │   ├── index.tsx
│   ├── /services
│   │   ├── knowledgeBase.ts
│   │   ├── rag.ts
│   │   ├── tools.ts
│   ├── /store
│   │   ├── messageStateStore.ts
│   ├── /styles
│   │   ├── globals.css
│   ├── /system_prompts
│   │   ├── system_prompts.ts
│   ├── /utils
│   │   └── utils.ts
```

- **components/**: React UI components (chat, sidebar, buttons, etc.)
- **models/**: TypeScript models for chat sessions, messages, documents
- **pages/**: Next.js pages (entry points)
- **services/**: Business logic, RAG, tools, knowledge base integration
- **store/**: State management (e.g., Zustand)
- **styles/**: Tailwind/global CSS
- **system_prompts/**: System prompt templates for different strategies
- **utils/**: Utility/helper functions


Flow - tba.
---

## 💻 Getting Started

### Prerequisites

- Node.js 22.x or later
- API keys for OpenAI, Anthropic, Google AI, Upstash Redis, Langsmith

1. Clone the repository:

   ```bash
   git clone https://github.com/TomasVask/ai_copywriter
   cd interview-prep-app
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**

   Create a `.env.local` file in the root directory and add your API keys:

   ```env
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_anthropic_key
   GOOGLE_AI_API_KEY=your_google_key
   UPSTASH_REDIS_REST_URL=<url>
   UPSTASH_REDIS_REST_TOKEN=your_upstash_key
   LANGSMITH_TRACING=true
   LANGSMITH_ENDPOINT="https://api.smith.langchain.com"
   LANGSMITH_PROJECT=your_project_name
   LANGSMITH_API_KEY=your_langsmith_key
   ```
4. **Start the development server:**

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

# 🔧 Configuration

## 🎛 AI Settings

- **Prompt Strategy**:
  - `Chain-of-Thought`: Step-by-step reasoning
  - `Self-Refinement`: AI iterates on its own questions
  - `Maieutic`: Socratic questioning method
- **Temperature**: Controls randomness (`0.0–1.0`)
- **Top P**: Controls diversity (`0.0–1.0`)

---

# 📝 Usage

1. Describe what ad you would like create (the media channel, which company, tone of voice, etc).
2. The AI models retrieve data from knowledge base and create the ad.
3. Follow up to reiterate fro better results
4. Ask to save created ads in to the knowledge base - just ask to do it.
5. Ask to run tone matching function to self-feedback the ads to see if it matches chosen media tone of voice.
6. Toggle between models work with all 3 simultaneously or pick just one.
6. Change settings for your chat experience

---

# 👩‍💻 Further Development

## 🔌 Adding New Features

- **Save history to separate DB**
- **Add more versatile websearch tool**
- **Add CANVAS feature to each chat window**: to select wanted piece of text and follow up on that text.
- **Enhance knowledge base with Facebook ads from Facebook DB**
- **Add user authentication**
- **Improve structuring of responses**
- **Improve tone matching function**

---

# 📚 Technology Stack

- [Next.js](https://nextjs.org)
- TypeScript
- OpenAI API
- Anthropic API
- Google AI API
- Material UI
- TailwindCSS
- Zod
- Upstash - for Rate Limitting
- Langsmith - for logging

Used Lovable for design library.
---

# 📄 License

This project is licensed under the **MIT License**.