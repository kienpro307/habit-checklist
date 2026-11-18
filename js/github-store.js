// data.json in a private GitHub repo, read and written with the GitHub contents API.
// Edits are queued and saved one at a time. When the other phone saved in between (sha
// conflict), the file is reloaded and the edit re-applied (edits are idempotent).

import { emptyData } from "./rules.js";

const decode = (b64) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
const encode = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};
const clone = (obj) => JSON.parse(JSON.stringify(obj));

export class GitHubStore {
  constructor({ owner, repo, path, token, fetchImpl = fetch.bind(globalThis) }) {
    this.url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    this.token = token;
    this.fetch = fetchImpl;
    this.server = null; // { data, sha } as last read or written
    this.pending = []; // edits not saved yet
    this.saving = null;
    this.onChange = () => {};
    this.onStatus = () => {};
  }

  headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  // What the page shows: the saved data plus edits still being saved.
  view() {
    const data = clone(this.server ? this.server.data : emptyData());
    this.pending.forEach((op) => op(data));
    return data;
  }

  async load() {
    const res = await this.fetch(this.url, { headers: this.headers(), cache: "no-store" });
    if (res.status === 404) {
      this.server = { data: emptyData(), sha: null };
    } else if (!res.ok) {
      throw new Error(res.status === 401 ? "Mã truy cập sai hoặc hết hạn" : `GitHub ${res.status}`);
    } else {
      const body = await res.json();
      this.server = { data: JSON.parse(decode(body.content)), sha: body.sha };
    }
    this.onChange();
  }

  // Refresh from GitHub unless an edit is on its way (it would be shown as undone for a moment).
  async refresh() {
    if (!this.pending.length && !this.saving) await this.load();
  }

  apply(op) {
    this.pending.push(op);
    this.onChange();
    return this.kick();
  }

  // Start saving unless a save run is going; it picks up edits added while it runs.
  kick() {
    if (this.saving) return this.saving;
    this.saving = this.drain().then((ok) => {
      this.saving = null;
      this.onChange();
      // "saved" only once nothing is running, so an edit made from the callback starts a new run
      if (ok) this.onStatus(this.pending.length ? "saving" : "saved");
      if (this.pending.length) return this.kick();
    });
    return this.saving;
  }

  async drain() {
    this.onStatus("saving");
    try {
      while (this.pending.length) {
        await this.saveOne(this.pending[0]);
        this.pending.shift();
      }
      return true;
    } catch (err) {
      this.pending = [];
      this.onStatus("error", err);
      await this.load().catch(() => {});
      return false;
    }
  }

  async saveOne(op) {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!this.server) await this.load();
      const data = clone(this.server.data);
      op(data);
      const res = await this.fetch(this.url, {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify({
          message: "update checklist",
          content: encode(JSON.stringify(data, null, 1)),
          ...(this.server.sha ? { sha: this.server.sha } : {}),
        }),
      });
      if (res.ok) {
        const body = await res.json();
        this.server = { data, sha: body.content.sha };
        return;
      }
      if (res.status !== 409 && res.status !== 422) {
        throw new Error(res.status === 401 ? "Mã truy cập sai hoặc hết hạn" : `GitHub ${res.status}`);
      }
      await this.load(); // the other phone saved first: start again from its version
    }
    throw new Error("Không lưu được, thử lại sau");
  }
}
