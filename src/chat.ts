import { OpenAIApi, CreateCompletionRequest } from 'openai';
import NodeCache from 'node-cache';

export interface ChatConf {
  /**
   * Azure OpenAI API base URL
   * @description Base URL of the OpenAI API
   * @example 'https://{instance}.openai.azure.com'
   */
  url: string;
  /**
   * OpenAI Model ID
   * @description Model ID to use
   * @see https://beta.openai.com/docs/api-reference/models
   * @example 'gpt-35-turbo'
   */
  model: string;
  /**
   * Azure OpenAI API key
   * @description API key to use
   * @example '78aeb0f3d434455384ece65d172062c0'
   */
  apiKey: string;
  /**
   * Assistant system role description
   * @example 'AI assistant to help you'
   * @description Description of the assistant role
   * @default 'AI assistant to help you'
   */
  role?: string;
  /**
   * OpenAI API version
   * @default '2022-12-01'
   * @description API version to use
   * @see https://beta.openai.com/docs/api-reference/api-versions
   */
  apiVer?: string;
  /**
   * Assistant memory size
   * @default 10
   * @description Number of messages to keep in memory / larger story -> more tokens -> higher price
   * @see https://beta.openai.com/docs/api-reference/completions/create-completion
   */
  memory?: number;
  /**
   * Get facts from message
   * @description Function to enrich facts based on processed message
   * @param text Question message
   * @returns
   */
  enrich?: (text: string) => Promise<string>;
}

export type CompletionOpts = Omit<CreateCompletionRequest, 'prompt' | 'model' | 'stop'>;

interface Message {
  sender: 'user' | 'assistant';
  text: string; // Question text to the AI or a response answer from AI
}

export class Chat {
  private role = 'AI assistant';
  private apiVer = '2022-12-01';
  private memory = 10;
  private model: string;
  private apiKey: string;
  private ai: OpenAIApi;
  private cache: NodeCache;
  private enrich: (message: string) => Promise<string>;

  constructor(conf: ChatConf) {
    if (conf.model) this.model = conf.model;
    if (conf.apiKey) this.apiKey = conf.apiKey;
    if (conf.role) this.role = conf.role;
    if (conf.memory) this.memory = conf.memory;
    if (conf.apiVer) this.apiVer = conf.apiVer;
    if (conf.enrich) this.enrich = conf.enrich;

    // Init OpenAI API, base URL is Azure specific
    const basePath = `${conf.url}/openai/deployments/${this.model}`;
    this.ai = new OpenAIApi(undefined, basePath);
    this.cache = new NodeCache({ stdTTL: 60 * 30 }); // 30 minutes
  }

  /**
   * Creates a completion API request
   * @param text Query message / question to the AI assistent
   * @param dlg The scope of the conversation / e.g. user name or room + user name, empty means no recalling the message
   * @param opts OpenAI CreateCompletionRequest completion API options (optional)
   * @returns Completion API text response
   */
  public async ask(text: string, dlg: string = '', opts: CompletionOpts = {}): Promise<string> {
    // Put/get messages to/from assistent memory
    const messages = this.setMessage(dlg, 'user', text);

    // Craft prompt for completion API
    const prompt = await this.buildPrompt(messages);

    const res = await this.ai.createCompletion(
      {
        // Defaults
        max_tokens: 500,
        temperature: 0.7,
        top_p: 0.95,
        // Overrides per request
        ...opts,
        // Core options
        prompt,
        model: this.model,
        stop: ['<|im_end|>'],
      },
      this.clientOpts()
    );

    if (res.status !== 200) throw new Error(`OpenAI API error: ${res.statusText} (${res.status})`);

    const answer = res.data.choices[0].text || '';
    answer && this.setMessage(dlg, 'assistant', answer);

    return answer;
  }

  // Constructs completion API prompt from messages
  // Enriches prompt with facts if `enrich` callback if provided
  private async buildPrompt(messages: Message[]): Promise<string> {
    const text = messages[messages.length - 1].text;
    const searchQuery = await this.extractSearchQuery(text); // Extract search query from message using AI
    const facts = this.enrich ? await this.enrich(searchQuery || text) : ''; // so enrichment gets a shorter deterministic text

    let prompt = `<|im_start|>system\n${this.role}`;
    if (facts) prompt += `\n\nFacts:\n${facts.trim()}`;
    prompt + `\n<|im_end|>`;

    for (const message of messages) {
      prompt += `\n<|im_start|>${message.sender}\n${message.text}\n<|im_end|>`;
    }

    prompt += '\n<|im_start|>assistant\n';
    return prompt;
  }

  // Sets mesage to assistent memory and retrieves current messages
  // Which are sent to OpenAI completion API to "remember" dialog context
  private setMessage(scope: string = '', sender: 'user' | 'assistant', text: string): Message[] {
    const message: Message = { sender, text };
    if (!scope) return [message]; // Empty scope will ignore assistent memory

    const messages: Message[] = this.cache.get(scope) || [];
    messages.push(message);

    if (messages.length > this.memory) messages.shift(); // Trim memory to max size if exceeds
    this.cache.set(scope, messages);

    return messages;
  }

  // Auth binding for Azure OpenAI API and API version conf
  private clientOpts() {
    return {
      headers: { 'api-key': this.apiKey },
      params: { 'api-version': this.apiVer },
    };
  }

  // A sample of using AI for utility under the hood purposes
  // It can't be a stable predictable result all the time though
  private async extractSearchQuery(text: string): Promise<string> {
    const res = await this.ai.createCompletion(
      {
        max_tokens: 50, // Shorter answer as we need a query to a search engine
        temperature: 0.2, // More deterministic answer
        prompt:
          `<|im_start|>system\nSearch assistant\n<|im_end|>\n` +
          `<|im_start|>user\nExtract search query from:\n${text}\n<|im_end|>\n` +
          `<|im_start|>assistant\n`,
        model: this.model,
        stop: ['<|im_end|>'],
      },
      this.clientOpts()
    );

    if (res.status !== 200) throw new Error(`OpenAI API error: ${res.statusText} (${res.status})`);

    const answer = res.data.choices[0].text || '';

    // Tune this conditions based on your experience
    if (answer.includes(`I'm sorry, but`) || answer.includes(`is not a valid search query`)) {
      return '';
    }

    return answer;
  }
}
