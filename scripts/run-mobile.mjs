import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';

const [platform, ...options] = process.argv.slice(2);
if (platform === '--help') {
  console.log('node scripts/run-mobile.mjs ios|android [--storage-check] [Expo start options]');
  process.exit(0);
}
if (!['ios', 'android'].includes(platform)) throw new Error('Choose ios or android');
const env = { ...process.env };
if (process.platform === 'darwin') {
  const xcode = '/Applications/Xcode.app/Contents/Developer';
  if (!env.DEVELOPER_DIR && existsSync(xcode)) env.DEVELOPER_DIR = xcode;
  const java = '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home';
  if (!env.JAVA_HOME && existsSync(java)) env.JAVA_HOME = java;
}
if (!env.ANDROID_HOME) {
  const sdk = process.platform === 'darwin' ? join(homedir(), 'Library/Android/sdk') : join(homedir(), 'Android/Sdk');
  if (existsSync(sdk)) env.ANDROID_HOME = sdk;
}
if (options.includes('--localhost') && !env.NODE_OPTIONS?.includes('--dns-result-order=')) {
  // Expo opens an IPv4 loopback URL for --localhost. Prefer IPv4 so Metro does
  // not bind only to ::1 on hosts where localhost resolves to IPv6 first.
  env.NODE_OPTIONS = [env.NODE_OPTIONS, '--dns-result-order=ipv4first'].filter(Boolean).join(' ');
}
if (options.includes('--storage-check')) env.EXPO_PUBLIC_NATIVE_STORAGE_TEST = '1';
if (platform === 'ios' && options.includes('--storage-check')) {
  // A running Expo Go can ignore a repeated openurl request for the same local
  // project. A storage smoke must start a fresh JS lifetime to be meaningful.
  spawnSync('xcrun', ['simctl', 'terminate', 'booted', 'host.exp.Exponent'],
    { env, stdio: 'ignore' });
}
if (platform === 'android' && options.includes('--storage-check') && env.ANDROID_HOME) {
  const adb = join(env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  if (existsSync(adb)) spawnSync(adb, ['shell', 'am', 'force-stop', 'host.exp.exponent'],
    { env, stdio: 'ignore' });
}
const args = options.filter(value => value !== '--storage-check');
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', `--${platform}`, ...args],
  { env, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
