import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from '../logger';

dotenv.config();

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy' });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'dummy' });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy' });

export interface GenerateChatOptions {
  model?: string;
  provider?: string;
  messages: { role: string; content: string }[];
  conversationId?: string;
  correlationId?: string;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: string) => void;
}

export class InstrumentLLM {
  private static ingestUrl = `http://localhost:${process.env.PORT || 3001}/ingest`;

  static redactPII(text: string): string {
    return text
      .replace(/\b[\w.-]+@[\w.-]+\.\w{2,4}\b/gi, '[REDACTED_EMAIL]')
      .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED_PHONE]');
  }

  static async generateChat({ model = 'gemini-2.0-flash', provider = 'gemini', messages, conversationId, correlationId, abortSignal, onChunk }: GenerateChatOptions) {
    const timestamp = new Date();
    const requestId = correlationId || uuidv4();
    const sessionId = uuidv4();
    const startTime = Date.now();
    const cId = conversationId || uuidv4();
    const lastMessage = messages[messages.length - 1]?.content || '';
    const requestPreview = this.redactPII(lastMessage.substring(0, 150));

    let success = false;
    let statusStr = 'failure';
    let responseText = '';
    let responsePreview = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let errorMsg = null;

    try {
      if (provider === 'openai') {
        const mappedMessages = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        if (onChunk) {
           const stream = await openai.chat.completions.create({
             model: model || 'gpt-4o-mini',
             messages: mappedMessages,
             stream: true,
           }, { signal: abortSignal });
           for await (const chunk of stream) {
             if (abortSignal?.aborted) {
               statusStr = 'cancelled';
               break;
             }
             const content = chunk.choices[0]?.delta?.content || '';
             responseText += content;
             onChunk(content);
           }
        } else {
           const res = await openai.chat.completions.create({
             model: model || 'gpt-4o-mini',
             messages: mappedMessages,
           });
           responseText = res.choices[0]?.message?.content || '';
           promptTokens = res.usage?.prompt_tokens || 0;
           completionTokens = res.usage?.completion_tokens || 0;
        }
      } else if (provider === 'groq') {
        const mappedMessages = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        if (onChunk) {
           const stream = await groq.chat.completions.create({
             model: model || 'llama-3.3-70b-versatile',
             messages: mappedMessages,
             stream: true,
           }, { signal: abortSignal });
           for await (const chunk of stream) {
             if (abortSignal?.aborted) {
               statusStr = 'cancelled';
               break;
             }
             const content = chunk.choices[0]?.delta?.content || '';
             responseText += content;
             onChunk(content);
           }
        } else {
           const res = await groq.chat.completions.create({
             model: model || 'llama-3.3-70b-versatile',
             messages: mappedMessages,
           });
           responseText = res.choices[0]?.message?.content || '';
           promptTokens = res.usage?.prompt_tokens || 0;
           completionTokens = res.usage?.completion_tokens || 0;
        }
      } else if (provider === 'anthropic') {
        const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
        const userAndAssistant = messages.filter(m => m.role !== 'system').map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
        }));
        
        if (onChunk) {
           const stream = await anthropic.messages.create({
             model: model || 'claude-3-haiku-20240307',
             max_tokens: 1024,
             messages: userAndAssistant,
             ...(systemMessages ? { system: systemMessages } : {}),
             stream: true,
           }, { signal: abortSignal });
           for await (const event of stream) {
             if (abortSignal?.aborted) {
               statusStr = 'cancelled';
               break;
             }
             if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
               responseText += event.delta.text;
               onChunk(event.delta.text);
             }
           }
        } else {
           const res = await anthropic.messages.create({
             model: model || 'claude-3-haiku-20240307',
             max_tokens: 1024,
             messages: userAndAssistant,
             ...(systemMessages ? { system: systemMessages } : {}),
           });
           if (res.content[0]?.type === 'text') {
             responseText = res.content[0].text;
           }
           promptTokens = res.usage.input_tokens || 0;
           completionTokens = res.usage.output_tokens || 0;
        }
      } else {
        const contents = messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
        if (onChunk) {
           const resStream = await gemini.models.generateContentStream({
             model: model || 'gemini-2.5-flash',
             contents
           });
           for await (const chunk of resStream) {
             if (abortSignal?.aborted) {
               statusStr = 'cancelled';
               break;
             }
             responseText += chunk.text || '';
             onChunk(chunk.text || '');
           }
        } else {
           const res = await gemini.models.generateContent({
             model: model || 'gemini-2.5-flash',
             contents
           });
           responseText = res.text || '';
           promptTokens = res.usageMetadata?.promptTokenCount || 0;
           completionTokens = res.usageMetadata?.candidatesTokenCount || 0;
        }
      }

      responsePreview = this.redactPII(responseText.substring(0, 150));
      totalTokens = promptTokens + completionTokens;
      success = true;
      if (statusStr === 'failure') statusStr = 'success';
    } catch (error: any) {
      success = false;
      errorMsg = error.message;
      if (error.name === 'AbortError' || abortSignal?.aborted) {
        statusStr = 'cancelled';
        errorMsg = 'Request was cancelled';
      } else {
        logger.error({ err: error, requestId }, `LLM generation failed for ${provider}`);
      }
    }

    const latency = Date.now() - startTime;

    const logPayload = {
      requestId,
      sessionId,
      conversationId: cId,
      provider,
      model,
      latency,
      promptTokens,
      completionTokens,
      totalTokens,
      status: statusStr,
      error: errorMsg,
      requestPreview,
      responsePreview,
      timestamp
    };

    axios.post(this.ingestUrl, logPayload).catch(err => {
      logger.error({ err }, 'Failed to ingest log');
    });

    if (!success && statusStr !== 'cancelled') {
      throw new Error(errorMsg || 'LLM generation failed');
    }

    return { text: responseText, conversationId: cId, usage: { promptTokens, completionTokens, totalTokens } };
  }
}
