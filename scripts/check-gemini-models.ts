import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

// 1. Read API Key from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
let apiKey = process.env.GEMINI_API_KEY || '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/GEMINI_API_KEY=(.+)/);
  if (match) {
    apiKey = match[1].trim().replace(/^["']|["']$/g, '');
  }
}

if (!apiKey) {
  console.error('❌ No GEMINI_API_KEY found in process.env or .env.local');
  process.exit(1);
}

console.log('================================================================');
console.log(`🔑 Using GEMINI_API_KEY: ${apiKey.substring(0, 8)}...${apiKey.slice(-6)}`);
console.log('================================================================\n');

const ai = new GoogleGenAI({ apiKey });

interface TestResult {
  model: string;
  success: boolean;
  durationMs: number;
  response?: string;
  error?: string;
  statusCode?: number;
}

const MODELS_TO_TEST = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-pro',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
];

async function runDiagnostic() {
  console.log(`🔍 Probing ${MODELS_TO_TEST.length} models for generateContent support...\n`);
  const results: TestResult[] = [];

  for (const model of MODELS_TO_TEST) {
    const start = performance.now();
    process.stdout.write(`⏳ Testing model: "${model}" ... `);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: 'Say OK',
      });
      const durationMs = Math.round(performance.now() - start);
      const text = response.text?.trim() || '';

      console.log(`✅ SUCCESS (${durationMs}ms) -> "${text}"`);
      results.push({
        model,
        success: true,
        durationMs,
        response: text,
      });
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      const status = err?.status || err?.statusCode || (err?.message?.includes('404') ? 404 : err?.message?.includes('429') ? 429 : 500);
      let shortErrMsg = err?.message || String(err);
      
      try {
        const parsed = JSON.parse(shortErrMsg);
        if (parsed?.error?.message) {
          shortErrMsg = `[${parsed.error.code || status}] ${parsed.error.message}`;
        }
      } catch {
        // use raw message
      }

      console.log(`❌ FAILED (${durationMs}ms) [HTTP ${status}] -> ${shortErrMsg.substring(0, 100)}...`);
      results.push({
        model,
        success: false,
        durationMs,
        error: shortErrMsg,
        statusCode: status,
      });
    }
  }

  console.log('\n================================================================');
  console.log('📊 DIAGNOSTIC SUMMARY');
  console.log('================================================================');

  const successful = results.filter(r => r.success).sort((a, b) => a.durationMs - b.durationMs);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Working Models (${successful.length}/${results.length}):`);
  successful.forEach((r, idx) => {
    console.log(`  ${idx + 1}. "${r.model}" — ${r.durationMs}ms (Response: "${r.response}")`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Inactive / Errored Models (${failed.length}):`);
    failed.forEach(r => {
      console.log(`  • "${r.model}" — HTTP ${r.statusCode || 'Err'}: ${r.error}`);
    });
  }

  return { successful, failed };
}

runDiagnostic();
