export interface GenerateChatOptions {
    model?: string;
    provider?: string;
    messages: {
        role: string;
        content: string;
    }[];
    conversationId?: string;
    correlationId?: string;
    abortSignal?: AbortSignal;
    onChunk?: (chunk: string) => void;
}
export declare class InstrumentLLM {
    private static ingestUrl;
    static redactPII(text: string): string;
    static generateChat({ model, provider, messages, conversationId, correlationId, abortSignal, onChunk }: GenerateChatOptions): Promise<{
        text: string;
        conversationId: string;
        usage: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        };
    }>;
}
//# sourceMappingURL=llm.d.ts.map