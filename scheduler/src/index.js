/**
 * Cloudflare cron -> GitHub "run workflow" (workflow_dispatch).
 * One cron per job; the mapping lives in JOBS so wrangler.toml and code stay in sync.
 */
export const JOBS = {
  '41 */2 * * *': 'post.yml',
  '17 */4 * * *': 'deals.yml',
};

export async function dispatch(workflow, env, fetchImpl = fetch) {
  const token = (env.GH_TOKEN || '').trim();  // a pasted secret often carries a stray newline
  if (!token) throw new Error('GH_TOKEN secret is not set');
  const url = `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${workflow}/dispatches`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'cartcrush-scheduler',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: env.GH_REF || 'main' }),
    });
    if (res.status === 204) return { workflow, attempt };
    const detail = (await res.text()).slice(0, 300);
    // 401/403/404/422 = config problem (token, permission, file name): retrying won't help.
    if (res.status === 401) {
      throw new Error(`${workflow}: GitHub 401 Bad credentials. Re-create GH_TOKEN (fine-grained, this repo, Actions: Read and write) and save it again`);
    }
    if (res.status < 500 && res.status !== 429) throw new Error(`${workflow}: GitHub ${res.status} ${detail}`);
    if (attempt === 3) throw new Error(`${workflow}: GitHub ${res.status} after 3 tries ${detail}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

export default {
  async scheduled(event, env, ctx) {
    const workflow = JOBS[event.cron];
    if (!workflow) {
      console.error(`no job for cron "${event.cron}"`);
      return;
    }
    const result = await dispatch(workflow, env);
    console.log(`dispatched ${result.workflow} (attempt ${result.attempt})`);
  },
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
