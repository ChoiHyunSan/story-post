import { execFileSync } from 'node:child_process';
import { z } from 'zod';

const keychainService = 'story-post.authoring.openai';
const keychainAccount = process.env.USER?.trim() || 'local-author';
const apiKeySchema = z.string().trim().min(20).max(512).regex(/^sk-[A-Za-z0-9_-]+$/, 'OpenAI project API key format is invalid');

export type AiCredentialStatus = {
  configured: boolean;
  source: 'environment' | 'macos-keychain' | 'missing';
  storageAvailable: boolean;
  storageLabel: string;
  maskedKey: string | null;
};

function keychainAvailable(): boolean {
  return process.platform === 'darwin';
}

function readKeychain(): string | undefined {
  if (!keychainAvailable()) return undefined;
  try {
    const value = execFileSync('/usr/bin/security', [
      'find-generic-password', '-s', keychainService, '-a', keychainAccount, '-w',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function maskKey(value: string): string {
  const prefix = value.startsWith('sk-proj-') ? 'sk-proj-' : 'sk-';
  return `${prefix}••••${value.slice(-4)}`;
}

export function resolveOpenAiApiKey(): string | undefined {
  const environmentKey = process.env.OPENAI_API_KEY?.trim();
  return environmentKey || readKeychain();
}

export function aiCredentialStatus(): AiCredentialStatus {
  const environmentKey = process.env.OPENAI_API_KEY?.trim();
  if (environmentKey) {
    return {
      configured: true,
      source: 'environment',
      storageAvailable: keychainAvailable(),
      storageLabel: '환경변수 OPENAI_API_KEY',
      maskedKey: maskKey(environmentKey),
    };
  }
  const keychainKey = readKeychain();
  return {
    configured: Boolean(keychainKey),
    source: keychainKey ? 'macos-keychain' : 'missing',
    storageAvailable: keychainAvailable(),
    storageLabel: keychainAvailable() ? 'macOS 로그인 Keychain' : '이 운영체제에서는 환경변수만 지원',
    maskedKey: keychainKey ? maskKey(keychainKey) : null,
  };
}

export function saveOpenAiApiKey(input: unknown): AiCredentialStatus {
  if (!keychainAvailable()) throw new Error('This operating system requires OPENAI_API_KEY as an environment variable');
  const parsed = apiKeySchema.safeParse(input);
  if (!parsed.success) throw new Error('OpenAI 프로젝트 API 키 형식을 확인하세요. 키는 sk-로 시작해야 합니다.');
  const apiKey = parsed.data;
  try {
    // Passing -w last prompts on stdin, keeping the key out of process arguments and error messages.
    execFileSync('/usr/bin/security', [
      'add-generic-password', '-U', '-s', keychainService, '-a', keychainAccount, '-w',
    ], { input: `${apiKey}\n`, stdio: ['pipe', 'ignore', 'ignore'] });
  } catch {
    throw new Error('The API key could not be saved to macOS Keychain');
  }
  return aiCredentialStatus();
}

export function deleteOpenAiApiKey(): AiCredentialStatus {
  if (!keychainAvailable()) throw new Error('This operating system has no supported credential store');
  try {
    execFileSync('/usr/bin/security', [
      'delete-generic-password', '-s', keychainService, '-a', keychainAccount,
    ], { stdio: 'ignore' });
  } catch {
    // Deleting an already absent credential is idempotent.
  }
  return aiCredentialStatus();
}
