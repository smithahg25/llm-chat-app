require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await ai.models.list();
    for await (const m of res) {
      if (m.name.includes('flash') || m.name.includes('gemini')) {
         console.log(m.name, m.supportedGenerationMethods);
      }
    }
  } catch (e) {
    console.error(e);
  }
}
main();
