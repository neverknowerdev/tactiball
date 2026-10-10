// End-to-end smoke test against a deployed backend: two bot wallets sign in,
// create teams, get paired by quick match, play a few turns and one gives up.
//
//   npm --prefix frontend run bindings   # once, generates the Candid IDL
//   node frontend/scripts/smoke.mjs --host http://localhost:8000 --canister <backend id>
//   node frontend/scripts/smoke.mjs --host https://icp-api.io --canister <backend id>
import { Actor, HttpAgent } from '@icp-sdk/core/agent';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { idlFactory } from '../lib/bindings/declarations/backend.did.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const host = args.host ?? 'http://localhost:8000';
const canisterId = args.canister ?? process.env.BACKEND_CANISTER_ID;
const domain = args.domain ?? 'localhost';
if (!canisterId) throw new Error('pass --canister <backend canister id>');
const local = host.includes('localhost') || host.includes('127.0.0.1');

const ok = (r) => {
  if ('Err' in r) throw new Error(r.Err);
  return r.Ok;
};

async function bot(name) {
  const identity = Ed25519KeyIdentity.generate();
  const agent = await HttpAgent.create({ host, identity, shouldFetchRootKey: local });
  const actor = Actor.createActor(idlFactory, { agent, canisterId });
  const wallet = privateKeyToAccount(generatePrivateKey());
  return { name, actor, wallet };
}

async function signIn(b, chainId) {
  const prepared = ok(await b.actor.auth_prepare({ address: b.wallet.address, chain_id: chainId, domain }));
  const signature = await b.wallet.signMessage({ message: prepared.message });
  const session = ok(await b.actor.auth_login(signature));
  console.log(`${b.name}: signed in as user ${session.user.id} (${session.user.home_chain})`);
}

const keeper = (x) => [{ player_id: 0, move_type: { Tackle: null }, from: { x, y: 5 }, to: { x, y: 5 } }];

const settings = await (await bot('probe')).actor.get_settings();
const chains = settings.chains.filter((c) => c.enabled).map((c) => c.chain_id);
console.log('chains:', chains.map(String).join(', '), '| allowed domains:', settings.allowed_domains.join(', ') || '(any)');

const a = await bot('alice');
const b = await bot('bob');
await signIn(a, chains[0]);
await signIn(b, chains[chains.length - 1]);
const tag = Math.random().toString(36).slice(2, 7);
ok(await a.actor.create_team(`Bot A ${tag}`, 0));
ok(await b.actor.create_team(`Bot B ${tag}`, 0));

ok(await a.actor.join_queue());
const paired = ok(await b.actor.join_queue());
if (!paired.length) throw new Error('quick match did not pair the bots');
const gameId = paired[0];
console.log(`game ${gameId} started`);

for (let turn = 1; turn <= 3; turn++) {
  ok(await a.actor.commit_moves(gameId, turn, keeper(1)));
  const r = ok(await b.actor.commit_moves(gameId, turn, keeper(15)));
  if (!r.resolved) throw new Error(`turn ${turn} did not resolve`);
  console.log(`turn ${turn} resolved, score ${r.game.score1}:${r.game.score2}`);
}
const turns = await a.actor.get_turns(gameId, 1, 10);
console.log(`history has ${turns.length} turns; seed of turn 1: ${Buffer.from(turns[0].seed).toString('hex').slice(0, 16)}…`);

const end = ok(await b.actor.surrender(gameId));
console.log(`bob gave up: status ${Object.keys(end.status)[0]}, ${end.score1}:${end.score2}`);
const health = await a.actor.health();
console.log(`health: v${health.version}, users ${health.users}, entropy ready ${health.entropy_ready}, cycles ${health.cycles}`);
console.log('smoke test passed');
