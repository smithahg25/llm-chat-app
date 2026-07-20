import { InstrumentLLM } from './llm';

describe('InstrumentLLM', () => {
  describe('PII Redaction', () => {
    it('should redact email addresses', () => {
      const input = "Contact me at user@example.com for more info.";
      const result = InstrumentLLM.redactPII(input);
      expect(result).toBe("Contact me at [REDACTED_EMAIL] for more info.");
    });

    it('should redact phone numbers', () => {
      const input = "My phone is 555-123-4567 today.";
      const result = InstrumentLLM.redactPII(input);
      expect(result).toBe("My phone is [REDACTED_PHONE] today.");
    });
    
    it('should handle mixed text without PII', () => {
      const input = "Just a normal prompt asking about quantum physics.";
      const result = InstrumentLLM.redactPII(input);
      expect(result).toBe(input);
    });
  });
});
