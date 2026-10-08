// ═══════════════════════════════════════════════════════════════
//  DEV FRESH — démarrage propre du backend sous Windows
//  1. Tue tout process node qui écoute sur le port 3000 (zombies
//     avec du code périmé = cause n°1 des « routes ne passent pas »)
//  2. Démarre le serveur (ts-node direct, sans cache ts-node-dev)
//  Usage : npm run dev:fresh
// ═══════════════════════════════════════════════════════════════

const { execSync, spawn } = require('child_process');

const PORT = process.env.PORT || '3000';

function pidsOnPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { shell: 'cmd.exe' }).toString();
    return [...new Set(out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
  } catch {
    return []; // findstr échoue (no match) quand le port est libre
  }
}

const pids = pidsOnPort(PORT);
if (pids.length) {
  console.log(`🧹 Port ${PORT} occupé par : ${pids.join(', ')} — arrêt forcé…`);
  for (const pid of pids) {
    try { execSync(`taskkill /F /PID ${pid}`, { shell: 'cmd.exe', stdio: 'ignore' }); }
    catch { /* déjà parti */ }
  }
  console.log('✅ Process zombies tués.');
} else {
  console.log(`✅ Port ${PORT} libre.`);
}

// Petit délai pour libérer le socket (TIME_WAIT) — sleep natif node
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, true, 2000);

console.log('🚀 Démarrage du backend (ts-node, sans cache)…');
const child = spawn(
  'npx', ['ts-node', '--transpile-only', '-r', 'tsconfig-paths/register', 'src/server.ts'],
  { stdio: 'inherit', shell: true, env: { ...process.env, PORT } },
);
child.on('exit', (code) => process.exit(code ?? 0));
